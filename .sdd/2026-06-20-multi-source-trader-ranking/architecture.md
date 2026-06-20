# 多資料源攝取 + 統一風險排行 — 架構設計

> 來源：`.sdd/2026-06-20-multi-source-trader-ranking/PRD.md`（無 Gherkin，以 PRD 為單一真實來源）
> 參考：`.sdd/UL-MAP.md`、既有 `src/domain` 與 `src/infrastructure`
> 建立日期：2026-06-20

## 1. 專案上下文

- 程式語言：TypeScript（禁 `any`/`unknown`；金額用 `decimal.js`，禁 float）
- 框架：Fastify（controller）、Prisma 7 + `@prisma/adapter-pg`、BullMQ、Vitest
- 架構模式：Clean / Onion（依賴一律指向 domain；介面集中於 `src/domain/interface/`，一檔一介面）
- 命名慣例：識別字 camelCase 全名、DB snake_case 全名；角色後綴固定（Service/Application/Controller/Repository/Client/Proxy）；實作用純角色名、不帶技術前綴

## 2. 功能概述

把資料層由單一來源（Hyperliquid）擴成**多來源（Hyperliquid + OKX）**：將 `IHyperliquidProxy` 一般化為 `ITraderDataProxy`（帶 `Provider` enum），各來源在 infra 邊際**正規化成同一種 domain 形狀**，以 `(provider, address)` 唯一識別，per-provider 平行攝取（失敗隔離），輸出帶 `provider` 的統一風險排行。**OKX 透過 per-order sub-position 重建保住攤平偵測**。訊號層（B）不在範圍。

## 3. 資料模型

### 3.1 列舉/常數

#### Provider（PRD US-02、UL-MAP §4）
domain 以 TS enum、DB 以 Prisma enum，值對齊。

| 值 | 說明 |
|---|---|
| `hyperliquid` | 鏈上永續 DEX，逐筆 fills 來源 |
| `okx` | CEX copy-trading，per-order sub-position 來源 |

### 3.2 核心實體 / VO

#### Trader（entity，PRD US-02）
新增 `provider` 欄位；識別由 `address` 改為 `(provider, address)`。其餘指標行為不變。

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| provider | `Provider` | ✅ | 來源（enum） |
| address | `string` | ✅ | 鏈上地址 或 OKX `uniqueCode` |
| metrics | `TraderMetrics` | ✅ | 既有彙總指標（不變） |

#### TraderActivity（VO，新增 — 取代並一般化 `TraderFill`）
**provider-agnostic 的「倉位變動腿（leg）」**，是各來源正規化後的共同單位、也是重建倉位的輸入。

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| coin | `string` | ✅ | 標的 |
| signedSizeDelta | `Decimal` | ✅ | 帶號變動量（+ 增多/buy、- 減多/sell）；統一重建依據 |
| price | `Decimal` | ✅ | 該腿成交價（HL=fill px；OKX=`openAvgPx`/`closeAvgPx`） |
| size | `Decimal` | ✅ | 絕對數量 |
| realizedProfitAndLoss | `Decimal` | ✅ | 該腿已實現盈虧（HL=`closedPnl`；OKX=`pnl`，開腿為 0） |
| occurredAt | `number` | ✅ | ms epoch（排序鍵） |
| sourceReference | `string` | ✅ | 去重鍵（HL=`tradeId`；OKX=`subPosId`+open/close） |

> 既有 `TraderFill` 的欄位幾乎 1:1 對應（`startPosition` 改以重建時的 running size 推導，見 §5）。

#### OpenPosition（VO，沿用）
維持現狀；新增來源 OKX 由 `public-current-subpositions` 正規化（`uplRatio`→未實現%、`lever`→槓桿）。

#### Position（entity，沿用 + 一般化輸入）
重建工廠由 `reconstruct(fills)` 一般化為 `reconstruct(activities: TraderActivity[])`；`isAveragingDown()` / `maxAdverseExcursion()` 等行為不變。

## 4. 服務介面

### ITraderDataProxy（domain/interface，取代 IHyperliquidProxy）
職責：封裝單一 provider 的讀取，正規化成 domain VO。**domain 不認識任何 vendor 形狀。**

