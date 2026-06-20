# Hyperliquid Rate-Limit Resilience — Requirements Brief

## Goal

為 Hyperliquid 讀取 API 建立限流韌性，消除 200 位交易員輪詢時的 429 錯誤，並讓 `/rankings` 能順利累積出可排行的資料。分兩階段交付：**Phase A** 在 proxy 的單一咽喉點加上 weight-aware 限流器與 429 退避（止血）；**Phase B** 以 high-watermark 增量抓取與分層輪詢大幅砍掉請求量（減量）。

## Requirements

### Phase A — 限流 + 退避（infrastructure，`hyperliquidProxy.postInfo`）

- 加入 **weight-aware 行程內（in-process）限流器**：每個 `/info` 請求依其 weight 取 token，token bucket 以 per-IP 預算（約 1200 weight/分鐘）速率回填；額度不足時 **block-and-wait**（排隊等回填），不丟棄請求。
- 對既有兩種請求套用對應 weight：`clearinghouseState`（`fetchOpenPositions`，輕量）、`userFillsByTime`（`fetchUserFills`，重量）。
- `leaderboard`（不同主機 `statsDataBaseUrl`、每次 sync 僅一次 GET）**不納入** weight 預算。
- 收到 **429** 時讀 `Retry-After`、執行 **exponential backoff + jitter** 重試（含最大重試上限），取代目前直接 throw。
- 限流器與退避邏輯可**注入 clock 與 fetch**，以利單元測試（不依賴真實時間/網路）。

### Phase B — 減量（scheduler + repository + sync）

- **fills 增量抓取（high-watermark）**：以 `PositionFill` 既有索引 `@@index([traderAddress, coin, occurredAt])`，用 `max(occurredAt)` 推導每位交易員最後成交時間作為 `fetchUserFills` 的 `startTime`，不再每輪重抓 `POLL_LOOKBACK_MS`（90 天）全窗；無歷史成交者退回首次 lookback。**不新增 fill 時間欄位。**
- **分層輪詢（tiered polling）**：`synchronizeLeaderboard` 持久化交易員的 tier/rank（依 `accountValue` 排序），`scheduler` 依 tier 以不同節奏排程（高排名勤、長尾鬆）。落實「機制」即可——具體層數與各層 interval 數值留給 PRD 校準。

## Out of Scope

- **Redis 共享限流器**（支援多 worker 行程 / 多 IP）——v1 僅單一 worker，列為未來項。
- domain 指標計算公式與充血 entity 邏輯（不變）。
- REST 對外行為：controller / application 與 `/rankings`、`/traders/:address` 介面契約不變。
- leaderboard GET 的 weight 預算（僅對它做 429 退避，不計 weight）。

## Open Decisions

留給 PRD 作者解決：

- 確切的 weight 預算數值與各 `/info` 請求的 weight（動工前對 Hyperliquid 官方 docs 校準；他們調整過數次）。
- backoff 參數：基數、上限、最大重試次數、jitter 範圍。
- 分層輪詢的**層數**與**各層 interval 數值**；tier 如何持久化（`Trader` 新增欄位 vs 獨立表）。
- weight 預算耗盡時，**單輪可接受的最長耗時**是否需要上限保護（避免一輪 block 過久）。

## Context / Background

- **問題本質是 weight 預算超標，非單純「打太快」。** Hyperliquid `/info` 為 per-IP weight 制（aggregate 約 1200 weight/分鐘）。每位交易員一輪 poll ≈ `clearinghouseState(輕) + userFillsByTime(重)`；200 位 × 重量請求遠超 1200/分鐘，加上 `POLL_INTERVAL_MS=30s` 想每 30 秒掃完，吞吐需求約為上限的數倍 → 429 為必然。
- **架構落點**：所有 info 請求都過 `hyperliquidProxy.postInfo`（單一咽喉點），限流與退避裝此層，domain 完全無感（符合 Clean/Onion 分層，DIP）。
- **既有實測**：啟動即跑一輪後 `traders` 已入庫 200 筆、`position_snapshots` 約 1551 筆，但 `fetchUserFills` 大量 429 → 多數交易員 `closedPositionCount` 不足、標記 `insufficientData`，故 `/rankings` 仍為空。本功能完成 A+B 後可累積出可排行資料。
- **對應 PRD 開放項**：PRD 第 6 章「待後續校準的開放項」已列「分層輪詢具體間隔與 rate-limit 預算」——本功能即落實此項；實作前需同步更新 PRD 與 `.sdd/UL-MAP.md`，避免文件漂移。
- **詞彙沿用 UL-MAP（皆 Confirmed）**：`pollTrader`、`synchronizeLeaderboard`、「分層排程（高排名勤、長尾鬆）」、`leaderboard` 與 `Risk Ranking` 之區分，不自創同義詞。
- **交付順序**：先 A（止血、層次正確、可單元測試），再 B 的 high-watermark（量級最大的減量），最後分層輪詢（排程策略調校）。
