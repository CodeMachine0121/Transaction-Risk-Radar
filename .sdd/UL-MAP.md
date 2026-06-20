# 📔 Ubiquitous Language Map

**Project:** Trader Risk Radar
**Bounded Context:** Hyperliquid 鏈上永續合約交易員的風險分析與排行
**Maintainer:** James (james.hsueh@cafler.com)
**Last Updated:** 2026-06-20

> **命名慣例：所有 Technical Name 與程式識別字一律使用全名，禁止縮寫。**
> 程式碼識別字用 camelCase 全名（如 `maxAdverseExcursion`）；資料庫表 / 欄位用 snake_case 全名（如 `position_events`、`unrealized_profit_and_loss_percentage`）。領域術語欄位（Domain Term）可保留人類習慣的簡稱（如 MAE）作閱讀用，但其對應識別字必為全名。

---

## 1. Nouns & Concepts

_Records entities, value objects, attributes and their correspondence between code and real business._

| Domain Term                    | Technical Name                        | User-Facing Label           | Definition & Business Rules                                                                                                                     | Status                         |
| :----------------------------- | :------------------------------------ | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------- | ------------------------------------------------------ | --------- |
| 交易員 Trader                  | `traders` / `trader`                  | Trader                      | 被追蹤分析的鏈上錢包地址。來源為 Hyperliquid leaderboard。以地址為唯一識別。                                                                    | Confirmed                      |
| 倉位 Position                  | `positions` / `position`              | Position                    | 交易員針對某一標的（coin）的一筆持倉，有方向（多/空）。生命週期：開倉 → (加倉/減倉)\* → 平倉。                                                  | Confirmed                      |
| 逐筆動作 Position Event        | `position_events`                     | —                           | 倉位生命週期中的每一個動作（開/加/減/平），記錄 price、size、leverage、timestamp。是偵測攤平行為的依據。                                        | Confirmed                      |
| 浮虧快照 Snapshot              | `position_snapshots`                  | —                           | 每次輪詢對每個開倉拍下的時間切片，記錄 mark_price、unrealized_profit_and_loss_percentage、margin、timestamp。是計算 MAE 的依據。                | Confirmed                      |
| 最大逆向幅度 MAE               | `maxAdverseExcursionPerPosition`      | Max Adverse Excursion       | 單一倉位生命週期內最深的浮虧百分比，即 `min(unrealizedProfitAndLossPercentage)`。代表跟單所需的最大回撤緩衝。                                   | Confirmed                      |
| 最大逆向幅度第90百分位         | `maxAdverseExcursionPercentile90`     | MAE (p90)                   | 交易員所有倉位 `                                                                                                                                | maxAdverseExcursionPerPosition | ` 的第 90 百分位。代表「90% 的倉位最深都在此幅度內」。 | Confirmed |
| 攤平 / 馬丁格爾 Averaging-down | `isAveragingDown`                     | Martingale / Averaging-down | 交易員以「劣於加權平均進場價」的價格加倉（多單低於均價、空單高於均價），拉低/拉高均價的行為。標記為高危。                                       | Confirmed                      |
| 攤平比例 Averaging-down Ratio  | `averagingDownRatio`                  | Averaging-down Ratio        | 有攤平行為的倉位數 / 總倉位數。越高越偏馬丁格爾、越危險。                                                                                       | Confirmed                      |
| 已實現盈虧 Realized PnL        | `realizedProfitAndLoss`               | Realized PnL                | 倉位平倉後實際結算的盈虧。                                                                                                                      | Confirmed                      |
| 單筆報酬率 Per-position Return | `realizedReturnPercentagePerPosition` | Return per Trade            | 單一已平倉位的已實現報酬率，是計算勝率與下行標準差的基礎序列。                                                                                  | Confirmed                      |
| 勝率 Win Rate                  | `winRate`                             | Win Rate                    | 近 90 天內，獲利已平倉位 / 總已平倉位。                                                                                                         | Confirmed                      |
| 下行標準差 Downside Deviation  | `returnDownsideDeviation`             | Downside Deviation          | 近 90 天每筆 `realizedReturnPercentagePerPosition` 中，僅取負報酬部分計算的標準差。衡量「賠的時候穩不穩、會不會突然爆一筆」。越高越危險。       | Confirmed                      |
| 平均槓桿 Average Leverage      | `averageLeverage`                     | Average Leverage            | 交易員倉位的平均名目槓桿倍數。                                                                                                                  | Confirmed                      |
| 陷阱訊號 Trap Signal           | `trapSignal`                          | Trap Signal                 | `winRate × normalize(maxAdverseExcursionPercentile90)`。抓「高勝率（看似穩）但倉位偷偷扛很深」的馬丁格爾陷阱。                                  | Confirmed                      |
| 風險分數層級 Risk Score Tier   | `riskScoreTier`（enum：`position`/`account`） | Tier                        | 標示 riskScore 的精度來源：`position`=逐筆部位級（精準）；`account`=帳戶級 fallback（粗版，看不到部位時由報酬序列推估）。 | Confirmed                      |
| 帳戶報酬序列 Account Return Series | `accountReturnSeries`             | —                           | provider 排行提供的每期報酬序列（OKX 由 `pnlRatios` 正規化而來）；帳戶級指標的輸入。Hyperliquid 無。 | Confirmed                      |
| 帳戶級回撤 Account Drawdown    | `accountDrawdown`                     | Account Drawdown            | 帳戶報酬曲線的峰到谷最大跌幅；帳戶級陷阱訊號的回撤項（對應部位級的 MAE）。                       | Confirmed                      |
| 風險分數 Risk Score            | `riskScore`                           | Risk Score                  | 0–100，越高越危險。由 MAE、攤平比例、陷阱訊號、下行標準差、平均槓桿加權組成（見 PRD 第 4 章公式）。**衡量「跟單有多危險」，刻意不獎勵報酬率。** | Confirmed                      |
| 交易員指標 Trader Metrics      | `trader_metrics`                      | —                           | 一位交易員經分析引擎計算後的彙總指標集（上述所有指標 + riskScore）。                                                                            | Confirmed                      |
| 風險排行 Risk Ranking          | `riskRanking`                         | Risk Ranking                | 依 riskScore 排序的交易員列表（風險導向，非報酬排名），為核心對外輸出。預設由低到高（安全在前），可切為由高到低（黑名單）。                     | Confirmed                      |
| 樣本不足 Insufficient Data     | `insufficientData`                    | Insufficient Data           | 已平倉位數 < `minimumClosedPositions`（預設 20）的交易員標記，不給 riskScore。                                                                  | Confirmed                      |
| 排行榜 Leaderboard             | `leaderboard`                         | Leaderboard                 | Hyperliquid 官方交易員排行榜，為自動拉取交易員清單的來源。                                                                                      | Confirmed                      |
| 標的 Coin                      | `coin`                                | Coin                        | 永續合約交易標的（如 BTC、ETH）。                                                                                                               | Confirmed                      |
| 槓桿 Leverage                  | `leverage`                            | Leverage                    | 倉位的名目槓桿倍數。                                                                                                                            | Confirmed                      |
| 保證金 Margin                  | `margin`                              | Margin                      | 倉位所佔用的保證金。                                                                                                                            | Confirmed                      |
| 請求權重 Request Weight        | `requestWeight`                       | —                           | Hyperliquid `/info` 每個請求的權重；不同請求類型權重不同（如 `clearinghouseState` 輕、`userFillsByTime` 重）。                                  | Confirmed                      |
| 權重預算 Weight Budget         | `requestWeightBudget`                 | —                           | per-IP 每分鐘可用的 aggregate weight 上限（約 1200，動工前對官方 docs 校準）。token bucket 以此速率回填。                                       | Confirmed                      |
| 交易員輪詢分層 Polling Tier    | `traderPollingTier`                   | —                           | 依 leaderboard `accountValue` 將交易員分層，決定輪詢頻率（高排名勤、長尾鬆）。                                                                  | Confirmed                      |
| 最後成交時間 Latest Fill Time  | `latestObservedFillTimestamp`         | —                           | 每位交易員已落庫成交的最新 `occurredAt`，作 high-watermark 增量抓取的 `startTime`。由 `PositionFill.max(occurredAt)` 推導，不另存欄位。         | Confirmed                      |
| 資料來源 Provider              | `provider`（**enum**）                | —                           | 交易資料的來源場所，以 **enum** 表示（`hyperliquid` / `okx`…）。為 `Trader` entity 的一個欄位；與 address 共同構成唯一識別 `(provider, address)`（EVM 場所共用 0x 會撞號）。 | Confirmed                      |
| 帶單員 Lead Trader             | `leadTrader`（`uniqueCode`）          | Lead Trader                 | OKX copy-trading 上可被跟單的交易員，以 `uniqueCode` 識別（在 `(provider, address)` 模型中放入 address 欄位）。                                     | Confirmed                      |
| 子倉位 Sub-position            | `subPosition`（`subPosId`）           | —                           | OKX copy-trading 中帶單員「**每張開倉單**」對應的一筆倉位記錄（含 `openAvgPx`/`openTime`/`openOrdId`）。分批加倉＝多筆 sub-position，可重建加倉路徑（攤平偵測依據）。 | Confirmed                      |

