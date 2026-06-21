# Trader Risk Radar

> 針對 Hyperliquid（與 OKX）鏈上永續合約交易員的**風險分析 + 排行 REST API**。

**English version → [README.en.md](./README.en.md)**

`riskScore` 衡量的是「**跟單有多危險**」，而非報酬。本系統專門揪出**高勝率但深回撤／攤平的馬丁格爾陷阱型交易員**——這類交易員排名榜上好看，但散戶本金小、無法跟進加倉，常「死在交易員賺錢的必經之路上」。

第一版定位：純 REST、定時輪詢（非串流）、**不代操、不下單、不碰私鑰**。

---

## 核心理念

市面跟單平台只看報酬、不揭露風險。本系統反過來——分數越高代表**跟單越危險**：

- **MAE（最大逆向幅度）** — 倉位在反轉前偷偷扛了多深的浮虧。
- **攤平比率（averagingDownRatio）** — 在不利價位加倉拉均價的馬丁格爾行為佔比。
- **陷阱訊號（trapSignal）** — `winRate × normalize(MAE)`，抓「看似穩、實則深扛」的交易員。
- **下行標準差（returnDownsideDeviation）** — 賠的時候穩不穩、會不會突然爆一筆。

`riskScore`（0–100，越高越危險）為上述指標的加權合成。完整公式為 PRD 第 4 章。

---

## 技術棧

| 層面 | 選型 |
| :--- | :--- |
| 語言 / 執行環境 | TypeScript · Node.js（套件管理與執行用 **Bun**） |
| Web 框架 | Fastify |
| ORM / 資料庫 | Prisma 7（`@prisma/adapter-pg`）· PostgreSQL + TimescaleDB |
| 快取 / 佇列 | Redis · BullMQ（背景排程） |
| 數值處理 | `bigint` + `decimal.js`（**禁用 JS float**） |
| 測試 / 品質 | Vitest · ESLint · Prettier · Husky（pre-commit lint + typecheck） |
| 部署 | 單一 VPS + Docker Compose |
| 資料來源 | Hyperliquid 官方 REST API · OKX copytrading 公開 API |

---

## 架構（Clean / Onion Architecture）

依賴方向一律指向 **Domain（核心）**；Domain 不依賴任何人。

```
Controller ───▶ Application ───▶ Domain ◀─── Infrastructure
(HTTP/Fastify)   (use cases)     (核心)      (Repository/Client/Proxy 實作)
```

- **`src/domain/`** — 充血 entity（`entity/`）、value object（`vo/`）、回傳 DTO（`dto/`）、Domain Service（`service/`）、對外介面（`interface/`，一檔一介面）。計算邏輯放在 entity 方法上。
- **`src/application/`** — 用例編排，呼叫 domain service，回傳 DTO。
- **`src/controller/`** — Fastify 路由 + HTTP 轉換。
- **`src/infrastructure/`** — `persistence/`（Prisma repository）、`hyperliquid/` 與 `okx/`（proxy + wire 原始型別）、`scheduler/`（BullMQ）。
- 具體實作在組裝根 `src/main.ts`（API）與 `src/worker.ts`（背景作業）注入。

詳細規範見 [`CLAUDE.md`](./CLAUDE.md) 與 `.sdd/` 下的權威文件。

---

## 快速開始

### 方式一：全 Docker（推薦，一鍵）

```bash
bun run compose:up            # 起 Postgres + Redis + migrate + api + worker
curl localhost:3000/health    # → {"status":"ok"}
bun run compose:logs          # 跟看 log
bun run compose:down          # 停止（加 -v 連 volume 清除）
```

### 方式二：本機開發（app 跑在 host，watch 模式）

```bash
docker compose up -d postgres redis   # 只起外部依賴
cp .env.example .env                   # 設定環境變數
bun install                            # postinstall 會自動 prisma generate
bunx prisma migrate deploy             # 套用 migration
bun run worker                         # 背景同步 / 輪詢 / 重算
bun run dev                            # REST API（watch）
```

> 選用：將 `position_snapshots` 轉為 TimescaleDB hypertable：
> `SELECT create_hypertable('position_snapshots', 'captured_at', migrate_data => true);`

---

## REST API 端點

