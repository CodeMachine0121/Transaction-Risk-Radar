# 安全群持倉共識雷達 Safe Cohort Consensus — 架構設計

> 來源：`.sdd/2026-06-20-safe-cohort-consensus/PRD.md`（無 Gherkin，以 PRD 為單一真實來源）
> 參考：`.sdd/UL-MAP.md`、既有 `src/domain` 與 `src/infrastructure`
> 建立日期：2026-06-20

## 1. 專案上下文

- 程式語言：TypeScript（禁 `any`/`unknown`；金額/比率/權重用 `decimal.js`，禁 float）
- 框架：Fastify（controller）、Prisma 7 + `@prisma/adapter-pg`、Vitest
- 架構模式：Clean / Onion（依賴一律指向 domain；介面集中 `src/domain/interface/`，一檔一介面；跨 entity 運算放 Domain Service，單 entity 計算放 entity 方法）
- 命名慣例：識別字 camelCase 全名、DB snake_case 全名；角色後綴固定（Service/Application/Controller/Repository）；實作用純角色名

## 2. 功能概述

新增描述性共識 API：在 `findRankableTraders`（已含 `insufficientData=false` + `riskScoreTier=position`）的群體中，再以 `riskScore ≤ maxRiskScore` 收斂為「安全群」，讀其**當前未平倉**快照（須在新鮮度窗內、`signedSize ≠ 0`），以 inverse-riskScore **每人一票**加權聚合每個 coin 的淨多空方向。輸出 `netDirectionBias`、`consensusStrength`、參與人數、平均槓桿並附免責。前置須讓快照**保留方向**（目前被 `.abs()` 丟棄）。**非買賣建議、非價格預測。**

## 3. 資料模型

### 3.1 列舉/常數（沿用既有）

- `Provider`（`hyperliquid`/`okx`，沿用）；共識僅 `position`-tier 參與，OKX（account-tier）結構性排除（PRD §1 Out of Scope）。
- 預設常數（service 內，可由 query 覆寫）：`DEFAULT_MAX_RISK_SCORE = 40`、`DEFAULT_MINIMUM_CONSENSUS_PARTICIPANTS = 3`、`consensusFreshnessWindowMs`（組裝根注入，預設 `2 × POLL_INTERVAL_MS`）。

### 3.2 核心 VO / 實體

#### PositionSnapshot（DB model，改）— 來源：PRD US-03（保留方向）
| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| signedSize | `Decimal @db.Decimal(38,18)` `@map("signed_size")` | ✅ | **新增**：帶號持倉量（正=多、負=空）。migration 既有列補預設 `0`（舊列不在新鮮度窗內，不影響共識） |

#### PositionSnapshotRecord（VO，改）— 來源：PRD US-03
既有 `{ coin, markPrice, unrealizedProfitAndLossPercentage, margin, leverage }` **新增** `signedSize: Decimal`（帶號，不再 `.abs()`）。

#### CurrentOpenPosition（VO，新增）— 來源：PRD US-01/US-04（當前未平倉、新鮮度）
安全群某交易員此刻於某 coin 的持倉（repository 由「最新且新鮮的快照」產出）。
| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| traderAddress | `string` | ✅ | 持有者（join 回 cohort riskScore 用） |
| coin | `string` | ✅ | 標的 |
| signedSize | `Decimal` | ✅ | 帶號；`> 0 → long(+1)`、`< 0 → short(−1)`。僅用符號，不用量值 |
| leverage | `Decimal` | ✅ | 該持倉槓桿（算 `averageLeverage`） |
| capturedAt | `number` | ✅ | ms epoch（新鮮度判定，repository 已過濾） |

#### Trader（entity，改）— 來源：PRD §4 規則 1（權重）
新增行為方法（單一 entity 計算 → 放 entity 自身，符合 Tell-Don't-Ask）：
- `consensusWeight(): Decimal` = `clamp(1 − riskScore/100, 0, 1)`；`riskScore` 為 null 時回 `0`（cohort 已保證非 null，防呆）。

#### CoinConsensusDto（DTO，新增）— 來源：PRD §4 規則 2–4
| 欄位 | 型別 | 說明 |
|---|---|---|
| coin | `string` | 標的 |
| netDirectionBias | `string` | `Σ(side×weight)/Σ(weight)`，−1…+1（Decimal→字串） |
| consensusStrength | `string` | `\|netDirectionBias\|`，0…1 |
| participantCount | `number` | 安全群於該 coin 的持倉人數 |
| longCount | `number` | 做多人數 |
| shortCount | `number` | 做空人數 |
| longShareOfParticipants | `string` | `longCount/participantCount` |
| averageLeverage | `string` | 安全群於該 coin 的平均槓桿 |

#### SafeCohortConsensusDto（DTO 信封，新增）— 來源：PRD US-01 AC4（免責）
`{ disclaimer: string; coins: CoinConsensusDto[] }`。回應直接回傳此 DTO（不另立 Response 型別）。單一 coin 端點回傳僅含一筆 `coins` 的同一信封。

