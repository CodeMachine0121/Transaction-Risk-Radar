# 標的共識覆蓋度 Coin Coverage — Requirements Brief

## Goal
新增一隻 REST 端點，回傳每個有共識紀錄之 coin 的「覆蓋度」——快照筆數與最早／最晚紀錄時間（加衍生的時間跨度），讓使用者一眼看出哪些 coin 累積得最久、最接近 `/backtest` 的 `dataAdequacy=adequate`，作為等待期的進度儀表。

## Requirements
- 新增 `GET /coins/coverage`，回 `{ coins: [{ coin, snapshotCount, earliestCapturedAt, latestCapturedAt, spanMilliseconds }] }`。
  - `snapshotCount`：該 coin 在 `consensus_snapshots` 的快照筆數。
  - `earliestCapturedAt` / `latestCapturedAt`：ms epoch。
  - `spanMilliseconds`：`latestCapturedAt − earliestCapturedAt`（衍生）。
- 依 `spanMilliseconds` **由大到小**排序（歷史最長在前 = 最接近 adequate）；同跨度以 coin 字母升冪。
- 無紀錄時回 `{ coins: [] }`（200，非錯誤）。
- 公開端點（不需 token），與 `/coins`、`/backtest` 同樣依賴 consensusSnapshotRepository、於提供 backtest 依賴時一併註冊。
- 架構分層：`CoinCoverageController` → `ListCoinCoverageApplication` → `RecordedCoinService.listCoinCoverage()`（domain）→ `IConsensusSnapshotRepository.listCoinCoverage()`（介面在 domain、實作在 infra，用 ORM groupBy）。

## Out of Scope
- 不計算「距離 adequate 還要多久」的預測（使用者自行依 span ÷ horizon 心算即可）。
- 不含參與深度（typical participantCount）等第三軸——本次只回筆數與時間跨度。
- 不依 provider 篩選（consensus_snapshots 無 provider 維度）。
- 不改動 `/coins`、`/backtest` 既有行為與 `riskScore` 邏輯。
- 不代操、不下單。

## Open Decisions
- 排序採 spanMilliseconds desc（最接近 adequate 在前）；如要改字母序再議。
- 未來是否補上 typical participantCount 與「各 horizon 預估就緒天數」。

## Context / Background
- 動機：`/backtest` 多數 coin × horizon 顯示 `insufficient`，使用者需要一個「進度儀表」知道哪些 coin 快可信。span 直接對應「1h horizon 的獨立樣本上限 ≈ span ÷ 1h」，故 span 最長者最接近 adequate。
- 既有可沿用：`IConsensusSnapshotRepository` + `ConsensusSnapshotRepository`、`consensus_snapshots` 的 `@@index([coin, capturedAt])`、`RecordedCoinService`（同屬「已記錄標的」領域，擴充一個方法）、buildServer backtest 區塊組裝。
- 權威來源：`.sdd/2026-06-21-recorded-coins-list/PRD.md`、`.sdd/2026-06-21-backtest-trigger-endpoint/PRD.md`、`.sdd/UL-MAP.md`。
