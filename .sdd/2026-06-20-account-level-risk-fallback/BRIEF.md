# Account-Level Risk Fallback — Requirements Brief

## Goal

為「部位級風險分數算不出來（`insufficientData`）、但其 provider 有提供帳戶彙總報酬序列」的交易員，提供一個**帳戶級（粗版）風險評分後路**。用排行榜的 `pnlRatios`（報酬序列）+ `winRatio` 算出**下行標準差、帳戶回撤、陷阱訊號**，組成 `riskScore`，標記 `tier=account`，只在 `/traders` 系列詳情/列表呈現，不混入主排行。典型用途：OKX 私密帶單員（60004，看不到逐筆部位）仍能得到一個粗略風險評估。

## Requirements

- **觸發**：recompute 時，若部位級結果為 `insufficientData`，且該交易員有帳戶彙總（`pnlRatios` + `winRatio`）→ 改算帳戶級指標；否則維持 `insufficientData`。
- **帳戶級指標（粗版，沿用既有口徑）**：
  - **下行標準差**：由 `pnlRatios` 推出每期報酬、只取負值計標準差（**非全標準差**——上漲不算危險，沿用 `returnDownsideDeviation` 立場）。
  - **帳戶回撤**：報酬曲線峰到谷最大跌幅。
  - **陷阱訊號**：`winRatio × normalize(帳戶回撤)`。
  - `riskScore`：由上述帳戶級指標加權組成。
- **分級標記**：`trader_metrics` 與 `TraderRiskDto` 新增 `tier`（`position` | `account`）。
- **呈現**：`tier=account` **排除於 `/rankings`**；於 `/traders`、`/traders/:address` 可見（帶 `tier`）。
- **資料來源**：`OkxProxy.fetchTraderList` 帶回 `pnlRatios` / `winRatio`（擴充 `LeaderboardTrader` 或新增 VO）。**Hyperliquid 不適用**（leaderboard 僅 `accountValue`、無報酬序列）。
- **持久化**：只存衍生的帳戶級指標 + `tier`，**不存**原始 `pnlRatios` 序列。
- **原則**：不以 P&L 高低排名（馬丁格爾陷阱）。

## Out of Scope

- Hyperliquid 帳戶級評分（無報酬序列資料）。
- P&L 報酬排名、任何下單/代操。
- 改動部位級（`tier=position`）流程與指標公式。
- 持久化原始報酬序列。

## Open Decisions

留給 PRD 作者解決：

- `pnlRatios` 語意（**累積** vs **分期**）與「每期報酬」的推導法——需對 OKX docs/實測確認。
- 帳戶回撤的 `normalize` 上限值；`pnlRatios` 樣本點過少時的處理（資料不足是否仍標 `insufficientData`，及最少點數門檻）。
- `tier` 欄位命名與序列化形狀；`riskScore(帳戶版)` 的權重是否沿用部位級權重或另訂。

## Context / Background

- 起因：OKX `public-lead-traders` 對**每個**帶單員（含私密 60004）都給彙總 `pnlRatios`/`winRatio`/`aum`，但逐筆部位（`public-subpositions-history`）私密者抓不到 → 部位級指標算不出。此後路讓「看不到部位」的交易員仍有一個風險評估。
- 立場一致性：**不看報酬高低**（高勝率/高報酬常是馬丁格爾陷阱），而是看**報酬曲線的回撤與下行波動**——與招牌「揪陷阱、不獎勵報酬」一致。
- 粗細並存：帳戶級是 fallback、粗版（`pnlRatios` 約 5 天一點、樣本少、無逐筆 → 無法測攤平、非部位級 MAE），明確以 `tier` 與部位級精準版區分；主排行只收部位級。
- 既有基礎：`(provider, address)` 識別、per-provider 隔離、`returnDownsideDeviation`/`trapSignal` 口徑、`/traders`（列全部含 insufficientData）、`/rankings`（只回可排行）皆已就緒。
- UL-MAP §3 現訂「第一版只談倉位層級 MAE、帳戶層級回撤不納入」→ 本 feature 刻意擴充帳戶層級，需更新該條。
- 相關：`.sdd/2026-06-20-multi-source-trader-ranking/`、`.sdd/2026-06-20-list-tracked-traders/`、`.sdd/2026-06-19-trader-risk-radar/PRD.md`（§4 指標公式）。
