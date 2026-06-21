# Product Requirements Document (PRD) — 回測觸發端點 Backtest Trigger Endpoint

**Status:** Draft
**Version:** v1.0
**Owner:** James
**Stakeholders:** Engineering, QA
**Brief:** `.sdd/2026-06-21-backtest-trigger-endpoint/BRIEF.md`

> ### ⚠️ 文件漂移註記（Doc Drift Notice）
> 本功能**推翻**既有 B2 PRD（`.sdd/2026-06-20-entry-signal-backtest/PRD.md`）的下列決定：
> - **B2-US-05 / B2-US-06**：回測「**不在任何 HTTP request 路徑內**」「離線 job 觸發」。
> - **§UI/UX**：「回測無 HTTP 介面（離線 job 輸出報表/日誌）」。
>
> 改為：**內部 / 受保護的同步 HTTP 端點，呼叫時當場運算回傳**。
> **本次刻意「不修改」B2 PRD**，僅於此標註；待後續專門對齊那份文件，消除漂移。所有衝突處以本 PRD 為準。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:** B2 回測引擎（`BacktestEvaluatorService` + `BacktestApplication`）已完成且有單元測試，共識時序也已由現有 worker（`SnapshotConsensusService`）持續累積，但**沒有任何對外觸發出口**——無 endpoint、無 CLI、無進入點實例化 `BacktestApplication`。因此「`/signals` 訊號到底有沒有預測力」這個問題目前**無法被實際回答**，門檻校準無從談起。
- **Expected Outcome:** 能透過一個內部端點實際跑出每個 coin × horizon 的回測報告（`signalHitRate` / `averageForwardReturn`），且每格附**誠實的資料充足度分級**，讓人能據此判斷「這格的數字能不能信」。成功標準：呼叫端點即可取得報告；資料不足的格子明確標 `insufficient`，不給假信心。
- **Out of Scope:**
  - 自動下單 / 代操 / 私鑰 / 資金託管（全專案永久立場）。
  - **新增 scheduler 或定時背景 job**（資料累積已由現有 `SnapshotConsensusService` 處理）。
  - 把回測結果**自動回填** `entrySignalThresholds`（校準維持人工）。
  - 改動 `riskScore` 公式、`/consensus`、`/signals`、`/rankings`、`/traders` 既有行為。
  - **公開**（面向一般消費者）的回測端點。
  - 觸發式背景工作 +「之後取結果」模式（除非同步版實測太慢，本次只做同步）。

---

## 2. User Personas

