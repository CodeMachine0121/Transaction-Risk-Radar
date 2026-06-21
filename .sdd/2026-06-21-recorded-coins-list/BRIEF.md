# 已記錄標的清單 Recorded Coins List — Requirements Brief

## Goal
新增一隻 REST 端點，回傳「目前已有共識時序紀錄」的 coin 清單，讓使用者知道哪些標的有資料、可作為 `/backtest` 的查詢對象（避免盲猜 coin）。資料來源為 `consensus_snapshots`（每輪安全群共識的留存）中出現過的 distinct coins。

## Requirements
- 新增 `GET /coins`，回傳 `{ coins: string[] }`，為 `consensus_snapshots` 中出現過的不重複 coin、依字母升冪排序。
- 公開端點（coin 代號非敏感資訊；不需 token）。
- 無紀錄時回 `{ coins: [] }`（非錯誤）。
- 架構遵循分層：`RecordedCoinController` → `ListRecordedCoinsApplication` → `RecordedCoinService`（domain）→ `IConsensusSnapshotRepository.listRecordedCoins()`（介面在 domain、實作在 infra）。

## Out of Scope
- 不含每 coin 的統計（筆數、時間跨度）——本次只回清單；日後若需「可回測就緒度」再擴充。
- 不依 provider 篩選（`consensus_snapshots` 無 provider 維度）。
- 不改動既有端點與 `riskScore` / 共識邏輯。
- 不代操、不下單（全專案立場）。

## Open Decisions
- 端點掛載點：採 `GET /coins`（與 `/backtest` 同樣依賴 consensusSnapshotRepository，於提供 backtest 依賴時一併註冊），公開、不受 token 保護。
- 未來是否擴充為每 coin 的 `{ coin, snapshotCount, earliestCapturedAt, latestCapturedAt }` 以估算各 horizon 就緒度。

## Context / Background
- 動機：`/backtest` 需要指定 coin，但使用者不知道有哪些 coin 有共識歷史。此端點補上「可回測標的清單」的可視性缺口。
- 既有可沿用：`IConsensusSnapshotRepository` + `ConsensusSnapshotRepository`（Prisma）、`consensus_snapshots` 的 `@@index([coin, capturedAt])` 支援 distinct coin 查詢、domain service → DTO 邊界、buildServer 組裝根注入。
- 權威來源：`.sdd/2026-06-21-backtest-trigger-endpoint/PRD.md`、`.sdd/UL-MAP.md`。
