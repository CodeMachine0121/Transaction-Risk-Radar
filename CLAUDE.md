# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Trader Risk Radar** — 針對 Hyperliquid 鏈上永續合約交易員的**風險分析 + 排行 REST API**。核心立場：`riskScore` 衡量「**跟單有多危險**」而非報酬，專門揪出「高勝率但深回撤/攤平」的馬丁格爾陷阱交易員。第一版僅 Hyperliquid、純 REST、定時輪詢（非串流）、不代操不下單。

此專案採 **Spec-Driven Development (SDD)**。動工前務必先讀以下權威文件：

- `.sdd/PRD.md`（`.sdd/2026-06-19-trader-risk-radar/PRD.md`）— 需求、User Stories、**指標計算公式（第 4 章）** 為實作的單一真實來源。
- `.sdd/UL-MAP.md` — 通用語言地圖。**所有實體 / 動作 / 識別字命名以此為準**，不得自創同義詞。
- `.sdd/2026-06-19-trader-risk-radar/BRIEF.md` — 需求共識。
- `DISCUSSION.md` — 完整背景與根因診斷（為何要做、痛點本質）。

> 修改業務邏輯或新增功能時，對應的 SDD 文件需同步更新，文件與程式碼不可漂移。

## Tech Stack

| 層面        | 選型                                  | 角色 / 備註                                                                                                                                                                                                                                                                                                     |
| :---------- | :------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 語言        | **TypeScript**                        | 全專案；禁用 `any` / `unknown`（見 Conventions）                                                                                                                                                                                                                                                                |
| 執行環境    | **Node.js**                           |                                                                                                                                                                                                                                                                                                                 |
| Web 框架    | **Fastify**                           | REST API（Controller 層）。比 Express 快、TS 支援好；不選 NestJS（對 solo 過重）                                                                                                                                                                                                                                |
| ORM         | **Prisma 7**                          | 資料存取；`schema.prisma` 為 code-first 單一來源（v7：不含 `url`）。連線 URL 在 `prisma.config.ts`（供 CLI/Migrate）；執行時用 **`@prisma/adapter-pg`**（`pg` driver adapter）連線，工廠在 `src/infrastructure/persistence/prismaClient.ts`。透過型別安全 client 存取、禁手寫 SQL；金額欄用 `Decimal`，不用浮點 |
| 資料庫      | **PostgreSQL + TimescaleDB**          | 時序資料（`position_events`、`position_snapshots`）；Timescale 擴充加速時間窗查詢                                                                                                                                                                                                                               |
| 快取 / 佇列 | **Redis**                             | BullMQ 後端、即時狀態快取                                                                                                                                                                                                                                                                                       |
| 背景作業    | **BullMQ**                            | leaderboard 同步、分層輪詢、分析引擎排程                                                                                                                                                                                                                                                                        |
| 鏈上互動    | **viem**（後續接 EVM 協議時）         | TS-first；第一版打 Hyperliquid 官方 API 可能用不到                                                                                                                                                                                                                                                              |
| 數值處理    | **bigint + decimal.js / dnum**        | 金額/鏈上數值；**禁用 JS float**                                                                                                                                                                                                                                                                                |
| 測試        | **Vitest（建議）**                    | 單元測試驅動指標計算引擎（TDD）                                                                                                                                                                                                                                                                                 |
| 程式碼品質  | **ESLint** + **Prettier** + **Husky** | pre-commit 強制 lint + type check                                                                                                                                                                                                                                                                               |
| 部署        | **單一 VPS + Docker Compose**         | 不用 K8s / 微服務                                                                                                                                                                                                                                                                                               |
| 資料來源    | **Hyperliquid 官方 REST API**         | 第一版唯一來源（leaderboard、clearinghouseState 等）                                                                                                                                                                                                                                                            |
| 對外交付    | **REST（pull）**                      | 第一版；SSE 即時推送列為後續階段                                                                                                                                                                                                                                                                                |

## Architecture — Clean / Onion Architecture

**依賴方向一律指向 Domain（核心）；Domain 不依賴任何人。**

```
   Controller ───▶ Application ───▶ Domain ◀─── Infrastructure
   (HTTP/Fastify)   (use cases)     (核心)        (Repository/Client/Proxy 實作)
                                      ▲
                         src/domain/interface/ 放所有對外介面（一介面一檔）
```

- **Domain（核心）**：entity、value object、領域計算邏輯、**Domain Service**，以及**所有對外介面**（集中在 `src/domain/interface/`，一介面一檔）。**Domain 不 import 任何其他層**（不認識 HTTP、Hyperliquid、Prisma…）。
- **Application** 依賴 Domain：呼叫 **Domain Service** 編排用例，拿回 **DTO**（不碰 entity）。
- **Controller** 依賴 Application：只負責 HTTP 請求/回應轉換。
- **Infrastructure**（Repository / Client / Proxy 的**實作**）依賴 Domain：實作 `domain/interface/` 的介面（DIP——細節依賴抽象）。
- 具體實作在組裝根（`main.ts` / `server.ts`）注入。

