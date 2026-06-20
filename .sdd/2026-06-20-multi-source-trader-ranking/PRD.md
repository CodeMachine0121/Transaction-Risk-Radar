# Product Requirements Document (PRD) — Multi-Source Trader Ingestion & Unified Risk Ranking

**Feature:** 多資料源攝取 + 統一風險排行（資料層）
**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering（solo）
**Brief:** `.sdd/2026-06-20-multi-source-trader-ranking/BRIEF.md`

> 命名慣例：所有程式識別字一律全名、禁止縮寫（見 `.sdd/UL-MAP.md`）。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:** 第一版只接 Hyperliquid，分析的交易員池被單一場所綁死、樣本窄。要往「**provider-agnostic 的聰明錢部位/方向訊號**」演進，必須先有一個**可多源攝取**的資料地基；同時新增來源不能犧牲招牌指標——**攤平偵測**。先前認為 CEX 無法算攤平，但查證後發現 **OKX 以 per-open-order 的 sub-position 記錄**，分批加倉會呈現多筆、可重建加倉路徑，故 OKX 仍能算攤平。
- **Expected Outcome:**
  - 資料來源層一般化：新增任一場所只需新增一個 Proxy + 正規化，domain 指標邏輯不動。
  - 接上**第二來源 OKX**，與 Hyperliquid 並存；以 `(provider, address)` 唯一識別。
  - 兩來源都產出含攤平的完整指標，輸出一份帶 `provider` 的統一 risk-ranked trader list。
  - 成功標準：`/rankings` 能同時回傳 Hyperliquid 與 OKX 的交易員（各帶 provider），且兩者皆有 `averagingDownRatio`。
- **Out of Scope:**
  - **provider-agnostic 市場/部位「訊號」層（B）**——後續 feature。
  - 幣安及其他 CEX（官方無公開取得他人帶單員資料的 API → 只能 scraping）。
  - 其他鏈上場所（dYdX / GMX / Drift）——未來。
  - 變動 domain **指標公式本身**（MAE/攤平/勝率/下行標準差算法不變）。

---

## 2. User Personas

- **Primary Role:** **系統（背景 worker）**——本 feature 為資料基礎設施，無新終端互動。間接受益者為查 `/rankings` 的散戶（交易員池更廣、且 OKX 來源也有攤平標記）。
- **Usage Context:** 持續於 VPS 上以 BullMQ 排程運行；對 Hyperliquid（鏈上 REST）與 OKX（copytrading REST）發出讀取請求。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 系統, **I want** 以 provider-agnostic 的契約攝取各場所交易員資料, **so that** 新增來源不必動 domain。 | 1. 一個一般化的攝取契約（介面），per-provider Proxy 實作<br>2. `HyperliquidProxy` 收斂到此契約；新增 `OkxProxy`<br>3. 各 Proxy 將外部形狀正規化成共用 domain VO（domain 不認識任何 vendor 型別）<br>4. scheduler per-provider 跑 sync→poll→recompute，維持 per-trader 失敗隔離 | P0 |
| **US-02** | **As a** 系統, **I want** 以 `(provider, address)` 唯一識別交易員, **so that** 不同場所（含 EVM 撞號）不會被誤併。 | 1. `Trader` entity **新增一個 `provider` 欄位（enum：`hyperliquid`/`okx`…）**；持久化主鍵 `(provider, address)`（DB 對應 Prisma enum）<br>2. OKX 以 `uniqueCode` 放入 address 欄位<br>3. schema migration 完成、既有 Hyperliquid 資料以 `provider='hyperliquid'` 回填<br>4. 同一 `0x` 在不同 provider 視為兩筆獨立記錄，不合併 | P0 |
| **US-03** | **As a** 系統, **I want** 從 OKX 取得追蹤名單與已平/未平倉位, **so that** OKX 交易員能進入排行。 | 1. 名單：`public-lead-traders`（ranks）<br>2. 已平倉位：`public-subpositions-history`<br>3. 當前倉位（供 MAE/槓桿快照）：`public-current-subpositions`（`uplRatio`、`lever`）<br>4. 正規化成與 Hyperliquid 一致的 domain VO | P0 |
| **US-04** | **As a** 系統, **I want** 由 OKX 的 per-order sub-position 重建倉位並算攤平, **so that** OKX 來源也保有招牌指標。 | 1. 同標的的多筆 sub-position 依 `openTime` 排序為加倉序列（price=`openAvgPx`、size=`subPos`、time=`openTime`）<br>2. 重建邏輯倉位後，套用既有 `Position.isAveragingDown()` 與其他指標<br>3. OKX 交易員的 `averagingDownRatio` 非 null（資料允許時）<br>4. 已知盲點（同一 subPosId 內部加倉）記錄為限制 | P0 |
| **US-05** | **As a** 系統, **I want** 統一排行輸出帶 `provider`, **so that** 使用者可辨識/篩選來源。 | 1. `TraderRiskDto` 與 `/rankings` 回傳含 `provider`<br>2. `/rankings` 支援 `?provider=` 篩選<br>3. 跨源排序政策依「Open Decisions」定案（統一榜或分場所榜）<br>4. `/traders/:address` 在多源下能定位（需 provider 區分） | P1 |