#### SafeCohortConsensusQuery（VO，新增）— 來源：PRD US-05
`{ provider?: Provider; maxRiskScore?: number; minimumConsensusParticipants?: number; offset?: number; limit?: number }`。

## 4. 服務介面

### IPositionRepository（domain/interface，加一方法）— 來源：PRD US-01/US-04
```ts
/** 取安全群當前未平倉：每位交易員每個 coin 取「最新且 capturedAt ≥ freshAfter」的快照，
 *  排除 signedSize = 0（已平倉）。跨 (provider, address) 以單次查詢回傳。 */
findCurrentOpenPositions(
  provider: Provider,
  traderAddresses: string[],
  freshAfter: number,
): Promise<CurrentOpenPosition[]>;
```
實作 `PositionRepository`：`position_snapshots` where `(provider, traderAddress ∈ addresses, capturedAt ≥ freshAfter)`，依 `(traderAddress, coin, capturedAt desc)` 取每組首筆（DISTINCT ON 不手寫 SQL → 以 Prisma `findMany`＋in-memory 取最新；資料量受 cohort 限定，可接受），過濾 `signedSize ≠ 0`。

### SafeCohortConsensusService（domain/service，新增）— 來源：PRD US-01/US-02/US-04/US-05
職責：跨多 Trader + 其當前持倉的**聚合**（跨 entity → Service）。依賴 `ITraderRepository` + `IPositionRepository`。

建構選項：`{ now?: () => number; freshnessWindowMs: number }`（`now` 供測試注入）。

#### listConsensus(query: SafeCohortConsensusQuery): Promise<SafeCohortConsensusDto>
**業務規則：**
1. `cohort = traderRepository.findRankableTraders(query.provider)`，再過濾 `riskScore ≤ maxRiskScore`（預設 40）。
2. `freshAfter = now() − freshnessWindowMs`；`positions = positionRepository.findCurrentOpenPositions(provider, cohort.addresses, freshAfter)`。
3. 以 `traderAddress` join 回 cohort 取 `consensusWeight()`；依 `coin` 分組。
4. 每組計算 `netDirectionBias = Σ(side×weight)/Σ(weight)`（`side` 由 `signedSize` 符號）、`consensusStrength`、`longCount/shortCount/participantCount`、`longShareOfParticipants`、`averageLeverage`。
5. 過濾 `participantCount ≥ minimumConsensusParticipants`（預設 3）。
6. 依 `consensusStrength` 由高到低排序、`offset/limit` 分頁。
7. 包進信封 `{ disclaimer, coins }`。

#### coinConsensus(coin: string, query): Promise<SafeCohortConsensusDto | null>
同上但只計該 coin；`participantCount < minimumConsensusParticipants` → 回 `null`（controller 轉 404）。

> Domain Service 無介面、不 mock，以具體實例注入 application（CLAUDE.md 測試策略）。`disclaimer` 文案為 domain 常數（風險框定屬領域知識）。

### SafeCohortConsensusApplication（application，新增）
委派 service 的 `listConsensus` / `coinConsensus`，回傳 DTO。

### SafeCohortConsensusController（controller，新增）— 來源：PRD US-01/US-02/US-05
- `GET /consensus`：querystring → `SafeCohortConsensusRequest`（`provider?/maxRiskScore?/minParticipants?/offset?/limit?`），解析校驗（非法回 400）→ `application.listConsensus`。
- `GET /consensus/:coin`：params `coin` + 同 querystring → `application.coinConsensus`；`null` → 404。
- Request 解析沿用既有 `parseProvider` 與 `parseOptionalInteger` 樣式。

## 5. 架構決策

- **資料路徑採「補快照 `signedSize`」**（PRD §4 決議）：快照源自 `clearinghouseState`，看得到此刻**全部**持倉（含 carried）；fills 重建會排除 carried。僅 `toSnapshotRecord` 移除 `.abs()` + schema 加欄 + migration，**不動 MAE/槓桿計算**（仍以 `|signedSize|` 推 notional）。
- **聚合放 Service、權重放 entity**：跨多 trader 的方向聚合是跨 entity 運算 → `SafeCohortConsensusService`；單一 trader 的 `consensusWeight()` 是其自身計算 → Trader 方法（不另立 helper）。`side` 由 `signedSize` 符號在 service 聚合迴圈內取得（屬聚合的一部分，非散落 helper）。
- **沿用 `findRankableTraders` 當 cohort 基底**：它已濾 `insufficientData=false` + `tier=position`，與「安全群」邊界一致；OKX/account-tier 自動排除，零額外分支。
- **即時聚合、不快取（v1）**：cohort 受 `position`-tier 數量限制、走預存最新快照；超 ≤1s 預算再加層（PRD §6/§8）。
- **新鮮度與 `now()` 注入 domain**：service 吃 `freshnessWindowMs` + `now()`，repository 只做「最新且 `≥ freshAfter`」查詢；窗的實際值在組裝根由 `POLL_INTERVAL_MS` 推得，domain 保持純粹、可測。
- **免責信封是 DTO 非 Response**：以 `SafeCohortConsensusDto { disclaimer, coins }` 承載免責，遵守「不另立 Response」慣例。

