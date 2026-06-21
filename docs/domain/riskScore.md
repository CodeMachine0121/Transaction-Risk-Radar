# Domain Document — `riskScore` 風險分數

> **定位**：本文件是 `riskScore` 計算邏輯的領域說明，連結「PRD 公式定義」與「程式碼實作」。
> **單一真實來源仍是 PRD**（`.sdd/2026-06-19-trader-risk-radar/PRD.md` 第 4 章）；本文件負責解釋**公式的用意**與**程式碼落點**，不得與 PRD 漂移。修改任一方時三者（PRD／本文件／程式碼）須同步。

---

## 0. 一句話定義

`riskScore` ∈ **[0, 100]**，衡量「**跟單這位交易員有多危險**」——**不是報酬指標**。分數越高越危險。它刻意不獎勵報酬率，把「績效好看」與「適合跟單」徹底分開，專門揪出**高勝率但深回撤／攤平的馬丁格爾陷阱型交易員**。

整個系統的下游（安全群共識 `/consensus`、進場訊號 `/signals`）全部建立在這個分數之上，因此它是訊號鏈最關鍵的地基。

---

## 1. 主公式

```
riskScore = 100 × (
    0.30 × normalize(maxAdverseExcursionPercentile90, cap=50)
  + 0.25 × averagingDownRatio
  + 0.15 × trapSignal
  + 0.15 × normalize(returnDownsideDeviation,        cap=30)
  + 0.15 × normalize(averageLeverage,                cap=20)
)

trapSignal      = winRate × normalize(maxAdverseExcursionPercentile90, cap=50)
normalize(x, c) = clamp(x / c, 0, 1)
```

- 權重總和 = 1，皆可設定（`src/domain/vo/riskScoreWeights.ts`）。
- 程式落點：`Trader.reconstruct()`（`src/domain/entity/trader.ts:179`）。

---

## 2. 五個危險因子 — 公式、用意、程式落點

| 因子 | 權重 | 用意（為什麼它代表危險） | 程式落點 |
| :--- | :--- | :--- | :--- |
| **MAE 90 分位** | 0.30 | 「最深扛了多少浮虧」。每個倉位取生命週期內最深的浮虧%，再取交易員所有倉位的 90 分位——衡量**極端逆勢扛單**的程度。權重最高，因為深回撤是跟單爆倉的直接成因。 | `Position.maxAdverseExcursion()` → `trader.ts:155` |
| **攤平比例** | 0.25 | 「多常在虧損中加倉」。命中攤平的倉位數 / 總倉位數。攤平（往不利價位加倉拉均價）是馬丁格爾的核心動作，看似常贏、實則把風險往尾端堆積。 | `Position.isAveragingDown()` → `trader.ts:158` |
| **陷阱訊號** | 0.15 | 「高勝率 × 深扛單」的乘積。單看勝率會被馬丁格爾型交易員騙（勝率 95% 但偶爾一筆爆掉）；`winRate × normalize(MAE)` 專門點亮「看似穩、其實偷扛」的組合。 | `trader.ts:178` |
| **下行標準差** | 0.15 | 「賠的時候穩不穩」。只取已平倉位中**負報酬**的標準差，不懲罰上行波動。值越高代表虧損忽大忽小、會突然爆一筆。 | `downsideDeviation()` → `trader.ts:169` |
| **平均槓桿** | 0.15 | 「部位開多大」。snapshot 槓桿平均。槓桿放大一切——同樣的逆勢，高槓桿更快觸及清算。 | `Position.averageLeverage()` → `trader.ts:170` |

### 為什麼 MAE 同時出現兩次（不是 bug）

`normalize(MAE)` 在主公式佔 0.30，又透過 `trapSignal` 再進來一次（0.15 × winRate × normalize(MAE)）。這是 **PRD 第 4 章規則 5 的明文設計**，不是重複計分錯誤：本專案頭號目標就是馬丁格爾陷阱，因此「深扛單」這個維度**刻意被加重**，且 trapSignal 只在「同時高勝率」時才放大它。

---

## 3. 兩條輔助公式

### 3.1 ROI 報酬率（leverage-agnostic）

```
realizedReturnPercentage = realizedProfitAndLoss / 進場總成本 × 100
進場總成本 = Σ(open/add 事件的 price × size)
```

刻意用 ROI 法、與槓桿無關，使不同槓桿的交易員報酬可比。用於 `winRate` 與 `returnDownsideDeviation`。程式落點：`Position.realizedReturnPercentage()`（`position.ts:74`）。

### 3.2 安全群投票權重（下游 consensus 用）

```
consensusWeight = clamp(1 − riskScore / 100, 0, 1)
```

