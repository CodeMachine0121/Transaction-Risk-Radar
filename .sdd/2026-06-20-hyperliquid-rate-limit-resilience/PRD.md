# Product Requirements Document (PRD) — Hyperliquid Rate-Limit Resilience

**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering, QA
**Brief:** `.sdd/2026-06-20-hyperliquid-rate-limit-resilience/BRIEF.md`

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:** 背景 worker 啟動即跑一輪後，對 leaderboard 上 ~200 位交易員連續呼叫 Hyperliquid `/info`（`clearinghouseState` + `userFillsByTime`），遠超 per-IP 的 weight 預算，導致大量 **HTTP 429**。`fetchUserFills` 多數失敗 → 交易員 `closedPositionCount` 不足、被標記 `insufficientData`，故 `/rankings` 始終為空。問題本質是**請求總 weight 超出 per-IP 預算**，非單純「打太快」。
- **Expected Outcome:**
  - 一輪完整輪詢（sync → poll → recompute）**不再出現 429**（或僅偶發並由退避自動吸收）。
  - 請求量大幅下降：fills 改增量抓取後，穩態下每輪 `userFillsByTime` 回傳列數趨近 0~少量。
  - `/rankings` 能累積出 `closedPositionCount ≥ minimumClosedPositions` 的可排行交易員（不再全空）。
- **Out of Scope:**
  - **Redis 共享限流器**（支援多 worker 行程 / 多 IP）——v1 僅單一 worker，列為未來項。
  - domain 指標計算公式與充血 entity 邏輯（不變）。
  - REST 對外行為：controller / application 與 `/rankings`、`/traders/:address` 介面契約不變。
  - leaderboard GET 不納入 weight 預算（僅對其做 429 退避）。

---

## 2. User Personas

- **Primary Role(s):** **系統（背景 worker）**——本功能為基礎設施韌性，無終端使用者直接互動；間接受益者為查詢 `/rankings`／`/traders/:address` 的散戶（資料終於有內容）。
- **Usage Context:** 持續於 VPS 上以 BullMQ 排程運行的 worker 行程（單一行程、單一對外 IP）；對 Hyperliquid 官方 REST API 發出讀取請求。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-A1** | **As a** 系統, **I want** 每個 `/info` 請求送出前依其 `requestWeight` 受限流，**so that** 總請求 weight 結構性地壓在 per-IP `requestWeightBudget` 內，不再觸發 429。 | 1. `throttleByRequestWeight` 以 token bucket 實作，桶容量＝預算、以預算速率回填<br>2. `clearinghouseState`／`userFillsByTime` 各依其 weight 取 token<br>3. 額度不足時 **block-and-wait** 直到回填，**不丟棄**請求<br>4. 限流器**注入 clock**，單元測試以假時間驗證節流、不依賴真實等待 | P0 |
| **US-A2** | **As a** 系統, **I want** 收到 HTTP 429 時自動退避重試，**so that** 偶發超量不會讓該次輪詢直接失敗。 | 1. `retryWithBackoffOnTooManyRequests`：讀 `Retry-After`（若有）否則 exponential backoff + jitter<br>2. 達最大重試次數仍失敗才 throw（交由 scheduler 的 per-trader 隔離回報）<br>3. 非 429 的錯誤維持原行為（直接 throw）<br>4. backoff 等待透過注入 clock 測試 | P0 |
| **US-B1** | **As a** 系統, **I want** 以 high-watermark 增量抓取成交，**so that** 不再每輪重抓近 90 天全窗，請求量與回傳列數大幅下降。 | 1. poll 前取該交易員 `latestObservedFillTimestamp`（由 `PositionFill.max(occurredAt)` 推導）<br>2. 有值 → `fetchUserFills` 的 `startTime` 帶該值；無值 → 退回首次 `POLL_LOOKBACK_MS`<br>3. **不新增** fill 時間欄位（沿用既有索引）<br>4. 既有 `tradeId` 去重不變，重抓重疊區間不重複計算（idempotency） | P0 |
| **US-B2** | **As a** 系統, **I want** 依 `traderPollingTier` 分層輪詢交易員，**so that** 高排名交易員更新勤、長尾鬆，平攤 weight 負載。 | 1. `synchronizeLeaderboard` 依 `accountValue` 決定並持久化每位交易員的 tier<br>2. `scheduler` 依 tier 以不同 interval 排程 poll（高排名勤、長尾鬆）<br>3. 單一交易員失敗仍維持 per-trader 隔離（不中斷整批）<br>4. 具體層數與各層 interval 為可設定值（見開放項） | P1 |

---

## 4. Business Flow & Logic

### Flow Diagram

```
[Phase A — 每個 /info 請求]
  postInfo(request)
     │  throttleByRequestWeight(weight)   ← 取 token，不足則 block-and-wait
     ▼
  fetch /info
     │  status 429 ? ── yes ─▶ retryWithBackoffOnTooManyRequests (Retry-After / backoff+jitter) ─┐
     │                                                                                            │
     └── ok ─▶ normalize ─▶ return                                       (達上限仍失敗 → throw) ◀┘

[Phase B — 每輪 poll]
  synchronizeLeaderboard ──▶ traders (+ traderPollingTier，依 accountValue)
     │
     ▼ (依 tier 分層排程：高排名勤、長尾鬆)
  pollTraderFillsSinceLatest:
     startTime = latestObservedFillTimestamp(trader)  // = max(occurredAt)；無則首次 lookback
     fetchUserFills(address, startTime) ─▶ saveFills (tradeId 去重)
```

