# Product Requirements Document (PRD) — Entry Signal & Backtest

**Feature:** 進場訊號 + 回測（feature B）
**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering（solo）
**Brief:** `.sdd/2026-06-20-entry-signal-backtest/BRIEF.md`

> 命名慣例：所有程式識別字一律全名、禁止縮寫（見 `.sdd/UL-MAP.md`）。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:** 純描述的 `/consensus`（+ feature A 的 conviction 加權）回答不了使用者真正想問的「該不該進場」。需要一個**決策層**把共識化為可解釋、分級的進場傾向，並用**回測**驗證這些規則是否真有預測力——否則任何「跟著共識做」都只是假設。
- **Expected Outcome:**
  - **B1**：`EntrySignalService` 把每個 coin 的共識轉成 `{ lean, setupQuality, verdict, reasons }` 的**可解釋**訊號，經獨立 opt-in 端點 `GET /signals` 提供，帶 `experimental` 標記與重免責。
  - **B2**：把每輪共識存成時序、對照之後價格，離線評估規則的前向報酬/命中率，產出校準門檻回填 B1。
  - **成功標準**：B1 能對每個 coin 給出帶理由的 lean/verdict 且明示未校準；B2 能對歷史共識算出可量化的預測力指標（前向報酬均值、方向命中率），讓門檻有資料依據。**維持不下單/不給倉位大小/不獎勵報酬。**
- **Out of Scope:** 自動下單/代操/私鑰/資金託管；倉位大小建議；即時串流；以 P&L 高低排序評分；改動 `riskScore` 公式與既有 `/consensus`·`/rankings`·`/traders`。

---

## 2. User Personas

- **Primary Role:** 散戶（查 `/signals` 取得**決策輔助**，非下單指令；明知 experimental）；系統（背景排程留存共識時序、觸發離線回測）。
- **Usage Context:** REST 查詢（B1）；背景排程 + 離線評估 job（B2，不在 HTTP 路徑）。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **B1-US-01** | **As a** 散戶, **I want** 每個 coin 一個可解釋的進場傾向訊號, **so that** 我有決策輔助而非自己硬讀共識數字。 | 1. `EntrySignalService.evaluate(consensus)` 對每 coin 回 `EntrySignalDto { coin, lean, setupQuality, verdict, reasons[], disclaimer }`<br>2. `lean` 由 `convictionWeightedDirectionBias` 號決定（>+ε→long、<−ε→short、否則 neutral）<br>3. `reasons[]` 逐條說明判斷依據（必填、非空）<br>4. `setupQuality` ∈ [0,1] 字串，為規則綜合分（**非獲利機率**） | P0 |
| **B1-US-02** | **As a** 散戶, **I want** 擁擠/巨鯨/薄樣本被降級或標 no-signal, **so that** 不被假訊號誤導。 | 1. `consensusStrength < strengthThreshold` 或方向 neutral → `verdict=no-signal`<br>2. `participantCount < minParticipants` 或 `maxConvictionShare > dominationThreshold`（單人主導）→ `no-signal`<br>3. `averageLeverage > leverageCeiling` 或 `consensusStrength` 極端（≥ crowdedThreshold，擁擠）→ 降級為 `avoid`（**只降級不反向**）<br>4. 其餘 → `worth-considering`<br>5. 門檻全部可注入；預設保守 | P0 |
| **B1-US-03** | **As a** 使用者, **I want** 透過獨立端點取得訊號且看到 experimental 警示, **so that** 我清楚這還沒被回測驗證。 | 1. `GET /signals`（opt-in，不取代 `/consensus`）回 `{ disclaimer, experimental: true, signals: EntrySignalDto[] }`<br>2. 沿用 `/consensus` 的 querystring（provider/maxRiskScore/minParticipants/weighting…）<br>3. 免責比 `/consensus` 更重、明標 `experimental`、未校準 | P0 |
| **B2-US-04** | **As a** 系統, **I want** 定期留存每輪共識成時序, **so that** 回測有歷史輸入。 | 1. 排程（對齊 recompute≈5min）將 `listConsensus` 結果寫入 `consensus_snapshots`（coin、netDirectionBias、convictionWeightedDirectionBias、consensusStrength、maxConvictionShare、participantCount、capturedAt）<br>2. 經 `IConsensusSnapshotRepository` 寫入（介面在 domain、實作在 infra）<br>3. idempotent/可重入不重複污染 | P1 |
| **B2-US-05** | **As a** 系統, **I want** 離線評估規則的預測力, **so that** 門檻有資料校準依據。 | 1. `BacktestEvaluatorService.evaluate(consensusSeries, priceSeries, horizons)` 為**純 domain**、可注入價格、可單元測試<br>2. 對每個共識點、每個 horizon（預設 [1h,4h,1d]）算 `forwardReturn`（之後價格相對報酬）與**方向命中**（lean 與 forwardReturn 同號）<br>3. 彙總 `signalHitRate`（命中率）與平均 `forwardReturn`<br>4. **不在任何 HTTP request 路徑內** | P1 |
| **B2-US-06** | **As a** 系統, **I want** 由 Hyperliquid 取得對照價格序列, **so that** 回測能對照之後價格。 | 1. proxy 取得 coin 的價格序列（candle/oracle px），vendor 形狀只在 infra 邊際解析為 domain 價格序列<br>2. 離線 job 觸發、退避重試沿用既有限流精神 | P2 |