### Domain 內部結構

domain **只依「種類」分這五個資料夾**，不出現 `market` / `assembly` / `metrics` / `reconstruction` 等概念資料夾：

- `entity/` — 充血實體（`class`，含行為）。**entity 絕不直接回傳給 application。**
- `vo/` — value object（不可變純資料、無行為，`type`）：如 proxy 正規化後的 `traderFill`、`openPosition`、`leaderboardTrader`、`positionSnapshotRecord`。
- `dto/` — Domain DTO：domain 對 application 的**唯一回傳形狀**（多轉一層，不外漏 entity）。
- `service/` — **Domain Service**：application 的唯一呼叫入口。透過 `interface/` 的 repository/proxy 介面取得 entity、執行計算邏輯，再把 entity **轉成 DTO** 回傳。命名 `XxxService`，**一個檔案只有一個 service class**。
- `interface/` — repository / proxy 介面（一介面一檔）。
- **計算行為放在 entity 的方法上**（Rich Domain Model，「讓 model 講話 / Tell, Don't Ask」）：service 取得 entity 後呼叫其方法。**禁止 helper 類別或散落的計算函式（壞味道）。** 跨多個 entity 的運算（如排行）才放 Domain Service。

**呼叫鏈**：`Application → DomainService → repository 介面（impl 在 infra）→ entity → service 轉 DTO → 回傳 DTO`。Application 全程不碰 entity。背景流程：`SyncLeaderboardService` → `PollTraderService`（BullMQ 排程）→ `RecomputeTraderMetricsService`。

> **不使用「port」一詞或資料夾**——對外介面一律稱「介面」，集中在 `src/domain/interface/`。

## Engineering Conventions（強制）

- **命名一律全名，禁止任何縮寫。** 例：`maxAdverseExcursionPercentile90`、`weightReturnDownsideDeviation`、`realizedProfitAndLoss`——不可寫 `mae` / `pnl` / `w_lev`。程式識別字用 camelCase 全名；DB 表/欄用 snake_case 全名。
- **各層角色用固定後綴命名，且只有這幾種角色**（除非未來要拆分 pattern，否則不出現 `Handler` / `Manager` 等其他角色詞）：
  | 角色 | 後綴 | 層 |
  | :--- | :--- | :--- |
  | Domain service | `Service` | domain |
  | Application | `Application` | application |
  | Controller | `Controller` | controller |
  | Repository | `Repository` | infrastructure |
  | Client | `Client` | infrastructure |
  | Proxy | `Proxy` | infrastructure |

  `Service` 後綴僅用於跨 entity 的編排（取資料、轉 DTO、多 entity 運算）；單一 entity 的計算放 entity 自己的方法（不另立 service 或 helper）。

- **資料物件命名**（domain model 只有 entity 與 dto 兩種）：
  | 類別 | 規則 |
  | :--- | :--- |
  | Entity（domain 物件，**`class`，含資料與行為**）| 以領域語彙命名，**不加 `Dto`**；放 `domain/entity/` |
  | Domain DTO（service 回傳給 application 的形狀，**`type`**）| `Dto` 後綴；放 `domain/dto/` |
  | Endpoint 接收的物件（querystring / params / body，**`type`**）| `Request` 後綴；放 controller 旁 |

  **Entity 用 `class`（充血、含行為）；DTO / Request / 無行為 value object 用 `type`。** 回應直接回傳、不另立 `Response`。例：`TraderRiskDto`（service 回傳）、`RiskRankingRequest`（入站查詢）。

- **`interface` 只用於「行為契約」**（會被 class 實作或被注入的相依）：如 `ITraderMetricsRepository`、`IHyperliquidProxy`、`IPositionRepository`。一律 `I` 前綴，**集中放在 `src/domain/interface/`，一個介面一個檔案（鐵則）**。**實例檔（class / 函式模組）內不得宣告任何 `interface`。不使用「port」一詞或資料夾。**
- **純資料形狀用 `type`**（不用 `interface`、不加 `I`）：DTO / Request / 無行為的 value object（如 `TraderRiskDto`、`RiskRankingRequest`）。**Entity 是 `class`（含行為），不是 `type`。**
- **固定資料形狀優先以泛型帶入契約**，而非為其定義具名資料介面：如 `IRepository<TEntity>`、`IResponse<TData>`。
- **DTO 是 domain 的回傳邊界**：Domain Service 把 entity 轉成 DTO（`domain/dto/`，`type`、`Dto` 結尾）回傳給 application；**entity 不可外漏到 application/controller。**
- **外部 wire / vendor 形狀屬 infrastructure**：放在邊際層（`type`）；若外部 library 自帶型別，**只有邊際層依賴它**，domain 永不接觸。
- **具體實作用「純角色名」**：實作不帶 `I`、**也不帶技術前綴**（class 名與檔名都是）。例：`ITraderMetricsRepository` 的實作是 `TraderMetricsRepository`（**不是** `PrismaTraderMetricsRepository`）；`IHyperliquidProxy` 的實作是 `HyperliquidProxy`（**不是** `HyperliquidHttpProxy`）。
- **檔名必須對齊其主要型別/符號**（嚴格）：
  - 介面檔（在 `domain/interface/`）→ `i` 前綴 camelCase、一檔一介面，如 `iTraderMetricsRepository.ts`、`iHyperliquidProxy.ts`。
  - 實作檔 → 純角色名 camelCase，如 `traderMetricsRepository.ts`、`hyperliquidProxy.ts`。
  - 以函式為主的模組檔 → 跟著主要函式命名（如 `reconstructPositions.ts`、`assembleTraderPositionInputs.ts`）。