- **Primary Role(s):** 系統維運者 / 開發者（內部）——用回測報告校準訊號門檻、判斷訊號可信範圍。**非**一般散戶（此端點不公開）。
- **Usage Context:** 內部呼叫（內部路徑或需 token 的受保護端點），偶爾觸發（校準時），同步等待回應。運算重點在抓對照價格（網路），讀共識歷史為本地 DB。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 內部維運者, **I want** 用一個內部端點觸發回測並同步取得報告, **so that** 我不必另寫腳本就能驗證訊號預測力。 | 1. 新增受保護端點 `GET /backtest`（內部路徑或需 token；非公開產品端點）<br>2. 同步執行：`BacktestController` → `BacktestApplication.evaluate(coin, since, horizonsMilliseconds)` → 讀共識歷史 + 抓價格 + 評估 + 回傳<br>3. 回應為 `BacktestReportDto`，帶 `experimental: true` + 重免責、明標**非下單指令**<br>4. **不**新增 scheduler / 背景 job<br>5. 參數非法（缺 coin、horizon 非正數等）回 400 | P0 |
| **US-02** | **As a** 內部維運者, **I want** 用 env 設定預設的評估視窗（小時、一串）且請求可覆蓋, **so that** 平常不必每次帶參數、需要時又能臨時試別的視窗。 | 1. 新增 env `BACKTEST_HORIZONS_HOURS`，格式為小時清單（如 `4,24,72`）<br>2. 請求未帶 horizons → 採 env 預設；env 缺 → 用 code 預設（如 `[1,4,24]` 小時）<br>3. 請求帶 horizons → 覆蓋 env<br>4. 邊界將「小時」換算為毫秒後傳入既有 `evaluate(..., number[])`，既有介面與單元不變<br>5. 命名以 `_HOURS` 結尾，與既有 `*_MS` 慣例區隔 | P0 |
| **US-03** | **As a** 內部維運者, **I want** 報告每個 coin × horizon 各自標「資料充足度」分級, **so that** 我知道哪格數字能信、哪格只是噪音。 | 1. `HorizonResultDto` 增 `dataAdequacy`：`{ level: 'insufficient'｜'smoke-test'｜'preliminary'｜'adequate', reasons: string[] }`<br>2. 分級依**三軸**：`independentSampleEstimate`、日曆跨度、典型 `participantCount`（非原始 `sampleCount`）<br>3. `reasons[]` 必填、逐條說明（如「獨立樣本 41、跨度 9 天、典型參與 5 人」）<br>4. 報告**額外輸出** `independentSampleEstimate`（與 `sampleCount` 並列，後者保留但標明為重疊計數）<br>5. **不跨 coin 池化**樣本 | P0 |
| **US-04** | **As a** 系統, **I want** 抓對照價格時具備限流退避韌性, **so that** 大量回看價格不會因 429 直接失敗。 | 1. `PriceProxy.fetchPriceSeries` 補 `response.ok` 檢查，非 ok 拋明確錯誤<br>2. 收到 429 依 `Retry-After` / exponential backoff + jitter 重試至上限（對齊 `hyperliquidProxy` 精神）<br>3. 不破壞既有單元測試（可注入 fetch/sleep） | P1 |

---

## 4. Business Flow & Logic

### Flow（同步、單一請求內完成）

```
GET /backtest?coin=BTC&since=...&horizonsHours=4,24,72  (內部/受保護)
  → BacktestController 解析、驗證、補 env 預設 horizons（小時→毫秒）
  → BacktestApplication.evaluate(coin, since, horizonsMs)
       → IConsensusSnapshotRepository.loadConsensusSeries(coin, since)   [本地 DB，快]
       → IPriceProxy.fetchPriceSeries(coin, since)                        [Hyperliquid candle，慢 + 需退避]
       → BacktestEvaluatorService.evaluate(coin, series, prices, horizonsMs)
            → 每 horizon：算 forwardReturn / signalHitRate / sampleCount
            → 每 horizon：算 independentSampleEstimate + dataAdequacy
  → 回 BacktestReportDto（experimental + disclaimer）
```

### Core Business Rules

1. **資料充足度分級（`dataAdequacy.level`，每 coin × horizon 獨立判定）**

   ```
   insufficient → independentSampleEstimate < 30          // 不可下任何結論
   smoke-test   → 30 ≤ independentSampleEstimate < 200    // 僅能看方向
   preliminary  → independentSampleEstimate ≥ 200 但 日曆跨度 < 跨度門檻  // 疑單一行情、過擬合風險
   adequate     → independentSampleEstimate ≥ 200 且 日曆跨度 ≥ 跨度門檻
   ```
   - **降級條件（覆蓋上表，取較保守者）**：典型 `participantCount < 參與深度下限` → 至多 `smoke-test`（3 人的「共識」不算共識）。
   - 三軸合成採**木桶短板**（最弱的一軸決定上限），不加權平均。
   - `reasons[]` 必填，逐條列出三軸實際值與判定依據。
   - 門檻（30 / 200 / 跨度門檻 / 參與深度下限）**可注入**、有保守預設。

2. **獨立樣本估計（`independentSampleEstimate`）**
   - 以「實際有共識點、且該點與其 +horizon 後兩端皆有對照價」的**非重疊窗**計數：對某 coin 某 horizon，從最早共識點起，每納入一個有效點後跳過 horizon 時長內的後續點，避免重疊。
   - **不可**用 `floor(跨度 / horizon)` 硬除（共識時序有洞，會高估）。
   - `sampleCount`（既有）保留但定義為「兩端有價的重疊樣本數」，報告中標明其為高估上界。