### Core Business Rules

- **限流落點（DIP）：** 限流與退避只裝在 infrastructure 的 `hyperliquidProxy.postInfo`（所有 `/info` 請求的唯一咽喉點），domain 完全無感。
- **weight 制：** `requestWeightBudget` 為 per-IP aggregate（約 1200 weight/分鐘，數值待校準）；token bucket 容量＝預算、回填速率＝預算/60s。
- **block-and-wait：** 預算耗盡時請求排隊等回填，不丟棄——背景 worker 容忍延遲，且天然配合分層輪詢攤平負載。
- **leaderboard 例外：** 走 `statsDataBaseUrl` 的 GET、每輪僅一次；**不計 weight**，但 429 時仍適用退避。
- **high-watermark：** `startTime = latestObservedFillTimestamp`，由 `PositionFill.max(occurredAt)` 即時推導（既有索引 `[traderAddress, coin, occurredAt]`），不持久化額外欄位；首次（無歷史）退回 `POLL_LOOKBACK_MS`。
- **idempotency 不變：** fills 以 `tradeId` (PK) 去重；增量重疊區間重抓不重複計算。
- **分層持久化：** tier 隨 `synchronizeLeaderboard` 依 `accountValue` 寫入；scheduler 依 tier 取不同 interval。

### Edge Cases

- **首次輪詢無任何成交：** `latestObservedFillTimestamp` 無值 → 退回首次 `POLL_LOOKBACK_MS` 全窗。
- **429 持續不退：** 退避達最大重試次數仍失敗 → throw，交由 scheduler 既有 per-trader 隔離（`onTraderError`）回報，不中斷整批。
- **預算長時間滿載：** block-and-wait 可能拉長單輪耗時；是否需單輪時間上限保護見開放項。
- **leaderboard 抓取失敗：** 沿用既有「啟動初始輪 sync 失敗只回報不中斷、下一 interval 重試」。
- **time skew / `Retry-After` 缺失：** 無 `Retry-After` 時回退到 exponential backoff + jitter。

---

## 5. UI/UX Design & Interaction

- **N/A** — 純後端基礎設施，無 UI。可觀測性以 worker 結構化 log 呈現（限流等待、429 退避、增量抓取列數）。

---

## 6. Non-Functional Requirements

- **Performance / 正確性：** 穩態下一輪完整輪詢不出現未被退避吸收的 429；fills 增量化後每輪回傳列數顯著下降。
- **可測試性（強制）：** 限流器與退避**注入 clock 與 fetch**，單元測試不得依賴真實 `sleep`／網路；遵循專案測試策略（mock 最外層介面、`vi.fn`）。
- **數值精度：** 沿用 `bigint` + `decimal.js`，時間戳以毫秒整數處理。
- **可設定：** weight 預算、backoff 參數、各 tier interval 由環境變數提供（`.env.example` 同步）。
- **Analytics / Tracking：** 無外部追蹤；以 log 計數限流等待次數、429 退避次數、各 tier 輪詢量。

---

## 7. Dependencies & Risks

- **External Dependencies:** Hyperliquid 官方 REST API（`/info`：`clearinghouseState`、`userFillsByTime`；`stats-data`：leaderboard）。
- **Known Risks:**
  - **weight 數值不確定**：官方 weight／預算曾多次調整，**動工前需對 docs 校準**；數值錯誤會讓限流過寬（仍 429）或過嚴（吞吐過低）。
  - **多 worker 擴展**：in-process 限流器在水平擴展（多行程/多 IP）下失效，需改 Redis 共享——已列 out of scope，但需在程式邊界預留替換空間。
  - **tier 持久化方式**未定（`Trader` 新增欄位 vs 獨立表），影響 schema migration。

---

## 8. Appendix — Open Decisions（待 sdd-arch / 校準）

- 確切 `requestWeightBudget` 數值與各 `/info` 請求 weight（對 Hyperliquid 官方 docs 校準）。
- backoff 參數：基數、上限、最大重試次數、jitter 範圍。
- 分層輪詢的**層數**與**各層 interval**；tier 持久化方式（`Trader` 欄位 vs 獨立表）。
- 預算耗盡時**單輪最長耗時**是否需上限保護。
- 相關文件：主 PRD `.sdd/2026-06-19-trader-risk-radar/PRD.md`（§4 排程行為、§6 開放項「分層輪詢具體間隔與 rate-limit 預算」）；`.sdd/UL-MAP.md`（已新增 `requestWeight`、`requestWeightBudget`、`traderPollingTier`、`latestObservedFillTimestamp`、`throttleByRequestWeight`、`retryWithBackoffOnTooManyRequests`、`pollTraderFillsSinceLatest`）。