---

## 4. Business Flow & Logic

### Flow Diagram

```
每個 provider 各跑一條（per-provider 排程）：

[Hyperliquid]
  synchronizeLeaderboard ─▶ traders(provider=hyperliquid)
  pollTrader ─▶ position_fills + position_snapshots（逐筆 fills）
  recompute ─▶ reconstructPositions(fills) ─▶ metrics

[OKX]
  synchronizeLeaderboard(public-lead-traders) ─▶ traders(provider=okx, address=uniqueCode)
  pollTrader ─▶ public-subpositions-history（已平）+ public-current-subpositions（當前快照）
  recompute ─▶ reconstructPositionsFromSubPositions（依 openTime 排序 tranche）─▶ metrics
                                   │
                                   ▼
                    統一 trader_metrics（帶 provider）─▶ getRiskRanking（/rankings?provider=）
```

### Core Business Rules

- **來源落點（DIP）**：每個 provider 一個 infra Proxy，正規化成共用 VO；**domain 不認識任何 vendor 形狀、不知道資料來自哪個場所**。
- **識別**：`(provider, address)`。EVM 場所共用 `0x` → 裸地址非全域唯一；OKX 用 `uniqueCode`。
- **OKX 攤平重建**：OKX sub-position = 每張開倉單一筆（證據：`openOrdId` + OKX FAQ「Lead 分頁算個別下單、Open Position 分頁彙總」）。把同標的多筆 sub-position 視為加倉序列即可重建路徑、算攤平。
- **指標公式不變**：MAE/攤平/勝率/下行標準差/平均槓桿/trapSignal/riskScore 沿用主 PRD 第 4 章；本 feature 只新增「來源 → VO」的正規化與 OKX 重建路徑。
- **MAE 需要觀測**：兩來源的 MAE 都靠**輪詢當前開倉拍快照**累積（HL `clearinghouseState`、OKX `public-current-subpositions.uplRatio`）→ 同樣需要運行時間累積（沿用主 PRD「無 snapshot 的倉位排除」規則）。
- **per-provider 限流**：沿用 `RequestWeightLimiter` + 429 退避樣式，各 provider 一組設定（OKX 限流規則與 Hyperliquid 不同）。

### Edge Cases

- **OKX 加倉是「改舊單」而非「開新單」**：該段加倉被同一 sub-position 彙總、看不到 → 記錄為已知盲點；以實測評估影響。
- **OKX `public-*` 需認證**：若需 API key/passphrase，於組裝根注入；缺金鑰時該 provider 停用、不影響 Hyperliquid。
- **OKX 邏輯倉位歸併**：同標的多筆 sub-position 需歸併成一個「開→平」邏輯倉位以正確計 `closedPositionCount`/`winRate`/報酬率（見 Open Decisions）。
- **單一 provider 來源故障**：per-provider 隔離，一個場所失敗不中斷其他場所。
- **同址跨場所**：`(provider, address)` 確保不誤併。

