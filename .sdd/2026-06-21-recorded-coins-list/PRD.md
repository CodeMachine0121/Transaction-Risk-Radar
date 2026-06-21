# Product Requirements Document (PRD) — 已記錄標的清單 Recorded Coins List

**Status:** Draft
**Version:** v1.0
**Owner:** James
**Stakeholders:** Engineering, QA
**Brief:** `.sdd/2026-06-21-recorded-coins-list/BRIEF.md`

---

## 1. Background & Goal

- **Problem Statement:** `/backtest` 需指定 `coin`，但使用者無從得知哪些 coin 已有共識時序紀錄，只能盲猜；猜到沒資料的 coin 只會得到全 `insufficient` 的空報告。
- **Expected Outcome:** 一隻 `GET /coins` 回傳已記錄的 coin 清單，作為 `/backtest` 的「可查詢標的字典」。
- **Out of Scope:** 每 coin 統計（筆數／時間跨度）、provider 篩選、改動既有端點。永久 out of scope：代操／下單。

---

## 2. User Personas

- **Primary Role(s):** 使用者 / 內部維運者——查可回測的標的清單。
- **Usage Context:** REST 查詢，通常先呼叫 `/coins` 再挑一個 coin 去 `/backtest`。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 使用者, **I want** 取得目前有共識紀錄的 coin 清單, **so that** 我知道哪些標的可以 /backtest。 | 1. `GET /coins` 回 `{ coins: string[] }`<br>2. `coins` 為 `consensus_snapshots` 中出現過的**不重複** coin<br>3. 依字母**升冪**排序<br>4. 無紀錄 → `{ coins: [] }`（200，非錯誤）<br>5. 公開端點（不需 token） | P0 |

---

## 4. Business Flow & Logic

### Flow
```
GET /coins
  → RecordedCoinController
  → ListRecordedCoinsApplication.listRecordedCoins()
  → RecordedCoinService.listRecordedCoins()        // domain service：取資料 → 轉 DTO
  → IConsensusSnapshotRepository.listRecordedCoins() // distinct coin, asc
  → RecordedCoinsDto { coins }
```

### Core Business Rules
1. **去重 + 排序**：回傳 `consensus_snapshots` 的 distinct `coin`，字母升冪。實作以 ORM distinct 查詢（禁手寫 SQL），利用既有 `@@index([coin, capturedAt])`。
2. **無 provider 維度**：`consensus_snapshots` 不含 provider，故清單跨 provider 合併（與 `/consensus` 的快照口徑一致）。

### Edge Cases
- 尚無任何共識快照 → `{ coins: [] }`。
- 不接受任何 query 參數（多餘參數忽略）。

---

## 5. UI/UX Design & Interaction

- **N/A（REST JSON）。** 回應形狀：`{ "coins": ["BTC", "ETH", ...] }`。

---

## 6. Non-Functional Requirements

- **效能**：單一 distinct 查詢，走既有索引；可視為輕量。
- **安全 / 開放範圍**：公開（coin 代號非敏感）；與受保護的 `/backtest` 區隔。
- **相容性**：N/A（後端 REST）。

---

## 7. Dependencies & Risks

- **Internal:** `IConsensusSnapshotRepository` + `ConsensusSnapshotRepository`、buildServer 組裝根（沿用 backtest option 既已注入的 `consensusSnapshotRepository`）。
- **Known Risks:** 端點可用性與 `/backtest` 一樣，取決於組裝根是否提供 consensusSnapshotRepository（`main.ts` 已提供）。

---

## 8. Appendix

- 相關：`.sdd/2026-06-21-backtest-trigger-endpoint/PRD.md`、`.sdd/UL-MAP.md`（新增 `listRecordedCoins` 行為）。