---

## 2. Actions & Processes

_Records business operations, function logic, and their corresponding business actions._

| Business Action                 | Technical Method                            | Trigger                      | Business Impact                                                                | Notes                            |
| :------------------------------ | :------------------------------------------ | :--------------------------- | :----------------------------------------------------------------------------- | :------------------------------- |
| 同步交易員清單 Sync Traders     | `synchronizeLeaderboard`                    | 背景作業定時觸發             | 從 Hyperliquid leaderboard 拉取並去重，更新 `traders` 清單                     | 須處理分頁與限流                 |
| 輪詢交易員資料 Poll Trader      | `pollTrader`                                | 分層排程（高排名勤、長尾鬆） | 撈取持倉/成交，寫入 `position_events` 與 `position_snapshots`                  | 以成交唯一 id 去重 (idempotency) |
| 計算最大逆向幅度                | `computeMaxAdverseExcursion`                | 分析引擎排程                 | 由 snapshots 算出每倉位與 p90 的 MAE，寫回 `trader_metrics`                    |                                  |
| 偵測攤平 Detect Averaging-down  | `detectAveragingDown`                       | 分析引擎排程                 | 掃描倉位 events，標記以劣於加權平均進場價加倉的倉位，計算 `averagingDownRatio` | 核心差異化邏輯                   |
| 計算盈虧與勝率                  | `computeProfitAndLossStatistics`            | 分析引擎排程                 | 由近 90 天已平倉位算出 `realizedProfitAndLoss`、`winRate`                      | 時間窗 = 近 90 天                |
| 計算下行標準差                  | `computeReturnDownsideDeviation`            | 分析引擎排程                 | 由近 90 天每筆報酬率的負報酬部分算出 `returnDownsideDeviation`                 | 衡量盈虧穩定度                   |
| 計算陷阱訊號                    | `computeTrapSignal`                         | 分析引擎排程                 | `winRate × normalize(maxAdverseExcursionPercentile90)`                         |                                  |
| 計算風險分數                    | `computeRiskScore`                          | 分析引擎排程                 | 加權組合各指標為 `riskScore`，供排行排序                                       | 權重見 PRD 第 4 章               |
| 查詢風險排行 Query Risk Ranking | `getRiskRanking` (`GET /rankings`)          | 使用者呼叫 REST API          | 回傳依 riskScore 排序的交易員列表                                              | 支援排序/分頁                    |
| 查詢交易員詳情 Query Trader     | `getTraderDetail` (`GET /traders/:address`) | 使用者呼叫 REST API          | 回傳單一交易員的完整指標、攤平標記、MAE                                        |                                  |
| 列出追蹤交易員 List Traders     | `listTraders` (`GET /traders`)              | 使用者呼叫 REST API          | 列出**所有**追蹤交易員（含 `insufficientData`、未可排行者）；支援 `?provider=` 與分頁 | 補 `getRiskRanking` 只回可排行者的可視性缺口 |
| 帳戶級風險評分 Account-Level Risk | `computeAccountLevelRisk`                 | recompute（部位級 insufficient 時） | 部位抓不到時，由 `accountReturnSeries` + `winRate` 算帳戶級下行標準差/回撤/陷阱訊號 → riskScore（`tier=account`） | fallback；不進 `/rankings`，僅 `/traders` 可見 |
| 依權重限流 Throttle by Weight   | `throttleByRequestWeight`                   | 每次 `/info` 請求前          | 依請求 weight 取 token；額度不足時 block-and-wait 等回填，結構性壓在預算內     | token bucket，行程內（單一 worker/IP） |
| 限流退避重試 Backoff on 429     | `retryWithBackoffOnTooManyRequests`         | 收到 HTTP 429                | 讀 `Retry-After`，exponential backoff + jitter 重試（含上限），取代直接 throw | 限 `/info`；leaderboard 亦適用退避但不計 weight |
| 增量輪詢成交 Poll Fills Incrementally | `pollTraderFillsSinceLatest`          | 分層排程                     | 以 `latestObservedFillTimestamp` 作 `startTime` 增量抓 fills，不再每輪重抓 90 天 | 無歷史成交者退回首次 lookback     |
| 攝取交易員資料（多源） Ingest Trader Data | `ingestTraderData`                  | per-provider 排程               | 由各 provider 的 proxy 取得名單/成交/部位，正規化成共用 domain VO（HL 走 fills、OKX 走 sub-positions） | 每個 provider 一條 sync→poll→recompute |
| 由子倉位重建倉位 Reconstruct from Sub-positions | `reconstructPositionsFromSubPositions` | OKX recompute             | 把同標的的多筆 sub-position 依 `openTime` 排序為加倉序列，重建邏輯倉位（供攤平/勝率/報酬率） | 對應 HL 的 `reconstructPositions`（fills） |