| Method | 路徑 | 說明 |
| :--- | :--- | :--- |
| `GET` | `/health` | 健康檢查，回 `{"status":"ok"}` |
| `GET` | `/rankings` | 風險導向排行（依 `riskScore` 排序，預設安全在前） |
| `GET` | `/traders` | 追蹤中的交易員清單 |
| `GET` | `/traders/:address` | 單一交易員完整風險指標；找不到回 404 |
| `GET` | `/consensus` | 安全群（低風險交易員）持倉共識 |
| `GET` | `/consensus/:coin` | 指定幣種的共識；無合格共識回 404 |
| `GET` | `/signals` | 由安全群共識導出的進場訊號（experimental，**非下單指令**） |
| `GET` | `/coins` | 有共識紀錄的標的清單 `{ coins: [] }`（`/backtest` 的可查詢標的字典） |
| `GET` | `/backtest` | **內部／受保護**：某 coin 的訊號回測（命中率／前向報酬 + 資料充足度），同步、experimental、**非下單指令** |

**常用查詢參數**

- `/rankings`：`provider`、`direction`（`ascending`／`descending`）、`offset`、`limit`
- `/consensus`、`/signals`：`provider`、`weighting`（`equal`／`conviction`）、`maxRiskScore`（0–100）、`minParticipants`（≥1）、`offset`、`limit`
- `/backtest`：`coin`（**必填**）、`since`（ms epoch，預設 0=全部）、`horizonsHours`（逗號小時清單如 `4,24,72`，覆蓋 env 預設）

> 已平倉位數不足者標記 `insufficientData`、不給 `riskScore`。
> `/backtest` 為內部端點：設 `BACKTEST_API_TOKEN` 後須帶相符的 `x-internal-token` 標頭（否則 401）；視窗預設由 `BACKTEST_HORIZONS_HOURS` 設定。每筆 horizon 帶 `dataAdequacy` 分級（多數 coin × horizon 因資料尚淺會顯示 `insufficient`）。
> Postman collection 見 [`postman/`](./postman/)。

---

## 背景作業（worker）

`bun run worker` 啟動 BullMQ 排程，**啟動即立刻跑一輪**，之後依各自 interval 定時執行：

```
synchronizeLeaderboard → pollTrader → recomputeTraderMetrics → snapshotConsensus
   (同步 leaderboard)     (分層輪詢倉位)    (依公式重算 riskScore)   (留存共識時序)
```

指標計算僅採用**近 90 天已平倉位**，以成交唯一 id 去重。同時對 Hyperliquid 與 OKX 兩個 provider 執行，含 per-IP weight 限流與 429 退避（見 `.env.example`）。

---

## 常用指令

| 指令 | 說明 |
| :--- | :--- |
| `bun run dev` / `bun run start` | 開發（watch）／啟動 API |
| `bun run worker` / `bun run worker:dev` | 背景排程 |
| `bun run test` / `bun run test:watch` | Vitest 單元測試 |
| `bun run lint` / `bun run lint:fix` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run format` / `bun run format:check` | Prettier |
| `bun run db:generate` / `bun run db:migrate` | Prisma generate／migrate |

---

## 開發規範（重點摘要）

- **命名一律全名、禁止縮寫**（`maxAdverseExcursionPercentile90`，不可寫 `mae`）。
- **禁用 `any` / `unknown`**；金額／鏈上數值禁用 JS float。
- 各層角色用固定後綴：`Service`（domain）、`Application`、`Controller`、`Repository` / `Client` / `Proxy`（infra）。
- entity 用 `class`（充血、含行為）；DTO / Request / 無行為 VO 用 `type`。
- 介面集中在 `src/domain/interface/`，`I` 前綴、一檔一介面。
- 資料存取一律走 ORM（code-first），禁手寫 SQL。

完整約束與測試策略見 [`CLAUDE.md`](./CLAUDE.md)。

---

## 文件

採 **Spec-Driven Development (SDD)**，動工前請先讀：

- `.sdd/2026-06-19-trader-risk-radar/PRD.md` — 需求與**指標計算公式（第 4 章）**，為實作的單一真實來源。
- `.sdd/UL-MAP.md` — 通用語言地圖（命名以此為準）。
- `.sdd/2026-06-19-trader-risk-radar/BRIEF.md` — 需求共識。
- `DISCUSSION.md` — 完整背景與根因診斷。