```ts
export interface ITraderDataProxy {
  readonly provider: Provider;
  fetchTraderList(): Promise<LeaderboardTrader[]>;
  fetchPositionActivities(address: string, since: number): Promise<TraderActivity[]>;
  fetchOpenPositions(address: string): Promise<OpenPosition[]>;
}
```

| 方法 | 回傳 | 業務規則 |
|---|---|---|
| `fetchTraderList()` | `LeaderboardTrader[]` | 追蹤名單發現（HL=leaderboard；OKX=`public-lead-traders`） |
| `fetchPositionActivities(address, since)` | `TraderActivity[]` | 自 `since` 起的倉位變動腿（HL=`userFillsByTime`→腿；OKX=`public-subpositions-history`→開/平腿） |
| `fetchOpenPositions(address)` | `OpenPosition[]` | 當前開倉（供 MAE/槓桿快照） |

實作：`HyperliquidProxy`、`OkxProxy`（infra，純角色名）。

### ITraderRepository / IPositionRepository（一般化為 (provider,address)）
所有方法簽名加入 `provider`：
- `saveTraders(provider, addresses)`、`findAllTraderKeys(): {provider,address}[]`、`findRankableTraders(provider?)`、`findTrader(provider, address)`、`saveTraderMetrics(trader)`（trader 自帶 provider）。
- `saveActivities(provider, address, TraderActivity[])`（去重鍵 `sourceReference`）、`findPositions(provider, address)`、`latestActivityTimestamp(provider, address)`（high-watermark，沿用既有 high-watermark 機制）。

### Domain Services（per-provider，沿用既有三隻 + 一般化）
`SyncLeaderboardService` / `PollTraderService` / `RecomputeTraderMetricsService` 改依賴 `ITraderDataProxy`（單一 provider 實例），邏輯不變。`RiskRankingService` 加 `provider` 篩選。

### IngestionOrchestrator（infra/scheduler，平行 + 隔離）
職責：跨 provider 平行跑 pipeline。
- DI `ITraderDataProxy[]`，組裝根為每個 provider 建一組 service。
- 每個 BullMQ repeatable tick：`parallel(providers.map(p => runPipeline(p)))`，以 **`allSettled` 隔離**（一個 provider 失敗不影響其他）。
- provider 內仍循序 `sync → poll → recompute`，且由該 provider 自己的 `RequestWeightLimiter` 節流。

## 5. 架構決策

- **介面一般化（DIP）**：`ITraderDataProxy` + `Provider` enum。新增來源 = 多一個 Proxy 進 DI 清單，orchestration 與 domain 不改（開放封閉）。符合使用者「DI list of 介面、平行 fetching」構想。

- **統一形狀落在 `TraderActivity`（解決 open decision：persistence (a) vs (b)）→ 採 (a) 變體**：
  各 Proxy 在 infra 邊際把來源（HL fills / OKX sub-positions）正規化成 **`TraderActivity`**，存入**單一 `position_activities` 表**，domain 只有**一條** `Position.reconstruct(activities)`。
  - 理由：真正兌現「一個介面、下游零分支、新增源不改 domain」。HL 與 OKX 的差異**完全關在 Proxy**，repository/recompute/ranking 全程 provider-無感。
  - 對 (b)（各存原始、重建分兩路）的取捨：(b) 會讓 provider 滲進 repository 與 recompute 分支；(a) 把變異集中在邊際，長期更乾淨。
  - **Phase 1 影響誠實揭露**：採 (a) 會把現有 `TraderFill`/`position_fills` **一般化更名**為 `TraderActivity`/`position_activities`（+ `provider` 欄）。這是**有界的 rename + 欄位一般化 + migration**，**重建/分類邏輯（含先前 `startPosition` 修正）不動**，HL 行為等價保留。

- **重建一般化**：`Position.reconstruct` 改吃 `TraderActivity[]`，以 `signedSizeDelta` 累計 running size（沿用 sign-flip / 歸零閉倉 / carried-position 排除規則）。HL 的 `startPosition` 改由 activities 排序後的 running size 推導；OKX 各 sub-position 即一腿。

