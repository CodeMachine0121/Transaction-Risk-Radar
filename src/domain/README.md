# Domain 層

核心業務邏輯與領域模型。**本專案的靈魂**：指標計算引擎。

- Domain Service：`computeMaxAdverseExcursion`、`detectAveragingDown`、`computeProfitAndLossStatistics`、`computeReturnDownsideDeviation`、`computeTrapSignal`、`computeRiskScore`。
- 計算公式的唯一真實來源為 `.sdd/2026-06-19-trader-risk-radar/PRD.md` 第 4 章。
- **純邏輯、不依賴 I/O**（不碰資料庫或外部 API），便於 TDD 單元測試。
- 數值一律使用 `Decimal`（decimal.js），禁用浮點。

> 指標計算為 `/tdd` 的首要實作目標。