---

## 4. Business Flow & Logic

### B1 — 訊號層（request-time）

```
GET /signals → SafeCohortConsensusApplication.evaluateEntrySignals(query)
   consensus = safeCohortConsensusService.listConsensus(query)     # 既有（含 A 的 conviction 欄位）
   signals   = entrySignalService.evaluate(consensus, thresholds)  # 新增
   return { disclaimer, experimental: true, signals }
```

**規則（門檻可注入，v1 保守預設）：**
- `lean`：`bias = convictionWeightedDirectionBias`；`bias > directionEpsilon → long`、`bias < −directionEpsilon → short`、否則 `neutral`。
- `verdict`：
  1. `neutral` 或 `consensusStrength < strengthThreshold` → `no-signal`；
  2. `participantCount < minimumSignalParticipants` 或 `maxConvictionShare > dominationThreshold` → `no-signal`（巨鯨/單人主導不算共識）；
  3. `averageLeverage > leverageCeiling` 或 `consensusStrength ≥ crowdedThreshold` → `avoid`（擁擠反指標，**只降級不反向**）；
  4. 否則 → `worth-considering`。
- `setupQuality`（0..1，規則綜合分，非機率）：以 `consensusStrength` 為基底，乘上「非擁擠」「非單人主導」「槓桿適中」等折扣因子（皆可注入），夾到 [0,1]。
- `reasons[]`：每條規則命中時 push 一句人類可讀理由（如「strength 0.72 ≥ 0.5」「averageLeverage 20 > ceiling 15 → avoid」）。

### B2 — 回測（離線）

```
排程（≈5min，對齊 recompute）：
   consensus = listConsensus(校準用 query)
   consensusSnapshotRepository.save(consensus.coins → consensus_snapshots[capturedAt])

離線 job（觸發式，非 HTTP）：
   series = consensusSnapshotRepository.loadSeries(coin, window)
   prices = priceProxy.fetchPriceSeries(coin, window+maxHorizon)
   report = backtestEvaluatorService.evaluate(series, prices, [1h,4h,1d])
   # report：每 horizon 的 signalHitRate + 平均 forwardReturn；供人工校準門檻
```

**評估口徑：** 對每個共識點 `t`，每個 horizon `h`：`forwardReturn = (price[t+h] − price[t]) / price[t]`；命中 = `sign(forwardReturn) == lean 方向`（neutral 不計）。`signalHitRate = 命中數 / 有方向且有對照價格的樣本數`。

### Edge Cases

- **共識為空 / 無合格 coin**：`/signals` 回空 `signals`（200 + experimental + 免責）。
- **某 coin 無對照價格**（價格序列缺漏）：該樣本不計入命中率（標為無法評估），不當成命中或未命中。
- **horizon 超出資料末端**：該點該 horizon 略過。
- **lean=neutral**：不納入命中率分母。
- **價格序列時間不對齊**：取最接近且不早於 `t+h` 的價格；找不到則略過。

