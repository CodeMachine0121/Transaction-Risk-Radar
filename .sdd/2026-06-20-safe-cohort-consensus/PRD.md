# Product Requirements Document (PRD) — Safe Cohort Consensus

**Feature:** 安全群持倉共識雷達（`safeCohortConsensus`）
**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering（solo）
**Brief:** `.sdd/2026-06-20-safe-cohort-consensus/BRIEF.md`

> 命名慣例：所有程式識別字一律全名、禁止縮寫（見 `.sdd/UL-MAP.md`）。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:**
  使用者最初的需求是「依分析結果回應該**做多/做空哪個交易對**」。但 `riskScore` 衡量的是「**跟單有多危險**」，**不含方向與漲跌資訊**，無法直接推出買賣訊號。唯一誠實的方向資料路徑是：「在 `riskScore` 判定為**相對安全可跟**的交易員群體中，他們**當前實際持倉**集中在哪些 coin、哪個方向。」目前系統雖逐輪從 `clearinghouseState` 取得每位交易員此刻的持倉方向，卻在 `pollTrader` 落庫時 `signedSize.abs()` 把方向丟棄，無從聚合。
- **Expected Outcome:**
  產出一支**描述性**共識 API：以 inverse-riskScore 加權聚合安全群當前未平倉方向，每個 coin 輸出淨多空偏向、共識強度、參與人數、平均槓桿並附免責。讓「安全可跟群體此刻在做什麼」變得可查，作為 Risk Ranking 的延伸視角。**成功標準：作者能查得「安全群目前在某 coin 偏多/偏空到什麼程度、由幾人組成」，且輸出維持描述性、不構成投資建議。**
- **Out of Scope:**
  - 買賣/進場建議、倉位大小建議、價格漲跌預測、保證獲利話術。
  - 將 OKX 或任何 `riskScoreTier = account` 的交易員納入共識（帳戶級看不到逐筆部位，結構性排除；本就不進 `/rankings`）。
  - 對 `riskScore` 公式、`/rankings`、`/traders`、`/traders/:address`、account-level fallback 行為的任何變更。
  - 即時串流推送（維持定時輪詢、REST pull）。

---

## 2. User Personas

- **Primary Role:** 散戶（查 `/consensus` 觀察安全群此刻的方向共識，作為決策前的風險背景，而非進場指令）；系統（`pollTrader` 落庫方向、查詢時即時聚合）。
- **Usage Context:** REST 查詢；非即時搶單，而是「決策前先看安全群站哪邊」的場景。聚合於查詢時即時計算，讀自背景輪詢預存的最新快照。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 散戶, **I want** 取得各 coin 的安全群持倉共識, **so that** 我能看到相對安全可跟的群體此刻偏多還偏空、共識多強。 | 1. `GET /consensus` 回傳各 coin 的共識，依 `consensusStrength` 由高到低排序<br>2. 每筆含 `coin`、`netDirectionBias`(−1…+1)、`consensusStrength`(0…1)、`participantCount`、`longCount`、`shortCount`、`longShareOfParticipants`、`averageLeverage`<br>3. 支援分頁<br>4. 回應隨附免責聲明（描述性分析、非投資建議）<br>5. 僅納入 `riskScoreTier=position`、非 `insufficientData`、`riskScore ≤ maxRiskScore` 的交易員 | P0 |
| **US-02** | **As a** 散戶, **I want** 查看單一 coin 的安全群共識細節, **so that** 我能聚焦特定交易對。 | 1. `GET /consensus/:coin` 回傳該 coin 的共識欄位（同 US-01 欄位集）<br>2. 該 coin 安全群參與人數 < `minimumConsensusParticipants` 時回 404（視為無足量共識）<br>3. 隨附免責聲明 | P0 |
| **US-03** | **As a** 系統, **I want** 在輪詢落庫時保留當前持倉方向, **so that** 共識聚合有方向資料可用。 | 1. `PositionSnapshot` 新增帶號 `signedSize`<br>2. `pollTraderService.toSnapshotRecord` 不再對 `signedSize` 取絕對值，原樣寫入帶號值<br>3. 既有 MAE/槓桿計算不受影響（仍以 `|signedSize|` 推 notional） | P0 |
| **US-04** | **As a** 系統, **I want** 只採當前且新鮮的快照計算共識, **so that** 不把已平倉的舊持倉誤當現況。 | 1. 每位交易員、每個 coin 僅取**最新一筆**快照<br>2. 該快照 `capturedAt` 須落在 `consensusFreshnessWindow` 內，逾窗排除<br>3. `signedSize = 0` 的快照（已平倉）不計入 | P0 |
| **US-05** | **As a** 使用者, **I want** 共識可用參數調整群體與門檻, **so that** 我能控制嚴格度。 | 1. `?maxRiskScore=` 覆寫安全群上限（預設 40）<br>2. `?minParticipants=` 覆寫最小共識人數（預設 3）<br>3. `?provider=` 篩選資料來源（預設全部 `position` 來源）<br>4. 參數非法（負數/超界）回 400 | P1 |

