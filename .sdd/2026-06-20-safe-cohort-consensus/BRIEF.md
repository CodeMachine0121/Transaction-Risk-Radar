# 安全群持倉共識雷達 Safe Cohort Consensus — Requirements Brief

## Goal

新增一支描述性 REST API（`safeCohortConsensus`）：在 `riskScore` 判定為「相對安全可跟」的交易員群體中，聚合其**當前未平倉**方向，陳述安全群此刻集中在哪些 coin、淨偏多還偏空、共識多強。定位為 Trader Risk Radar 風控雷達的自然延伸——**只陳述安全群在做什麼，刻意不給買賣/進場建議、不給倉位大小、不預測價格漲跌**。與核心立場一致：把「安全可跟的群體」這件事呈現得更可操作，而非轉型成訊號商。

## Requirements

- **共識群體（safe cohort）**：`riskScoreTier = position`、`insufficientData = false`、且 `riskScore ≤ maxRiskScore`（可設定門檻）的交易員。
- **取樣來源 = 當前未平倉**：每位交易員、每個 coin 取**最新一筆快照**，且須落在**新鮮度窗**內（可設定，預設 = 2 個輪詢間隔）；逾窗的快照視為非當前持倉、不計入。
- **前置資料改動（保留方向）**：目前 `pollTraderService.toSnapshotRecord` 對 `signedSize.abs()` 取絕對值、`PositionSnapshot` 未存方向。需讓快照開始保留方向（帶號 size 或 `side`），`pollTrader` 流程不再丟棄符號。
- **每人一票，inverse-riskScore 權重**：每位交易員對某 coin 貢獻權重 `weight = clamp(1 − riskScore / 100, 0, 1)`（越安全票越重），**不乘倉位名目大小（notional）**，以維持中性描述、避免暗示「跟大倉走」。
- **每 coin 輸出欄位**：
  - `netDirectionBias = Σ(side × weight) / Σ(weight)`，落在 −1…+1（`long = +1`、`short = −1`）。
  - `consensusStrength = |netDirectionBias|`。
  - `participantCount`、`longCount`、`shortCount`。
  - `averageLeverage`（安全群於該 coin 的平均槓桿）。
  - 隨回應附**免責聲明**（描述性分析、非投資建議；呼應 PRD 風險章節「能解釋 ≠ 能賺錢、負和遊戲、不應將身家壓入驗證」）。
- **最小參與人數**：每個 coin 至少 `minimumConsensusParticipants`（可設定，預設 3）位安全交易員才輸出，避免單人「共識」。
- **Endpoints**：
  - `GET /consensus`：全 coin，依 `consensusStrength` 排序、支援分頁。
  - `GET /consensus/:coin`：單一 coin 細節。
  - 查詢參數：`?provider=`、`?maxRiskScore=`、`?minParticipants=`。
- **UL-MAP 同步**：新增詞條 `safeCohortConsensus` 及相關識別字（`netDirectionBias`、`consensusStrength`、`minimumConsensusParticipants`、`maxRiskScore`、新鮮度窗等），命名全名、不縮寫。

## Out of Scope

- 買賣 / 進場建議、倉位大小建議、價格漲跌預測、保證獲利話術。
- 將 OKX 或任何 `riskScoreTier = account` 的交易員納入共識——帳戶級看不到逐筆部位，結構性排除（其本就不進 `/rankings`）。
- 對 `riskScore` 計算公式、現有 `/rankings`、`/traders`、`/traders/:address`、account-level fallback 行為的任何變更。
- 即時串流推送（維持定時輪詢、REST pull 的第一版立場）。

## Open Decisions

供 PRD 作者解決：

- **「當前未平倉方向」資料路徑**：採「為 `PositionSnapshot` 補方向欄」還是「用重建的未平倉 `Position.side()`」。傾向前者——快照（`clearinghouseState`）看得到交易員此刻**全部**持倉（含抓取窗外開的 carried position），而 fills 重建會排除 carried；PRD 定案，並處理 carried position 在此情境的取捨。
- **快照方向欄的精確 schema 形狀**：新增帶號 `signedSize` 欄，或 `side` enum + 絕對 size。
- **預設值與回測校準**：`maxRiskScore`、新鮮度窗倍數、`minimumConsensusParticipants` 的初始值，比照 PRD 既有「門檻為主觀預設、待實際資料校準」的處理。
- **共識強度輔助定義**：是否另增「同向人數佔比」（如 `longCount / participantCount`）作為 `consensusStrength` 之外的輔助欄位。
- **效能 / 快取**：共識聚合是否需預算或快取，以對齊 `/rankings` 的 ≤1s 回應預算（共識為跨交易員聚合，成本高於單表讀取）。

## Context / Background

- 此功能源於使用者需求「依分析結果回應該做多/做空哪個交易對」。經討論釐清：`riskScore` 衡量「跟單有多危險」、**不含方向與漲跌資訊**，無法直接推出買賣訊號。唯一誠實的方向資料路徑是「安全群當前實際持倉的風險加權共識」——因此本功能定位收斂為**描述性共識雷達**，而非進場建議，以守住 PRD「賣分析/風控工具、非代操（法規雷區）」的定位。
- 多源現況（UL-MAP 第 1 節）：系統含 `hyperliquid`（`tier=position`，逐筆 fills）與 `okx`（`tier=account`，僅報酬序列）。共識僅 `tier=position` 可參與，目前等同 Hyperliquid。
- 既有可沿用慣例：`Position Side` enum（`long`/`short`）、`riskScoreTier`、分頁與 `?provider=` 查詢樣式、DTO（`type`、`Dto` 後綴）/ Request（`type`、`Request` 後綴）命名、跨 entity 聚合放 Domain Service、金額用 Decimal。
- 已確認資料缺口位置：`src/domain/service/pollTraderService.ts:55`（`signedSize.abs()`）、`prisma/schema.prisma:55-68`（`PositionSnapshot` 無方向欄）。