- **OKX 攤平重建（PRD US-04）**：`public-subpositions-history` 每筆 sub-position → 開腿（`openAvgPx`,`subPos`,`openTime`）(+ 平腿 `closeAvgPx`,`pnl`,`closeTime`)；同標的依 `openTime` 排序 → 重建 → `isAveragingDown()` 即可運作。

- **平行 + 隔離**：跨 provider 平行（各自 IP/限流獨立），`allSettled`；provider 內循序 + 自有限流。沿用既有 per-trader 失敗隔離精神。

- **識別**：`Provider` enum + `(provider, address)`；OKX 用 `uniqueCode` 放 address。`Provider`（身分 enum）與 `Proxy`（infra 實作）分工清楚、不衝突。

## 6. 情境對應

| PRD 情境 | 資料模型 | 服務方法 |
|---|---|---|
| US-01 一般化攝取契約 | `ITraderDataProxy`, `Provider` | `fetchTraderList/PositionActivities/OpenPositions` |
| US-02 `(provider,address)` 識別 | `Trader.provider`, `Provider` enum | repository 全簽名加 provider |
| US-03 OKX 名單/倉位接入 | `LeaderboardTrader`, `TraderActivity`, `OpenPosition` | `OkxProxy.*` |
| US-04 OKX 攤平重建 | `TraderActivity`, `Position` | `Position.reconstruct(activities)`, `isAveragingDown()` |
| US-05 排行帶 provider | `TraderRiskDto.provider`, `RiskRankingQuery.provider` | `RiskRankingService.listRanking` |

## 7. 檔案結構（增/改）

```
src/
├── domain/
│   ├── vo/provider.ts                         # 新增：enum Provider
│   ├── vo/traderActivity.ts                   # 新增（一般化自 traderFill.ts）
│   ├── interface/iTraderDataProxy.ts          # 新增（取代 iHyperliquidProxy.ts）
│   ├── entity/trader.ts                        # 改：加 provider
│   ├── entity/position.ts                      # 改：reconstruct(activities)
│   └── service/{sync,poll,recompute,riskRanking}*.ts  # 改：依賴 ITraderDataProxy / provider
├── infrastructure/
│   ├── hyperliquid/hyperliquidProxy.ts         # 改：implements ITraderDataProxy（fills→activities）
│   ├── okx/okxProxy.ts                          # 新增（Phase 2）
│   ├── okx/okxWire.ts                           # 新增（Phase 2，vendor 型別）
│   ├── persistence/{trader,position}Repository.ts  # 改：(provider,address)
│   └── scheduler/scheduler.ts                   # 改：跨 provider 平行 + allSettled
├── controller/*                                # 改：/rankings ?provider=、/traders 區分 provider
├── main.ts / worker.ts                         # 改：DI ITraderDataProxy[]、per-provider 組裝
└── prisma/schema.prisma                        # 改：enum Provider；traders PK(provider,address)；position_activities；全表加 provider
tests/ 鏡像對應（entity 重建/攤平、application mock ITraderDataProxy、repository keying）
```

## 8. 分階段

- **Phase 1（Hyperliquid only，無外部依賴）**：`Provider` enum + `(provider,address)` 識別 + `ITraderDataProxy` 抽象 + `TraderActivity`/`position_activities` 一般化 + migration（既有資料回填 `provider='hyperliquid'`）+ scheduler 平行骨架。HL 行為等價、測試保持綠。
- **Phase 2（OKX，前置：實測 sub-position 粒度 + 認證）**：`OkxProxy` + sub-position→`TraderActivity` 正規化 + OKX 組裝/限流/金鑰。

## 9. 待確認（延續 PRD §8 Open Decisions）

1. OKX sub-position = per-open-order 實測確認；「同 subPosId 內部加倉」盲點影響。
2. OKX 認證（`public-*` 是否需 key）。
3. OKX 多筆 sub-position 歸併為「開→平」邏輯倉位的口徑（建議：依 `openTime` 串成 activities，由統一 `reconstruct` 處理）。
4. 跨源排行：統一榜 vs 分場所榜（建議先分場所 + provider 標籤）。
5. 是否抽 `IRateLimiter` 共用介面給各 Proxy。
