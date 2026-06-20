# Product Requirements Document (PRD) — Account-Level Risk Fallback

**Feature:** 帳戶級風險評分 fallback（部位抓不到時的後路）
**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering（solo）
**Brief:** `.sdd/2026-06-20-account-level-risk-fallback/BRIEF.md`

> 命名慣例：所有程式識別字一律全名、禁止縮寫（見 `.sdd/UL-MAP.md`）。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:** 部分交易員（尤其 OKX 私密帶單員，`60004`）**逐筆部位抓不到** → 部位級指標（MAE/攤平…）算不出 → `insufficientData` → 在 `/rankings` 與 `/traders` 上毫無風險資訊。但 OKX 排行對**每個**帶單員都提供帳戶彙總（`pnlRatios` 報酬序列 + `winRatio`），足以推估一個**粗略**風險樣貌。
- **Expected Outcome:** 當部位級算不出且有帳戶彙總時，產出**帳戶級（粗版）riskScore**（`tier=account`），讓「看不到部位」的交易員仍有風險評估；明確與部位級精準版（`tier=position`）區分，且不污染主排行。
- **Out of Scope:**
  - Hyperliquid 帳戶級（leaderboard 無報酬序列）。
  - 以 P&L 報酬高低排名（馬丁格爾陷阱）；下單/代操。
  - 改動部位級流程與指標公式。

---

## 2. User Personas

- **Primary Role:** 散戶（查 `/traders` 時，對私密/資料不足的交易員仍想要一個風險參考）；系統（recompute 自動套用）。
- **Usage Context:** REST 查詢；背景 recompute 自動判斷走精準版或 fallback。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 系統, **I want** 部位級算不出且有帳戶彙總時改算帳戶級 riskScore, **so that** 看不到部位的交易員仍有風險評估。 | 1. recompute：部位級為 `insufficientData` 且有 `accountReturnSeries`+`winRate` → 走帳戶級<br>2. 否則維持 `insufficientData`（無彙總者）<br>3. 部位級**可算**時一律走精準版（不觸發 fallback） | P0 |
| **US-02** | **As a** 系統, **I want** 帳戶級指標用下行波動與回撤（非報酬高低）, **so that** 與招牌「揪陷阱」一致。 | 1. **下行標準差**：由 `accountReturnSeries` 每期報酬只取負值計標準差<br>2. **帳戶回撤**：報酬曲線峰到谷最大跌幅<br>3. **陷阱訊號** = `winRate × normalize(accountDrawdown)`<br>4. `riskScore` 由帳戶級指標加權（沿用部位級權重映射，缺項以 0/不計）<br>5. **不**以 P&L 高低排序 | P0 |
| **US-03** | **As a** 使用者, **I want** 區分粗版與精準版, **so that** 不被誤導。 | 1. `TraderRiskDto` 與 `trader_metrics` 帶 `tier`（`position`/`account`）<br>2. `tier=account` **排除於 `GET /rankings`**<br>3. `GET /traders`、`GET /traders/:address` 回傳含 `tier`、看得到帳戶級者 | P0 |
| **US-04** | **As a** 系統, **I want** 從 OKX 排行帶回帳戶彙總, **so that** recompute 有 fallback 輸入。 | 1. `OkxProxy.fetchTraderList` 帶回 `pnlRatios`→`accountReturnSeries` 與 `winRatio`<br>2. 於 sync 持久化最小彙總（供 recompute 取用）<br>3. Hyperliquid 不提供 → 其交易員無帳戶級 | P1 |

---

## 4. Business Flow & Logic

### Flow Diagram