---

## 4. Business Flow & Logic

### Flow Diagram

```
pollTrader（背景，per (provider,address)）
  fetchOpenPositions → OpenPosition{ coin, signedSize(帶號), leverage, ... }
  saveSnapshots(provider, address, [{ coin, signedSize, markPrice, uPnL%, margin, leverage }])
        // 變更：signedSize 保留符號，不再 .abs()

讀取（查詢時即時聚合）
  GET /consensus / GET /consensus/:coin
    cohort = traderMetrics where tier=position AND insufficientData=false AND riskScore ≤ maxRiskScore
    for each trader in cohort:
        latestSnapshots = 每個 coin 取最新一筆 snapshot，且 capturedAt 在 consensusFreshnessWindow 內，signedSize ≠ 0
    computeSafeCohortConsensus(coin-grouped snapshots + 各 trader riskScore)
        → 每 coin { netDirectionBias, consensusStrength, participantCount, longCount, shortCount, longShareOfParticipants, averageLeverage }
    filter coins where participantCount ≥ minimumConsensusParticipants
    sort by consensusStrength desc, paginate
```

### Core Business Rules — 共識計算口徑

設安全群中於某 coin 有當前持倉的交易員集合為 `P`，每位 `t ∈ P` 有 `riskScore_t`、方向 `side_t`（由其最新快照 `signedSize` 符號決定：`> 0 → long(+1)`、`< 0 → short(−1)`）、槓桿 `leverage_t`。

1. **權重（inverse-riskScore，每人一票）**

   ```
   weight_t = clamp(1 − riskScore_t / 100, 0, 1)
   ```

   越安全（riskScore 越低）票越重；**不乘倉位名目大小（notional）**，以維持中性描述、避免暗示「跟大倉走」。

2. **淨方向偏向**

   ```
   netDirectionBias = Σ(side_t × weight_t) / Σ(weight_t)        // 落在 −1…+1
   ```

   `+1` = 安全群一致做多、`−1` = 一致做空、`0` = 多空相抵。

3. **共識強度**

   ```
   consensusStrength = | netDirectionBias |                      // 0…1
   ```

4. **輔助與描述欄**

   ```
   participantCount        = |P|
   longCount               = count(side_t = long)
   shortCount              = count(side_t = short)
   longShareOfParticipants = longCount / participantCount        // 直覺的同向佔比
   averageLeverage         = mean(leverage_t)                    // 安全群於該 coin 的平均槓桿
   ```

5. **群體與門檻**

   - 共識群體：`riskScoreTier = position` 且 `insufficientData = false` 且 `riskScore ≤ maxRiskScore`（v1 預設 `40`，可設定，待回測校準）。
   - 每 coin 須 `participantCount ≥ minimumConsensusParticipants`（v1 預設 `3`，可設定）才輸出。
   - `GET /consensus` 依 `consensusStrength` 由高到低排序、支援分頁。

6. **當前持倉判定（新鮮度）**

   - 每位交易員、每個 coin 僅取**最新一筆**快照。
   - 須 `now − capturedAt ≤ consensusFreshnessWindow`（v1 預設 `2 × POLL_INTERVAL_MS`）；逾窗視為非當前持倉、排除。
   - `signedSize = 0`（已平倉）的快照不計入。

### 資料路徑決議（v1）

- **採「為 `PositionSnapshot` 補帶號 `signedSize` 欄」**，而非以 fills 重建的未平倉 `Position`。理由：快照來自 `clearinghouseState`，看得到交易員此刻**全部**持倉（含抓取窗外開的 carried position）；fills 重建會排除 carried、漏掉現有持倉，與「當前未平倉」目標不符。
- **Schema 形狀**：`PositionSnapshot` 新增 `signedSize Decimal @db.Decimal(38, 18)`（帶號）；`side` 由符號推導，不另存 enum 欄。與 `PositionActivity.signedSize` 命名一致。
- **聚合層級**：跨多位交易員的運算 → Domain Service（`computeSafeCohortConsensus`），非 entity 方法、非 helper。
- **效能**：v1 **查詢時即時聚合**（`position`-tier 群體量小、走預存最新快照），不另設快取；若超出 ≤1s 預算再加預算層（見 §6）。

### Edge Cases

