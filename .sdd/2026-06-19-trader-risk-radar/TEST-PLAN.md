# Test Plan — Trader Risk Radar 指標計算引擎 (TDD tracker)

來源：PRD 第 4 章。每個 cycle 一個 commit（Conventional Commits）。

| Cycle | 函式                                     | 行為                                                          | 狀態 |
| ----- | ---------------------------------------- | ------------------------------------------------------------- | ---- |
| C1    | `normalize`                              | clamp(value/cap, 0, 1)；cap≤0 throw                           | done |
| C2    | `computeMaxAdverseExcursionPerPosition`  | min(unrealizedPnlPct)；空陣列 throw                           | done |
| C3    | `computeMaxAdverseExcursionPercentile90` | 各倉位 MAE 絕對值的 p90（線性插值）；空陣列 throw             | done |
| C4    | `detectAveragingDown`                    | 以更差價格加倉的偵測（加權均價推斷）                          | done |
| C5    | `computeAveragingDownRatio`              | 攤平倉位數 / 總倉位數；空陣列 throw                           | done |
| C6    | `computeProfitAndLossStatistics`         | realizedProfitAndLoss 加總 + winRate；空陣列 throw            | done |
| C7    | `computeReturnDownsideDeviation`         | 負報酬子集母體標準差；無負報酬→0                              | done |
| C8    | `computeTrapSignal`                      | winRate × normalizedMae                                       | done |
| C9    | `computeRiskScore`                       | 五項加權 ×100 + 預設權重                                      | done |
| INT   | `computeTraderMetrics`                   | 整合九函式 + 正規化上限(50/20/30) + insufficientData 門檻(20) | done |