```
sync（per provider）
  OkxProxy.fetchTraderList → LeaderboardTrader{ address, accountValue, accountReturnSeries?, winRatio? }
  saveTraders + saveAccountStats(provider,address,{returnSeries,winRatio})   // 僅 OKX 有

recompute（per (provider,address)）
  positions = findPositions(...)
  trader = Trader.reconstruct(provider,address,positions)        // tier=position
  if trader.insufficientData AND accountStats 存在:
      trader = Trader.fromAccountStats(provider,address,accountStats)   // tier=account（下行std/回撤/陷阱）
  saveTraderMetrics(trader)   // 帶 tier

讀取
  GET /rankings  → 只回 tier=position 且可排行者
  GET /traders   → 回全部（含 tier=account、insufficientData）
```

### Core Business Rules

- **觸發**：fallback 僅在部位級 `insufficientData` 且有帳戶彙總時；部位級可算則永遠優先（精準）。
- **指標口徑**：下行標準差（只取負報酬）沿用 `returnDownsideDeviation` 立場；`accountDrawdown` 取代部位級 MAE 作回撤項；`trapSignal = winRate × normalize(accountDrawdown)`。
- **不獎勵報酬**：不以 P&L 高低排名/評分。
- **tier 分級**：`riskScoreTier`；主排行只收 `position`。
- **provider 綁定能力**：僅「有提供報酬序列」的 provider（OKX）有帳戶級；HL 無。
- **粗版限制**：無法測攤平（`averagingDownRatio` 為 null）、非部位級 MAE、序列解析度粗。

### Edge Cases

- **彙總樣本點不足**（pnlRatios 太少）：視為資料不足，維持 `insufficientData`（門檻見開放項）。
- **無負報酬**：下行標準差 = 0（沿用既有規則）。
- **部位級之後變可算**：下一輪 recompute 自動升級為 `tier=position`（覆寫）。

---

## 5. UI/UX Design & Interaction

- **N/A** — REST JSON；回應 `TraderRiskDto` 多一個 `tier` 欄位。

---

## 6. Non-Functional Requirements

- **可測試性（強制）**：帳戶級指標計算以**合成報酬序列**單元測試（與 OKX 實際語意脫鉤）；fallback 觸發邏輯以 application 測試（mock repository）。
- **分層 / 型別**：vendor 形狀只在 infra；禁 `any`/`unknown`；金額/比率用 `decimal.js`。
- **正規化脫鉤**：domain 只認「每期報酬序列 `Decimal[]`」；OKX `pnlRatios`→序列的轉換（含累積/分期判定）在 `OkxProxy` 邊際處理。

---

## 7. Dependencies & Risks

- **External:** OKX `public-lead-traders`（已驗證免金鑰、含 `pnlRatios`/`winRatio`）。
- **Known Risks:**
  - `pnlRatios` 語意（累積 vs 分期）未 100% 確認 → 影響「每期報酬」推導；以脫鉤設計 + 動工時對 docs/實測校準降風險。
  - 帳戶級為**粗版**，可能與部位級風險不一致；以 `tier` 標示、排除主排行來控管誤導。

---

## 8. Appendix — Open Decisions

1. **`pnlRatios` 語意**（累積 vs 分期）與「每期報酬」推導法——動工時對 OKX docs/實測確認；domain 計算與此脫鉤（吃正規化後的序列）。
2. **資料不足門檻**：`accountReturnSeries` 最少幾點才算帳戶級（否則 insufficientData）。
3. **`accountDrawdown` 的 normalize 上限**與 `riskScore(帳戶版)` 權重（沿用部位級權重、`averagingDown` 項以 0 計？）。
4. **⚠️ Brief Q3 修訂**：原訂「不存原始序列」；但 sync 與 recompute 為不同階段，需在 sync 持久化**最小彙總（winRatio + 報酬序列）**到 `trader_account_stats`（或 `traders` 欄位）供 recompute 取用。理由：保持 recompute 為唯一 metric 寫入點、避免跨階段重抓。屬小量資料，可接受。
5. 相關文件：`.sdd/2026-06-20-multi-source-trader-ranking/`、`.sdd/2026-06-20-list-tracked-traders/`、主 PRD §4；UL-MAP 已加 `riskScoreTier`/`accountReturnSeries`/`accountDrawdown`/`computeAccountLevelRisk`。