- **TypeScript 禁用 `any` 與 `unknown`。** 一律給出明確型別。
- **禁止「先宣告後賦值」。** 變數必須在宣告當下即賦值（不可先 `let x;` 之後再指派）。
- **嚴禁 `private static` method。** 視為 code smell——應抽到對應物件成為其 instance method，透過實例呼叫。**單元測試除外。**
- **資料存取一律走 ORM，禁止在程式碼中手寫 SQL 字串。** 採 **code-first**（schema 定義於程式碼，migration 由其產生）。
- **金額/鏈上數值一律以 `bigint` + decimal 函式庫（decimal.js / dnum）處理，禁用 JavaScript `number`（float）。** 精度錯誤會讓所有指標計算失準。
- 詞彙歧義已在 UL-MAP 第 3 節釘定：官方來源稱 **Leaderboard**、本系統輸出稱 **Risk Ranking**；浮動值用 `unrealizedProfitAndLossPercentage`、結算值用 `realizedProfitAndLoss`；波動一律指**下行標準差** `returnDownsideDeviation`。

## Commit Workflow

- **Husky pre-commit hook** 須執行 **ESLint** 與 **TypeScript type check (`tsc --noEmit`)**；任一失敗即**阻擋 commit**。
- ESLint 規則須能擋下上述規範違反（no-explicit-any、禁 `unknown`、命名等），讓約束自動化而非靠人記。

## Commands

套件管理與執行一律使用 **Bun**。

- `bun install` — 安裝依賴
- `bun run dev` — 開發模式（watch）啟動 Fastify server
- `bun run start` — 啟動 server
- `bun run lint` / `bun run lint:fix` — ESLint
- `bun run typecheck` — `tsc --noEmit`
- `bun run format` / `bun run format:check` — Prettier
- `bun run test` — 跑全部單元測試（Vitest）
- `bun run test:watch` — watch 模式
- 執行單一測試檔：`bunx vitest run tests/path/to/file.test.ts`
- `bun run db:generate` — `prisma generate`
- `bun run db:migrate` — `prisma migrate dev`（code-first migration）

> 環境變數見 `.env.example`（複製為 `.env`）。Prisma 指令需要 `DATABASE_URL`。

## Layout

`src/` 依分層架構組織，各層職責見其 `README.md`：

- `src/domain/`（核心，**只依種類分五個資料夾**）：`entity/`（充血 entity class）· `vo/`（value object `type`）· `dto/`（回傳 DTO `type`）· `service/`（Domain Service，一檔一 class）· `interface/`（對外介面，一檔一介面）
- `src/application/`（用例編排，呼叫 domain service；**無 ports 資料夾**）
- `src/controller/`（Fastify 路由 + Request `type`）
- `src/infrastructure/`：`persistence/`（Prisma repository）· `hyperliquid/`（proxy + `hyperliquidWire` 原始型別）
- `src/shared/`（跨層工具）· `src/main.ts` / `src/server.ts`（組裝根）

**測試集中在 `tests/`**（不與原始碼並列），目錄結構鏡像 `src/`。測試一律用 **`@/` path alias** 匯入待測模組（`@/` → `src/`）；原始碼內部彼此仍用相對匯入。alias 同時設定於 `tsconfig.json`（`paths`）與 `vitest.config.ts`（`resolve.alias`）。

## Testing 策略（強制）

- **Entity**：直接單元測試（充血方法是核心計算邏輯）。
- **Domain Service**：**不單獨測試、也不做 fake / mock**。它**沒有介面**，以**具體實例**注入 application。
- **Application 測試**：注入**真實的 domain service（連帶真實 entity）**，**只 mock 最外層的介面**（repository / proxy / writer，用 `vi.fn`）。如此測 application 時會**連帶測到 domain service 與 entity**——這就是刻意的「測試力度放大」。
- mock 一律針對**介面**（`vi.fn` + `mockResolvedValue`），**不手寫 fake 實作類別**。