---

## 3. Ambiguities & Conflicts

_Records cases where the same technical term means different things in different modules, or multiple terms refer to the same concept._

| Ambiguous Term  | Meaning in Context A                          | Meaning in Context B                        | Resolution                                                                                   |
| :-------------- | :-------------------------------------------- | :------------------------------------------ | :------------------------------------------------------------------------------------------- |
| 排行 Ranking    | Hyperliquid 官方「Leaderboard」（依報酬排名） | 本系統「Risk Ranking」（依 riskScore 排名） | 官方來源稱 **Leaderboard**，本系統輸出稱 **Risk Ranking**，不混用「排行」                    |
| 回撤 Drawdown   | 單一倉位浮虧深度（即 MAE）                    | 帳戶整體權益回撤                            | 第一版只談倉位層級 → 一律用 **MAE**；帳戶層級回撤不納入                                      |
| PnL             | 已實現盈虧 (Realized)                         | 未實現浮動盈虧 (Unrealized)                 | 浮動值稱 `unrealizedProfitAndLossPercentage`；結算值稱 `realizedProfitAndLoss`，不單用 "pnl" |
| 波動 Volatility | 全標準差（含上行）                            | 下行標準差（僅負報酬）                      | 第一版風險指標一律用 **下行標準差** `returnDownsideDeviation`，不用全標準差                  |

