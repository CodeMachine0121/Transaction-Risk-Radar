# Product Requirements Document (PRD) — 標的共識覆蓋度 Coin Coverage

**Status:** Draft
**Version:** v1.0
**Owner:** James
**Stakeholders:** Engineering, QA
**Brief:** `.sdd/2026-06-22-coin-coverage/BRIEF.md`

---

## 1. Background & Goal

- **Problem Statement:** `/backtest` 多數 coin × horizon 顯示 `insufficient`，但使用者無從得知哪些 coin 累積得最久、最接近可信。需要一個「進度儀表」。
- **Expected Outcome:** `GET /coins/coverage` 回每個 coin 的快照筆數與時間跨度，依跨度排序，讓使用者一眼看出最接近 `adequate` 的標的。
- **Out of Scope:** 就緒天數預測、參與深度軸、provider 篩選、改動既有端點。永久 out of scope：代操／下單。

---

## 2. User Personas

- **Primary Role(s):** 使用者 / 內部維運者——在等待資料累積期間追蹤各標的覆蓋度。
- **Usage Context:** REST 查詢；通常與 `/coins`、`/backtest` 搭配看。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 使用者, **I want** 看到每個 coin 的共識紀錄筆數與時間跨度, **so that** 我知道哪些標的最接近 /backtest 可信。 | 1. `GET /coins/coverage` 回 `{ coins: [{ coin, snapshotCount, earliestCapturedAt, latestCapturedAt, spanMilliseconds }] }`<br>2. 數值來自 `consensus_snapshots`：每 coin 的筆數、最早／最晚 `captured_at`（ms epoch）<br>3. `spanMilliseconds = latestCapturedAt − earliestCapturedAt`<br>4. 依 `spanMilliseconds` 由大到小排序，同跨度以 coin 升冪<br>5. 無紀錄 → `{ coins: [] }`（200）<br>6. 公開端點（不需 token） | P0 |

---

## 4. Business Flow & Logic

### Flow
```
GET /coins/coverage
  → CoinCoverageController
  → ListCoinCoverageApplication.listCoinCoverage()
  → RecordedCoinService.listCoinCoverage()              // domain：算 span + 排序 → DTO
  → IConsensusSnapshotRepository.listCoinCoverage()      // ORM groupBy coin：_count / _min / _max(capturedAt)
  → CoinCoverageReportDto { coins }
```

### Core Business Rules
1. **聚合**：以 ORM `groupBy(['coin'])` 取 `_count`、`_min(capturedAt)`、`_max(capturedAt)`（禁手寫 SQL），走既有 `@@index([coin, capturedAt])`。
2. **衍生跨度**：`spanMilliseconds = latestCapturedAt − earliestCapturedAt`，於 domain service 計算。
3. **排序**：`spanMilliseconds` 由大到小（最接近 adequate 在前）；同跨度 coin 字母升冪。
4. **無 provider 維度**：跨 provider 合併（與 `/consensus`、`/coins` 一致）。

### Edge Cases
- 尚無任何共識快照 → `{ coins: [] }`。
- 某 coin 僅一筆快照 → `spanMilliseconds = 0`（earliest == latest）。
- 不接受 query 參數（多餘參數忽略）。

---

## 5. UI/UX Design & Interaction

- **N/A（REST JSON）。** 形狀：`{ "coins": [{ "coin": "BTC", "snapshotCount": 240, "earliestCapturedAt": 171..., "latestCapturedAt": 171..., "spanMilliseconds": 86400000 }] }`。

---

## 6. Non-Functional Requirements

- **效能**：單一 groupBy 查詢，走既有索引；輕量。
- **安全 / 開放範圍**：公開（覆蓋度統計非敏感）。
- **相容性**：N/A（後端 REST）。

---

## 7. Dependencies & Risks

- **Internal:** `IConsensusSnapshotRepository` + `ConsensusSnapshotRepository`、`RecordedCoinService`、buildServer 組裝（沿用 backtest option 注入的 consensusSnapshotRepository）。
- **Known Risks:** 端點可用性與 `/coins`、`/backtest` 同，取決於組裝根是否提供 consensusSnapshotRepository（`main.ts` 已提供）。

---

## 8. Appendix

- 相關：`.sdd/2026-06-21-recorded-coins-list/PRD.md`、`.sdd/2026-06-21-backtest-trigger-endpoint/PRD.md`、`.sdd/UL-MAP.md`（新增 `listCoinCoverage`）。