- **某 coin 安全群人數不足 `minimumConsensusParticipants`：** 不輸出該 coin；`GET /consensus/:coin` 回 404。
- **安全群為空（門檻過嚴或無 position-tier 交易員）：** `GET /consensus` 回空清單（200，含免責），非錯誤。
- **多空完全相抵（`netDirectionBias = 0`）：** 照常輸出，`consensusStrength = 0`；表達「安全群分歧」本身就是有用資訊。
- **快照全部逾新鮮度窗（輪詢長時間中斷）：** 該 coin 視為無當前持倉、不輸出。
- **`Σ(weight) = 0`（理論上群體門檻保證 riskScore ≤ 40 → weight ≥ 0.6，不會發生；防呆）：** 視為無共識、跳過該 coin。
- **查詢參數非法：** `maxRiskScore` 不在 0–100、`minParticipants < 1` → 400。

---

## 5. UI/UX Design & Interaction

- **N/A** — REST JSON。新增 `SafeCohortConsensusDto`（service 回傳；`type`、`Dto` 後綴）與 `SafeCohortConsensusRequest`（入站查詢；`type`、`Request` 後綴）。回應頂層含 `disclaimer` 字串。

---

## 6. Non-Functional Requirements

- **Performance:** 共識為跨交易員聚合（成本高於單表讀取）；目標對齊 `/rankings` 的 ≤1s。v1 即時聚合，若實測超標再引入預算/快取層（列為後續，不阻塞 v1）。
- **可測試性（強制）：**
  - **Entity / VO**：方向由 `signedSize` 符號推導、`weight = clamp(1 − riskScore/100)` 等純函式以合成資料單元測試。
  - **Domain Service（`computeSafeCohortConsensus`）**：不單獨測、不 mock；以具體實例注入 application。
  - **Application 測試**：注入真實 domain service + 真實 entity，只 mock 最外層 repository 介面（`vi.fn`）；連帶測到聚合邏輯。新鮮度窗與門檻過濾以注入 `now()` + 合成快照驗證。
- **分層 / 型別：** vendor 形狀只在 infra；禁 `any`/`unknown`；金額/比率/權重用 `decimal.js`（含 `signedSize`、`netDirectionBias`）。
- **命名：** 全名識別字、禁縮寫；DTO/Request 用 `type`，跨 entity 聚合用 `Service`。

---

## 7. Dependencies & Risks

- **External Dependencies:**
  - Hyperliquid `clearinghouseState`（已是現有輪詢來源；本功能僅多保留 `signedSize` 符號，不新增外部呼叫）。
  - PostgreSQL/TimescaleDB（`position_snapshots` 加欄，需 migration）。
- **Known Risks:**
  - **共識 ≠ 會賺：** 安全群一致做多不代表該 coin 會漲；本工具僅描述「安全群此刻站哪邊」，**不應據此重壓**。以免責聲明與描述性定位控管。
  - **定位漂移風險：** 易被誤用為買賣訊號。以「不給倉位大小、不給進場指令、不預測價格」與免責語守住風控工具定位（法規雷區）。
  - **門檻為主觀預設：** `maxRiskScore=40`、新鮮度窗 `2×POLL_INTERVAL_MS`、`minimumConsensusParticipants=3` 皆 v1 假設，須以實際資料校準。
  - **新鮮度與輪詢頻率耦合：** 新鮮度窗以 `POLL_INTERVAL_MS` 為基準；分層輪詢若使不同 tier 間隔不一，需確認窗以實際 tier 間隔計（列為校準項）。
  - **既有快照無方向：** migration 後既有 `position_snapshots` 列 `signedSize` 為空/補預設；共識僅採新鮮度窗內的新快照，舊列自然不影響（窗短於回填落差）。

---

## 8. Appendix — Open Decisions（v1 決議）

1. **方向資料路徑** → 採「`PositionSnapshot` 補帶號 `signedSize`」（見 §4 資料路徑決議）。涵蓋 carried position、與「當前未平倉」語意一致。
2. **Schema 形狀** → 新增 `signedSize Decimal`（帶號），`side` 由符號推導，不另存 enum。
3. **v1 預設值（可設定、待回測校準）** → `maxRiskScore = 40`、`consensusFreshnessWindow = 2 × POLL_INTERVAL_MS`、`minimumConsensusParticipants = 3`。
4. **共識輔助欄** → `consensusStrength = |netDirectionBias|`，另回 `longShareOfParticipants = longCount / participantCount`。
5. **效能/快取** → v1 即時聚合、不另設快取；超 ≤1s 預算再加層（後續）。
6. **相關文件：** `.sdd/2026-06-20-account-level-risk-fallback/`（`tier` 來源、account-tier 排除依據）、`.sdd/2026-06-20-multi-source-trader-ranking/`、主 PRD §4（riskScore 公式）；UL-MAP 已加 `safeCohortConsensus`/`netDirectionBias`/`consensusStrength`/`longShareOfParticipants`/`maxRiskScore`/`minimumConsensusParticipants`/`consensusFreshnessWindow`/`signedSize(snapshot)` 及 `getSafeCohortConsensus`/`getCoinConsensus`/`computeSafeCohortConsensus`。
