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

| 層面 | 選型 | 角色 / 備註 |
| :--- | :--- | :--- |
| 語言 | **TypeScript** | 全專案；禁用 `any` / `unknown`（見 Conventions）|
| 執行環境 | **Node.js** | |
| Web 框架 | **Fastify** | REST API（Controller 層）。比 Express 快、TS 支援好；不選 NestJS（對 solo 過重）|
| ORM | **Prisma 7** | 資料存取；`schema.prisma` 為 code-first 單一來源（v7：不含 `url`）。連線 URL 在 `prisma.config.ts`（供 CLI/Migrate）；執行時用 **`@prisma/adapter-pg`**（`pg` driver adapter）連線，工廠在 `src/infrastructure/persistence/prismaClient.ts`。透過型別安全 client 存取、禁手寫 SQL；金額欄用 `Decimal`，不用浮點 |
| 資料庫 | **PostgreSQL + TimescaleDB** | 時序資料（`position_events`、`position_snapshots`）；Timescale 擴充加速時間窗查詢 |
| 快取 / 佇列 | **Redis** | BullMQ 後端、即時狀態快取 |
| 背景作業 | **BullMQ** | leaderboard 同步、分層輪詢、分析引擎排程 |
| 鏈上互動 | **viem**（後續接 EVM 協議時） | TS-first；第一版打 Hyperliquid 官方 API 可能用不到 |
| 數值處理 | **bigint + decimal.js / dnum** | 金額/鏈上數值；**禁用 JS float** |
| 測試 | **Vitest（建議）** | 單元測試驅動指標計算引擎（TDD）|
| 程式碼品質 | **ESLint** + **Prettier** + **Husky** | pre-commit 強制 lint + type check |
| 部署 | **單一 VPS + Docker Compose** | 不用 K8s / 微服務 |
| 資料來源 | **Hyperliquid 官方 REST API** | 第一版唯一來源（leaderboard、clearinghouseState 等）|
| 對外交付 | **REST（pull）** | 第一版；SSE 即時推送列為後續階段 |

## Architecture — Clean / Layered Architecture

嚴格分層，依賴方向由上而下，**各層之間一律以介面（interface）互動以達成 DIP（依賴倒置）**：

```
Controller            ← HTTP 入口 (Fastify route handlers)，只負責請求/回應轉換
  ↓ (interface)
Application Service    ← 用例編排 (use case orchestration)，協調 domain 與 repository
  ↓ (interface)
Domain Service         ← 核心業務邏輯：指標計算、riskScore、攤平偵測等（純、可單元測試）
  ↓ (interface)
Repository / Proxy     ← 資料存取 (ORM) 與外部 API (Hyperliquid) 的抽象
```

- 上層只依賴下層的**介面**，不依賴具體實作；具體實作於組裝根（composition root）注入。
- **核心領域邏輯（指標計算引擎）** 應為純函式 / 純 Domain Service，不依賴 I/O，便於 TDD。
- 背景流程（與 REST 查詢解耦）：`synchronizeLeaderboard` → `pollTrader`（分層排程，BullMQ）→ 分析引擎重算 `trader_metrics`。查詢端只讀預算好的 `trader_metrics`。

## Engineering Conventions（強制）

- **命名一律全名，禁止任何縮寫。** 例：`maxAdverseExcursionPercentile90`、`weightReturnDownsideDeviation`、`realizedProfitAndLoss`——不可寫 `mae` / `pnl` / `w_lev`。程式識別字用 camelCase 全名；DB 表/欄用 snake_case 全名。
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
`src/controller/`（Fastify 路由）· `src/application/`（用例編排）· `src/domain/`（指標計算引擎，純邏輯）· `src/infrastructure/`（Prisma repository + Hyperliquid proxy）· `src/shared/`（跨層工具）· `src/main.ts`（組裝根 / server bootstrap）。

**測試集中在 `tests/`**（不與原始碼並列），目錄結構鏡像 `src/`。測試一律用 **`@/` path alias** 匯入待測模組（`@/` → `src/`），例如 `import { normalize } from '@/domain/metrics/normalize'`；原始碼內部彼此仍用相對匯入。alias 同時設定於 `tsconfig.json`（`paths`）與 `vitest.config.ts`（`resolve.alias`）。
