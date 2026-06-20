# Product Requirements Document (PRD) — List Tracked Traders

**Feature:** 列出全部追蹤交易員（唯讀 `GET /traders`）
**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering（solo）
**Brief:** `.sdd/2026-06-20-list-tracked-traders/BRIEF.md`

> 命名慣例：所有程式識別字一律全名、禁止縮寫（見 `.sdd/UL-MAP.md`）。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:** `GET /rankings` 只回「**可排行**」交易員（`insufficientData=false`）。但剛同步進來、或指標尚未累積足夠 snapshot 的交易員（如 OKX 那 6 個公開帶單員）`insufficientData=true`，於是 `/rankings` 看不到他們——使用者誤以為「沒同步到」，實際上資料已存（`/traders/:address` 查得到）。缺一個「列出全部、看累積進度」的可視性端點。
- **Expected Outcome:** `GET /traders` 能列出**所有**追蹤交易員（含 `insufficientData`），支援 `?provider=` 與分頁；使用者可確認同步狀態與「距離可排行還差多少」（`closedPositionCount`）。
- **Out of Scope:**
  - 任何寫入型 CRUD（create/update/delete）。
  - 「已同步但從未重算」（只有 `traders`、無 `trader_metrics` 列）的交易員。
  - 變更 `/rankings`、`/traders/:address`、ingestion、domain 指標公式。

---

## 2. User Personas

- **Primary Role:** 開發者 / 維運者（第一版為作者本人）——需要觀察攝取與指標累積狀態。
- **Usage Context:** 透過 REST API 主動查詢（debug / 確認同步進度）。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 維運者, **I want** 列出所有追蹤交易員（含未可排行者）, **so that** 我能確認已同步、看累積進度。 | 1. `GET /traders` 回傳 `TraderRiskDto[]`，**含 `insufficientData=true` 者**（不套用 `/rankings` 的可排行過濾）<br>2. 來源為 `trader_metrics` 全列<br>3. 每筆含 `provider`、`insufficientData`、`closedPositionCount` 與各指標（未計算為 null） | P0 |
| **US-02** | **As a** 維運者, **I want** 以 provider 篩選, **so that** 我能只看某來源。 | 1. `?provider=hyperliquid\|okx` 篩選<br>2. 缺漏或無法辨識 → 回全部來源 | P0 |
| **US-03** | **As a** 維運者, **I want** 分頁與穩定排序, **so that** 名單變大仍可瀏覽。 | 1. `?offset=&limit=`（沿用 `/rankings` 預設 limit 50）<br>2. 預設排序：可排行者依 `riskScore` 升冪在前、`insufficientData`（null score）殿後 | P1 |

---

## 4. Business Flow & Logic

### Flow Diagram

```
GET /traders?provider=&offset=&limit=
   ▼ Controller 解析 provider/offset/limit（沿用 parseProvider）
   ▼ ListTradersApplication.list(query)
   ▼ TraderListService.listTraders(query)
       → traderRepository.findAllTraders(provider?)   // 不過濾 insufficientData
       → 排序（rankable by riskScore asc, insufficientData 殿後）+ 分頁
   ▼ TraderRiskDto[]（含 insufficientData 者）
```

### Core Business Rules

- **不過濾 insufficientData**：與 `getRiskRanking` 的差異點——後者只回可排行者，本端點回全部。
- **來源**：讀 `trader_metrics`（已重算者）；「同步但未重算」短暫過渡狀態不納入。
- **形狀沿用**：`TraderRiskDto`（含 `provider`），與 `/rankings`、`/traders/:address` 一致。
- **排序穩定**：可排行者（有 riskScore）依升冪在前，`insufficientData` 殿後，避免 null 排序歧義。
- **分層**：跨多 trader 查詢置於 Domain Service；repository 新增 `findAllTraders(provider?)`（DIP）。

### Edge Cases

- **無資料**：回 `[]`。
- **provider 無法辨識**：忽略篩選、回全部（與 `/rankings` 一致）。
- **offset 超出範圍**：回 `[]`。

---

## 5. UI/UX Design & Interaction

- **N/A** — REST JSON。回應為 `TraderRiskDto[]`。

---

## 6. Non-Functional Requirements

- **效能**：單次查詢走既有索引 / 全表掃描皆可接受（交易員數量級小）；分頁限制回傳量。
- **可測試性（強制）**：application 測試注入真實 service + 真實 entity，只 mock `ITraderRepository`（`vi.fn`），比照既有測試策略。
- **分層 / 型別**：禁 `any`/`unknown`；entity 不外漏，回 `TraderRiskDto`。

---

## 7. Dependencies & Risks

- **External Dependencies:** 無（純讀 DB）。
- **Known Risks:**
  - 名單只增不減（私密/失效交易員會累積）——非本端點問題，但會讓 `/traders` 列表變長；屬另案（追蹤名單清理）。

---

## 8. Appendix — Open Decisions

- 是否需要 `?insufficientData=true|false` 篩選旗標（目前一律全列）。
- `limit` 上限是否設硬上限（防超大查詢）；目前沿用 `/rankings` 預設 50、無硬上限。
- 相關文件：`.sdd/2026-06-20-multi-source-trader-ranking/`（provider 識別）、`.sdd/2026-06-19-trader-risk-radar/PRD.md`（US-01 排行、§4 指標需 snapshot）；UL-MAP 已新增 `listTraders`。
