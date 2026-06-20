# 共識加權強化 Consensus Weighting Refinement — Requirements Brief

## Goal

強化現有「安全群持倉共識雷達」（`SafeCohortConsensusService` / `GET /consensus`）的加權與資料粒度，解決實測發現的「共識被極度分散的巨鯨書主導、樣本薄、看不出 conviction」問題：把投票權重從「每人一票（僅 inverse-riskScore）」升級為**同時反映安全度、conviction、與分散程度**，並帶入持倉時間資訊。**維持描述性定位，不跨到進場建議**（建議層屬後續 feature B）。

## Requirements

- **單一合併權重機制（取代每人一票）**：每張票的權重 =
  `inverseRiskScoreWeight × positionConvictionShare`
  其中 `inverseRiskScoreWeight = clamp(1 − riskScore/100, 0, 1)`（沿用既有），
  `positionConvictionShare = 該倉位 notional / 該交易員當前所有持倉 notional 總和`。
  - 效果：持 178 個 coin 的巨鯨在單一 coin 的佔比極小 → 自動降權；重押少數 coin 者 → 票重。一個因子同時兌現「分散書降權」與「conviction 加權」。
- **notional 來源**：`positionNotional = |signedSize| × markPrice`（兩者皆已在 `position_snapshots`），不新增外部呼叫。
- **加權法可切換、向後相容**：查詢參數 `weighting=equal|conviction`（預設 `conviction`）。`equal` 維持現行「每人一票」行為，確保既有測試與既有 `/consensus` 語意可回退。
- **持倉時間 / 新開倉資訊**：`CurrentOpenPosition` 帶入 `positionAgeMilliseconds`（由該 (trader, coin) 在新鮮度窗內連續快照的最早 `capturedAt` 推估，或對齊 `reconstructPositions` 的 `openedAt`），並在 `CoinConsensusDto` surface「近期新開倉人數」等描述欄位。**A 階段僅 surface、不據此 gate 或改權重。**
- **新增/調整輸出欄位（向後相容）**：保留既有 `netDirectionBias`/`consensusStrength` 等欄位語意；新增 conviction 加權後的對應值與分散度描述（如 `averageConvictionShare`、`newPositionCount`），讓使用者同時看見「人頭版」與「conviction 版」。
- **維持描述性**：仍不輸出買賣建議、不預測價格，回應續帶免責。
- **UL-MAP 同步**：新增 `positionConvictionShare`、`positionNotional`、`positionAgeMilliseconds`、`weighting` 等詞條。

## Out of Scope

- 進場訊號 / verdict / `GET /signals`（屬 feature B）。
- 回測與門檻校準（屬 feature B）。
- 改動 `riskScore` 公式、`/rankings`、`/traders`、account-level fallback。
- 納入 account-tier 交易員（無逐筆部位，續排除）。

## Open Decisions

供 PRD 作者解決：

- **conviction share 的精確定義**：以 notional 佔比直接當乘數，還是先經一個凹函式（如 `sqrt`）緩和極端集中？是否設每票權重下限/上限避免單人壟斷某 coin。
- **`positionAgeMilliseconds` 的來源**：採「新鮮度窗內連續快照最早 `capturedAt`」（便宜、近似）還是對齊 fills 重建的 `openedAt`（精準、較貴）。carried position（窗外開倉）如何標示。
- **輸出形狀**：conviction 版是「取代」`netDirectionBias` 還是「並列新增欄位」（傾向並列，向後相容）。
- **`weighting` 預設**：`conviction`（建議）或維持 `equal`。
- **分散度是否也獨立成一個顯示指標**（如每位參與者持有 coin 數 / Herfindahl），供使用者判讀巨鯨主導程度。

## Context / Background

- 實測 `GET /consensus`：安全群 7 人，但每個 coin `participantCount` 幾乎都是 3——因為 2 位巨鯨各持 178 個 coin（近乎全盤），對每個 coin 都投票，數值（如 strength≈0.36）本質是「兩鯨同向、第三人唱反調」。純人頭、每人一票會被這種「指數型大書」主導，conviction 加權可大幅改善鑑別度。
- 既有資料足夠：`position_snapshots` 已含 `signedSize`、`markPrice`、`leverage`；coin 數與 notional 佔比可即時導出；`reconstructPositions` 已知 `openedAt`。
- 既有慣例沿用：跨 entity 聚合放 `SafeCohortConsensusService`；單一 trader 計算放 entity 方法（如 `consensusWeight()`，conviction 乘數可作另一 entity/VO 方法或聚合內計算）；Decimal、禁 any、DTO/Query `type`。
- 權威來源：`.sdd/2026-06-20-safe-cohort-consensus/PRD.md`、`architecture.md`、`.sdd/UL-MAP.md`、主 PRD §4。
- 風險低：純強化既有 request-time service + 資料粒度，不轉定位；以 `weighting=equal` 保留回退。
