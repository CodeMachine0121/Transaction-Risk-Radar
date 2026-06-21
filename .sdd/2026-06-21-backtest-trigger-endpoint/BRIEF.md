# 回測觸發端點 Backtest Trigger Endpoint — Requirements Brief

## Goal

為已完成但無對外出口的 B2 回測引擎（`BacktestEvaluatorService` + `BacktestApplication`）新增一個**內部 / 受保護的 HTTP 端點**，被呼叫時**同步**完成整條流程：讀取已累積的共識歷史 → 抓取對照價格序列 → 評估各 horizon 的方向命中率 / 前向報酬 → 回傳報告。**不新增任何 scheduler**（共識時序累積已由現有 worker 的 `SnapshotConsensusService` 處理）。報告以 **coin × horizon** 為格，每格各自標註分級的「資料充足度」，誠實揭露大多數格子資料不足、僅少數高參與 coin + 短 horizon 可進入校準。本 brief **取代**既有 B2 PRD「回測無 HTTP 介面、純離線 job」的決定。

## Requirements

### 觸發方式
- 新增**內部 / 受保護**的端點（非公開產品端點；加在內部路徑或需 token），呼叫時**同步**執行：`BacktestApplication.evaluate(coin, since, horizonsMilliseconds)` → 讀共識歷史（`IConsensusSnapshotRepository.loadConsensusSeries`）+ 抓價格（`IPriceProxy.fetchPriceSeries`）+ 評估 + 回傳。
- 架構沿用既有分層：`BacktestController` → `BacktestApplication`（已存在）→ `BacktestEvaluatorService`（已存在）。
- **不新增 scheduler、不新增背景 job**。若日後實測同步運算太慢，再評估「觸發式背景工作 + 取結果」模式（非排程）——本次不做。
- 帶 `experimental: true` + 重免責，明標**非下單指令**，沿用既有訊號輸出的誠實標註慣例。

### Horizon 設定
- 新增環境變數 `BACKTEST_HORIZONS_HOURS`，以**小時**為單位、**一串**（如 `4,24,72`）。
- 作為**預設值**：呼叫端未指定時採用；呼叫端可於請求覆蓋。
- 在讀取邊界把「小時」換算為毫秒（現有 `evaluate` 吃 `number[]` 毫秒，介面不變）。
- 命名明確標 `_HOURS`，避免與專案既有 `*_MS` 慣例混淆。

### 資料充足度（dataAdequacy）—— 每 coin × horizon 一格
- 回測報告每個 (coin, horizon) 格子各自附 `dataAdequacy`，為**分級** + `reasons[]`（呼應 `riskScoreTier` 與 entry signal `reasons` 風格）：
  - `insufficient` → 獨立樣本 < ~30（不可下任何結論）
  - `smoke-test` → ~30–200（僅能看方向）
  - `preliminary` → 200+ 但日曆跨度不足（疑似單一行情、過擬合風險）
  - `adequate` → 200+ 且跨度足夠
- 分級依據為**三軸**，非原始筆數：
  1. **獨立樣本估計** — 用「實際有共識點、且兩端皆有對照價的非重疊窗」計數（共識時序有洞，不可用 `floor(跨度/horizon)` 硬除）。
  2. **日曆跨度** — 作為「是否跨越漲跌不同行情」的代理。
  3. **參與深度** — 該 coin 共識點的典型 `participantCount`（3 人的「共識」品質遠低於 30 人）。
- **不跨 coin 池化**樣本：加密貨幣齊漲齊跌，池化會膨脹表面樣本數卻無真實獨立性。
- 報告須揭露**獨立樣本估計**（非僅 `sampleCount`，後者為重疊樣本、會高估）。

### PriceProxy 硬化
- 為 `PriceProxy.fetchPriceSeries` 補上 `response.ok` 檢查與 429 退避重試，對齊 `hyperliquidProxy` 的限流 / backoff 精神（回測會大量回看價格，否則易被限流而失敗）。

## Out of Scope
- 自動下單 / 代操 / 私鑰 / 資金託管（全專案永久立場）。
- 新增 scheduler 或定時背景 job。
- 把回測結果自動回填 `entrySignalThresholds`（校準維持人工，符合既有 B2 設計）。
- 改動 `riskScore` 公式、`/consensus`、`/signals`、`/rankings`、`/traders` 既有行為。
- 公開（面向一般消費者）的回測端點。
- 觸發式背景工作 +「之後取結果」模式（除非同步版實測太慢，本次先做同步）。

## Open Decisions
供 PRD 作者解決：
- **「內部 / 受保護」的具體機制**：獨立內部路徑、API token、或僅限非公開部署？
- **三軸如何合成單一分級**：木桶短板（全部達標才升級）vs 加權；各軸門檻初值（如 `adequate` 的跨度門檻天數、參與深度下限）。
- **`since`（回看起點）來源**：請求參數、env 預設、或「全部歷史」？保留期限是否設限。
- **覆蓋 horizons 的請求介面形狀**：querystring 帶幾小時的清單格式。
- **同步運算的逾時上限與多 coin 行為**：單次只算一個 coin，或可一次多 coin（影響回應時間）。

## Context / Background
- 動機與脈絡見對話：riskScore 是「選人篩子」非下單訊號；`/signals` 為 experimental、未校準；要走向任何自動化，第一步是讓回測**能實際跑出報告**並誠實標註可信度。
- **已完成可沿用**：`BacktestEvaluatorService`（純 domain，有測試）、`BacktestApplication`、`IConsensusSnapshotRepository` + 實作、`IPriceProxy` + `PriceProxy`、`SnapshotConsensusService`（已接進 `scheduler.ts`，共識持續累積中）。缺口僅為「對外觸發出口」。
- **資料充足度的統計依據**（對話結論）：每 5 分鐘一筆快照高度自相關，原始筆數一天破千但幾乎全是重疊噪音；真正算數的是「獨立持有期」≈ 觀測時長 / horizon。粗估門檻：~30 才看方向、~200 才能信小邊際；長 horizon 單 coin 要數月。多數 coin × horizon 格子會誠實顯示不足，屬預期且有用的情報。
- **文件需同步**（避免漂移）：本 brief 推翻 `.sdd/2026-06-20-entry-signal-backtest/PRD.md` 的 B2-US-05/US-06 與 §UI「回測無 HTTP 介面、純離線 job」決定 → 改為「內部 / 受保護的同步端點」。產 PRD 時須一併修正既有 B2 PRD 對應段落。
- 相關 domain doc：`docs/domain/riskScore.md`（本輪新增，含 riskScore 公式、已知限制與「快照取樣低估 MAE」等待回測校準的對象）。
- 權威來源：`.sdd/2026-06-20-entry-signal-backtest/PRD.md`、`.sdd/2026-06-20-safe-cohort-consensus/PRD.md`、主 PRD §4 / §7、`.sdd/UL-MAP.md`。