3. **Horizon 設定優先序**：請求參數 > `BACKTEST_HORIZONS_HOURS` env > code 預設。單位一律小時，邊界換算毫秒。

4. **不池化**：每個 coin 的報告獨立計算；不合併多 coin 樣本（加密貨幣齊漲齊跌，池化造假獨立性）。

### Edge Cases

- **共識歷史為空 / 太短**：各 horizon 照算，`dataAdequacy.level = insufficient`，`reasons` 說明「無共識點 / 樣本 0」；不報錯。
- **價格序列抓取失敗（429 重試後仍失敗）**：US-04 重試耗盡 → 端點回 5xx 並帶明確錯誤訊息（非靜默回空報告）。
- **某 horizon 長到沒有任何非重疊完整窗**：該 horizon `sampleCount=0`、`independentSampleEstimate=0`、`level=insufficient`。
- **neutral 共識點**：不計入評估（沿用既有 `evaluate` 行為）。
- **參數非法**：缺 `coin`、`since` 非數、horizon ≤ 0 → 400。

---

## 5. UI/UX Design & Interaction

- **N/A（REST JSON，內部端點）。** 無前端。
- 回應形狀（`BacktestReportDto`，擴充後）：
  ```
  {
    coin, evaluatedSignalCount, disclaimer, experimental: true,
    horizons: [{
      horizonMilliseconds, sampleCount, independentSampleEstimate,
      signalHitRate, averageForwardReturn,
      dataAdequacy: { level, reasons: [...] }
    }]
  }
  ```
- 免責內容明標 `experimental / uncalibrated`、**非下單指令、非獲利保證**，與 `/signals` 一致語氣。

---

## 6. Non-Functional Requirements

- **效能**：同步端點；瓶頸為抓 candle 價格序列。先做同步版，**若實測逾時再評估**背景工作模式（非排程，且本次不做）。單次以單一 coin 為主。
- **安全 / 開放範圍**：**內部 / 受保護**——加在內部路徑或需 token；不暴露為公開產品端點。具體機制見 Open Decisions。
- **韌性**：`PriceProxy` 對齊 `hyperliquidProxy` 的 429 退避（US-04）。
- **相容性**：N/A（後端 REST）。

---

## 7. Dependencies & Risks

- **External:** Hyperliquid `candleSnapshot`（對照價格命脈）——回看大量資料時的限流為主要風險，US-04 緩解。
- **Internal:** 既有 `BacktestEvaluatorService` / `BacktestApplication` / `IConsensusSnapshotRepository` + 實作 / `IPriceProxy` + `PriceProxy` / `SnapshotConsensusService`（已接 scheduler）。本功能只補「對外觸發出口 + adequacy 計算 + PriceProxy 硬化」。
- **Known Risks:**
  - **資料深度不足**：多數 coin × horizon 會誠實顯示 `insufficient`（屬預期）；長 horizon 單 coin 需數月累積。`dataAdequacy` 正是為了不讓使用者誤信。
  - **定位風險**：暴露回測端點不得被誤用為下單依據——以 `experimental` + 重免責 + 內部受保護三重控管。
  - **文件漂移**：見頂部註記；B2 PRD 待後續對齊。

---

## 8. Appendix

- **取代決定**：`.sdd/2026-06-20-entry-signal-backtest/PRD.md`（B2-US-05/US-06、§UI）——見頂部漂移註記。
- **相關**：`.sdd/2026-06-20-safe-cohort-consensus/PRD.md`、主 PRD §4/§7、`.sdd/UL-MAP.md`（已新增 `dataAdequacy`/`independentSampleEstimate`/`runBacktest`）、`docs/domain/riskScore.md`。
- **資料充足度的統計依據**：5 分鐘快照高度自相關，原始筆數一天破千但幾乎全重疊；真正算數的是獨立持有期 ≈ 觀測時長 / horizon。~30 才看方向、~200 才信小邊際；長 horizon 單 coin 需數月。