## 6. 情境對應

| PRD 情境 | 行/US | 資料模型 | 服務方法 |
|---|---|---|---|
| US-01 各 coin 共識列表 + 免責 + cohort 過濾 | US-01 | `SafeCohortConsensusDto`, `CoinConsensusDto`, `CurrentOpenPosition` | `SafeCohortConsensusService.listConsensus` |
| US-02 單一 coin 細節 + 404 | US-02 | 同上 | `coinConsensus` |
| US-03 落庫保留方向 | US-03 | `PositionSnapshot.signedSize`, `PositionSnapshotRecord` | `PollTraderService.toSnapshotRecord`（移除 `.abs()`） |
| US-04 當前且新鮮、排除已平倉 | US-04 | `CurrentOpenPosition` | `IPositionRepository.findCurrentOpenPositions` |
| US-05 參數調整（含 400） | US-05 | `SafeCohortConsensusQuery`, `SafeCohortConsensusRequest` | controller 解析 + service 門檻 |
| §4 規則1 權重 | §4 | `Trader.consensusWeight()` | entity 方法 |

## 7. 檔案結構（增/改）

```
src/
├── domain/
│   ├── vo/currentOpenPosition.ts              # 新增
│   ├── vo/positionSnapshotRecord.ts           # 改：+ signedSize
│   ├── vo/safeCohortConsensusQuery.ts         # 新增
│   ├── dto/coinConsensusDto.ts                # 新增
│   ├── dto/safeCohortConsensusDto.ts          # 新增（信封）
│   ├── entity/trader.ts                        # 改：+ consensusWeight()
│   ├── interface/iPositionRepository.ts        # 改：+ findCurrentOpenPositions
│   └── service/safeCohortConsensusService.ts   # 新增
├── application/safeCohortConsensusApplication.ts   # 新增
├── controller/safeCohortConsensusController.ts     # 新增（+ SafeCohortConsensusRequest）
├── infrastructure/persistence/positionRepository.ts # 改：findCurrentOpenPositions + saveSnapshots 寫 signedSize
├── domain/service/pollTraderService.ts         # 改：toSnapshotRecord 保留 signedSize
├── server.ts / main.ts                         # 改：buildServer 注入 positionRepository、組裝新 controller、注入 freshnessWindowMs
└── prisma/schema.prisma + migration            # 改：position_snapshots.signed_size
tests/ 鏡像：
  entity/trader.consensusWeight.test、service/pollTraderService（signedSize 保留）、
  application/safeCohortConsensus（注入真實 service + 真實 Trader，mock ITraderRepository/IPositionRepository）、
  controller/safeCohortConsensus（Fastify inject：200/404/400、disclaimer）
```

## 8. TDD 實作與 commit 計畫（每 cycle 一 commit）

1. **`Trader.consensusWeight()`** — entity 純單元測試（riskScore 0/40/100/null → 1/0.6/0/0）。
2. **快照保留方向** — `PositionSnapshotRecord` + `PollTraderService.toSnapshotRecord` 不再 `.abs()`（service 測試：mock repository 斷言收到負值 signedSize）；schema 加欄 + migration + `saveSnapshots` 寫入。
3. **`findCurrentOpenPositions` + `CurrentOpenPosition`** — 介面與 repository 實作（由後續 application 測試經 mock 介面覆蓋；repository 不單測）。
4. **`SafeCohortConsensusService.listConsensus` 聚合** — application 測試（真實 service + Trader，mock 兩介面）：
   4a. 單 coin 基本聚合（counts、netDirectionBias、longShare、averageLeverage）。
   4b. inverse-riskScore 加權正確。
   4c. 新鮮度窗（注入 `now`）+ 排除 `signedSize=0`。
   4d. `maxRiskScore` cohort 過濾 + `minimumConsensusParticipants` 過濾。
   4e. 依 `consensusStrength` 排序 + 分頁。
5. **`coinConsensus` + 404** — application 測試（足量/不足量 → DTO/null）。
6. **Controller + 接線** — Fastify inject：`GET /consensus`(200+disclaimer)、`/consensus/:coin`(200/404)、非法參數(400)；`buildServer` 注入 `positionRepository` 與 `freshnessWindowMs`、`main.ts` DI。

## 9. 待確認（延續 PRD §8）

1. `maxRiskScore=40` / 窗 `2×POLL_INTERVAL_MS` / `minParticipants=3` 的回測校準。
2. 分層輪詢若各 tier 間隔不同，新鮮度窗是否改以實際 tier 間隔計。
3. `findCurrentOpenPositions` 若 cohort 過大，是否改 DB 端 DISTINCT ON（需評估 ORM 限制 vs「禁手寫 SQL」）。