---

## 5. UI/UX Design & Interaction

- **N/A** — REST JSON。新增 `GET /signals` 回 `{ disclaimer, experimental, signals: EntrySignalDto[] }`。回測無 HTTP 介面（離線 job 輸出報表/日誌）。

---

## 6. Non-Functional Requirements

- **可測試性（強制）**：
  - `EntrySignalService`（domain service，不單測不 mock）以 application 測試覆蓋：注入真實 `SafeCohortConsensusService` + 真實 entity、mock repository 介面，餵合成持倉 → 驗 lean/verdict/setupQuality/reasons 與各規則邊界（擁擠、巨鯨主導、薄樣本、高槓桿）。
  - `BacktestEvaluatorService` 為**純 domain**：以合成共識序列 + 合成價格序列單元測試（注入價格，不打網路），驗 forwardReturn/命中率/邊界（無價格、neutral、horizon 越界）。
  - `ConsensusSnapshotRepository` 經 mock 介面在 application/排程測試覆蓋。
  - 價格 proxy 以 fixture 解析測試（vendor 形狀 → domain）。
- **效能**：`/signals` 在 `/consensus` 之上多一層純運算，續對齊 ≤1s。回測為離線批次。
- **型別/分層**：Decimal；禁 any/unknown；DTO/Query/Request 用 `type`，跨 entity 運算放 Domain Service；vendor 形狀只在 infra；新表走 Prisma code-first migration。

---

## 7. Dependencies & Risks

- **External:** Hyperliquid 價格序列端點（candle/oracle）——回測對照價格命脈。
- **Known Risks:**
  - **定位轉向（描述→半建議）**：以獨立 opt-in 端點 + `experimental` 旗標 + 重免責控管，不污染既有描述性輸出；維持「非下單、非倉位建議」。
  - **未校準訊號被誤用**：`experimental` 標記 + 保守預設門檻；校準前明示不可信。
  - **能解釋≠能賺錢 / 負和遊戲**（主 PRD §7）：回測即用來面對此風險；即使回測顯示有弱預測力，仍不應重壓。
  - **薄樣本 / 巨鯨主導**：B1 規則以 `participantCount`、`maxConvictionShare` 過濾；但根本上受可用 position-tier 安全群數量限制。
  - **回測過擬合**：門檻校準需留意樣本內外，避免 curve-fitting；v1 僅產指標供人工判讀，不自動套用。

---

## 8. Appendix — Open Decisions（v1 決議）

1. **`/signals` 是否 gate 到回測完成** → **先上線**，強制 `experimental: true` 旗標 + 保守預設門檻 + 重免責（可邊用邊收資料）。
2. **lean 依據** → feature A 的 `convictionWeightedDirectionBias`（號 + `directionEpsilon`）。
3. **擁擠處理** → 極端一致（strength ≥ crowdedThreshold）或高槓桿只**降級為 avoid，不反向 lean**。
4. **前向評估視窗** → 預設 `[1h, 4h, 1d]`。
5. **預測力指標** → 每 horizon 的**方向命中率** `signalHitRate` + **平均 forwardReturn**。
6. **共識留存頻率** → 對齊 recompute（≈5min）。
7. **價格對照** → Hyperliquid candle/oracle px（具體端點/解析度動工時校準）。
8. **setupQuality 語意** → 規則綜合分（0..1），**非獲利機率**；折扣因子可注入。
9. **v1 預設門檻（皆可注入、待回測校準）** → `strengthThreshold=0.5`、`directionEpsilon=0.05`、`minimumSignalParticipants=5`、`dominationThreshold=0.5`、`leverageCeiling=15`、`crowdedThreshold=0.95`。
10. 相關文件：`.sdd/2026-06-20-consensus-weighting-refinement/`（A，被 B 使用）、`.sdd/2026-06-20-safe-cohort-consensus/`、主 PRD §4/§7；UL-MAP 已加相關詞條。