---

## 5. UI/UX Design & Interaction

- **N/A** — 純後端資料層。可觀測性以 worker 結構化 log（各 provider 攝取量、限流等待、OKX 重建的 sub-position 筆數）呈現。`/rankings` 回應新增 `provider` 欄位。

---

## 6. Non-Functional Requirements

- **正確性**：OKX 重建後的 `averagingDownRatio` 與人工抽查一致；跨源指標單位一致（金額/比率以 `decimal.js`）。
- **可測試性（強制）**：OKX 正規化/重建以**注入式 proxy 介面 + `vi.fn` mock** 測試（比照既有測試策略）；攤平重建以單元測試 entity 驗證。
- **分層**：vendor 型別只在 infra 邊際；domain 永不接觸。禁 `any`/`unknown`、金額禁 float（沿用 CLAUDE.md）。
- **可設定**：各 provider 的 base URL、限流預算、退避參數、（OKX）API 金鑰由環境變數注入（`.env.example` 同步）。
- **可觀測**：log 各 provider 同步/輪詢/重算筆數與失敗。

---

## 7. Dependencies & Risks

- **External Dependencies:**
  - Hyperliquid REST（現用）。
  - OKX copytrading REST：`public-lead-traders` / `public-subpositions-history` / `public-current-subpositions`；可考慮官方/社群 SDK（如 `okx-api`）或自寫 proxy。
- **Known Risks:**
  - **OKX sub-position 粒度未 100% 鎖死**：per-open-order 為強推論（`openOrdId` + FAQ），**動工前需實測確認**分批加倉是否回多筆；以及「改舊單」盲點。
  - **OKX 認證/限流**：`public-*` 是否需金鑰、rate limit 數值需確認。
  - **跨源代表性**：不同場所人群分布不同；統一榜的可比性/加權需政策（正規化≠公正）。
  - **Hyperliquid SDK 採用（選配）**：`@nktkas/hyperliquid` 可取代手寫 wire 型別（與本專案同用 decimal.js），但非必要。

---

## 8. Appendix — Open Decisions

### 已解（Phase 2 實作 + 真實 OKX 公開 API 驗證）

1. ✅ **OKX sub-position = per-open-order**：實測「Steady first」BTC-USDT-SWAP 回 37 筆獨立 sub-position（各帶 `openAvgPx/openTime/subPos`）→ 加倉路徑可見、攤平可算。剩餘盲點「同 subPosId 內部加倉」影響小、列為已知限制。
2. ✅ **OKX 邏輯倉位歸併**：採**歸併**——每筆 sub-position 拆成 open/close 兩條 `TraderActivity`，依時間排序交由**統一** `Position.reconstruct` 拼成邏輯倉位、偵測攤平。
3. ✅ **OKX 認證**：`public-*` copytrading 端點**免金鑰**（實測 `code:0`）。
4. ✅ **跨源排行形態**：統一一張榜帶 `provider` 欄位 + `?provider=` 篩選（兩源指標集一致，含攤平）。

> 端到端驗證：10 個帶單員中 6 個有公開部位者皆成功 reconstruct 並偵測到攤平（2/6/2/4/10/3 筆）；4 個私密部位以 per-trader 隔離跳過。

### 待後續

5. **限流抽象**：是否抽出共用 `IRateLimiter` 供各 provider proxy 注入（目前各自內建 `RequestWeightLimiter`）。
6. **Hyperliquid wire 是否改用 SDK**（`@nktkas/hyperliquid`）——可選優化。
7. **OKX uplRatio/ROE 口徑**：目前未實現% 以 ROI on notional 與 HL 對齊；若要改用 OKX 原生 `uplRatio` 需確認其分母定義。
7. 相關文件：主 PRD `.sdd/2026-06-19-trader-risk-radar/PRD.md`（§4 指標公式、倉位重建）；`.sdd/UL-MAP.md`（已新增 `provider`、`leadTrader`、`subPosition`、`ingestTraderData`、`reconstructPositionsFromSubPositions`）。