越安全（riskScore 越低）票越重。`/consensus`、`/signals` 用它做 inverse-risk 加權。程式落點：`Trader.consensusWeight()`（`trader.ts:265`）。

---

## 4. 計算範圍（樣本集合）— 兩種，勿混淆

| 因子 | 樣本集合 | 套用 90 天時間窗？ | 含未平倉？ |
| :--- | :--- | :---: | :---: |
| MAE 90 分位、攤平比例、平均槓桿 | 所有「曾被觀測到」（有 ≥1 筆 snapshot）的倉位 | ❌ | ✅ |
| 盈虧、勝率、下行標準差 | 近 90 天**已平倉位** | ✅ | ❌ |

**用意**：MAE／槓桿衡量「扛單行為」，當前仍未平倉的深扛部位正是要捕捉的危險，不應因未平倉被排除；而結算型指標（盈虧／勝率／波動）需要明確時點，故限定近 90 天已平倉位。

**邊界決策**：

- 平倉時間未知（`closedAt = null`）的已平倉位 → **保守視為窗內、不丟棄**（`trader.ts:117-119`）。寧可納入也不無聲剔除樣本，代價是可能輕微稀釋時效性。
- 開倉與平倉落在同一輪詢間隔內、從未被觀測到的倉位 → **無 snapshot，整筆排除**（無法算 MAE／槓桿）。PRD 第一版接受此漏失。
- 期初已持倉（carried，首筆 fill `startPosition` 非零）→ 開倉於窗外、進場價未知，**一律排除**。

---

## 5. 精度分層 `riskScoreTier`

| tier | 何時 | 資料來源 | 與主公式差異 | 能否進安全群 |
| :--- | :--- | :--- | :--- | :---: |
| `position` | 部位級資料充足 | 逐筆 fills + snapshots | 上述完整公式 | ✅ |
| `account` | 部位級不足、改用帳戶彙總 | leaderboard 報酬序列 + winRatio | 以**帳戶最大回撤**代替 MAE；**攤平／槓桿無法測得，權重項以 0 計** | ❌ |

account-tier 完整口徑見 `.sdd/2026-06-20-account-level-risk-fallback/PRD.md`。程式落點：`Trader.fromAccountStats()`（`trader.ts:210`）。

> **注意**：account-tier 因少了攤平／槓桿兩項（合計 0.40 權重以 0 計），分數會系統性偏低（看起來較安全）。比較跨 tier 的 riskScore 時須留意此不可比性——這也是只有 `position` tier 能進安全群的原因。

---

## 6. 門檻與 null 行為

- 已平倉位數 < `minimumClosedPositions`（預設 **20**）→ `insufficientData = true`，`riskScore = null`，不納入排行主體。程式落點：`trader.ts:122`。
- 負報酬樣本為 0（從未賠過）→ `returnDownsideDeviation = 0`。
- `riskScore = null` 時 `consensusWeight = 0`（防呆；cohort 已保證非 null）。

---

## 7. 已知限制（影響下游訊號可靠性）

這些**不是漂移**，是設計上的已知取捨，但對「能否用於自動化決策」很關鍵：

1. **MAE 受快照取樣率限制**：`maxAdverseExcursion` 只看輪詢 snapshot，兩次輪詢間更深的浮虧看不到。輪詢越慢，MAE 越被**低估** → riskScore 偏低 → 危險交易員可能被誤判為安全並混入安全群，污染 `/signals`。
2. **normalize 的 cap 是未校準常數**（MAE 50%／槓桿 20x／下行 30）：超過 cap 即飽和為 1，所有「極端危險」被壓成同值，尾端區分度消失。
3. **20 筆 / 90 天門檻**：對新進或低頻交易員天生樣本不足，直接 `insufficientData`，可能漏掉真正穩健的低頻玩家。

> 上述第 1、2 點是後續若要把 `/signals` 用於自動化，**最該優先以回測（B2）量化與校準**的對象。

---

## 8. 相關位置速查

| 內容 | 路徑 |
| :--- | :--- |
| 公式權威定義 | `.sdd/2026-06-19-trader-risk-radar/PRD.md` 第 4 章 |
| riskScore 組裝 | `src/domain/entity/trader.ts` |
| 逐倉位計算（MAE／攤平／ROI／槓桿） | `src/domain/entity/position.ts` |
| 預設權重 | `src/domain/vo/riskScoreWeights.ts` |
| 背景重算編排 | `src/domain/service/recomputeTraderMetricsService.ts` |
| account-tier fallback | `.sdd/2026-06-20-account-level-risk-fallback/PRD.md` |
| 下游消費（安全群共識） | `src/domain/service/safeCohortConsensusService.ts` |