---

## 4. External & Enum Mapping

_Records magic numbers/strings in code and their real business meaning._

| Category            | Code Value / Key | Domain Label | Description                                      |
| :------------------ | :--------------- | :----------- | :----------------------------------------------- |
| Position Event Type | `open`           | 開倉         | 倉位首次建立                                     |
| Position Event Type | `add`            | 加倉         | 增加倉位 size（劣於均價的 add 是攤平偵測重點）   |
| Position Event Type | `reduce`         | 減倉         | 部分平倉                                         |
| Position Event Type | `close`          | 平倉         | 倉位完全結束                                     |
| Position Status     | `open`           | 持倉中       | 倉位尚未平倉                                     |
| Position Status     | `closed`         | 已平倉       | 倉位已結束，納入盈虧/勝率/下行標準差統計         |
| Position Side       | `long`           | 多單         | 做多方向                                         |
| Position Side       | `short`          | 空單         | 做空方向                                         |
| Risk Ranking Sort   | `ascending`      | 安全在前     | 預設：riskScore 由低到高，找相對安全可跟的交易員 |
| Risk Ranking Sort   | `descending`     | 高危在前     | 黑名單模式：riskScore 由高到低                   |
| Provider            | `hyperliquid`    | Hyperliquid  | 鏈上永續 DEX，逐筆 fills 來源                    |
| Provider            | `okx`            | OKX          | CEX copy-trading，per-order sub-position 來源    |

---

## Quick Start Guide

1. **Archeology** — read source code; fill `Technical Name` with raw names found in the codebase.
2. **Mapping** — check UI screens or ask business stakeholders; fill `Domain Term` with the correct canonical name.
3. **Refine** — add business rules (e.g., "this field cannot be negative", "this action must occur after checkout").
4. **Sync** — this document is the single authoritative dictionary for all future renaming, refactoring, and new documentation.
