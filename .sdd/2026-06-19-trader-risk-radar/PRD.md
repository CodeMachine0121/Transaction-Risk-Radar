# Product Requirements Document (PRD)

**Feature:** Trader Risk Radar — 第一版（MVP）
**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering（solo）

> 命名慣例：所有程式識別字一律全名、禁止縮寫（見 `.sdd/UL-MAP.md`）。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:**
  鏈上永續合約的跟單，散戶常「不是跟著交易員賺錢，而是死在交易員賺錢的必經之路上」。根因在於排名榜傾向篩出「攤平/馬丁格爾型」交易員——勝率高、回撤看似都能撐回，但散戶本金小、無法跟進加倉，會在價格最深處（交易員即將反轉前）先爆倉。市面跟單平台只看報酬、不揭露這種「高危但好看」的風險。
- **Expected Outcome:**
  產出一個**風險導向**（非報酬導向）的交易員分析與排行 API，能用 `riskScore` 把「跟單危險」的交易員標記出來，特別是揪出高勝率但深回撤/攤平的陷阱型交易員。成功標準：作者本人能用此排行篩掉高危交易員，得到一份「相對安全可跟」的清單。
- **Out of Scope:**
  - 自動下單 / 代操 / 私鑰管理 / 資金託管
  - SSE / WebSocket 即時訊號推送（後續階段）
  - 交易員風格分類標籤（停損型/死扛型/穩定型）
  - 多協議支援（GMX / dYdX / Gains 等）；第一版僅 Hyperliquid
  - 倉位大小建議 / 後備金回推計算器
  - 前端 UI（第一版只有 REST API）

---

## 2. User Personas

- **Primary Role:** 做鏈上永續合約、想跟單但缺乏風控工具的散戶（第一版主要使用者為作者本人）。
- **Usage Context:** 透過 REST API / CLI 主動查詢；非即時搶單，而是「決策前先查風險」的場景。背景作業持續在後台同步與分析。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 散戶, **I want** 取得一份依風險排序的交易員清單, **so that** 我能優先看到相對安全、可跟的交易員。 | 1. `GET /rankings` 回傳依 `riskScore` 排序的交易員列表<br>2. 預設由低到高（安全在前），可參數切換為由高到低<br>3. 支援分頁<br>4. 已平倉位數 < `minimumClosedPositions` 者標記 `insufficientData`，不給 `riskScore` | P0 |
| **US-02** | **As a** 散戶, **I want** 查看單一交易員的完整風險指標, **so that** 我能判斷他是不是攤平/陷阱型、要準備多少緩衝。 | 1. `GET /traders/:address` 回傳 `maxAdverseExcursionPercentile90`、`averagingDownRatio`、`winRate`、`returnDownsideDeviation`、`averageLeverage`、`trapSignal`、`riskScore`<br>2. 明確標示 `isAveragingDown` 行為<br>3. 找不到地址回傳 404 | P0 |
| **US-03** | **As a** 系統, **I want** 自動從 Hyperliquid leaderboard 同步交易員清單, **so that** 不需人工維護追蹤名單。 | 1. 背景作業定時拉取 leaderboard<br>2. 處理分頁與限流<br>3. 以地址去重後寫入 `traders` | P0 |
| **US-04** | **As a** 系統, **I want** 定時輪詢並記錄每位交易員的倉位動作與浮虧快照, **so that** 分析引擎有足夠資料計算指標。 | 1. 分層輪詢（高排名勤、長尾鬆）<br>2. 寫入 `position_events` 與 `position_snapshots`<br>3. 以成交唯一 id 去重，重複輪詢不重複計算 | P0 |
| **US-05** | **As a** 系統, **I want** 定期重算所有交易員指標與 `riskScore`, **so that** 排行保持更新。 | 1. 分析引擎排程執行<br>2. 依第 4 章公式計算並寫回 `trader_metrics`<br>3. 計算僅採用近 90 天已平倉位 | P0 |

---

## 4. Business Flow & Logic

### Flow Diagram

```
synchronizeLeaderboard ──▶ traders
        │
        ▼ (分層排程)
   pollTrader ──▶ position_events + position_snapshots  (以成交 id 去重)
        │
        ▼ (分析引擎排程)
   computeMaxAdverseExcursion
   detectAveragingDown
   computeProfitAndLossStatistics
   computeReturnDownsideDeviation
   computeTrapSignal
   computeRiskScore ──▶ trader_metrics
        │
        ▼
   getRiskRanking / getTraderDetail  (REST API)
```

### Core Business Rules — 指標計算口徑

**時間窗：** 盈虧、勝率、下行標準差皆採用**近 90 天**已平倉位。

1. **最大逆向幅度（MAE）**
   ```
   maxAdverseExcursionPerPosition   = min(unrealizedProfitAndLossPercentage)  // 單倉位，負值
   maxAdverseExcursionPercentile90  = percentile90( |maxAdverseExcursionPerPosition| )  // 交易員層級
   ```

2. **攤平偵測**
   ```
   isAveragingDown(position) = position 在 unrealizedProfitAndLossPercentage < 0 時
                               存在 size 遞增的 add 事件
   averagingDownRatio        = count(isAveragingDown) / count(positions)
   ```

3. **盈虧與勝率（近 90 天）**
   ```
   realizedReturnPercentagePerPosition = 單一已平倉位的已實現報酬率
   realizedProfitAndLoss               = sum(已平倉位的已實現盈虧)
   winRate                             = count(獲利已平倉位) / count(已平倉位)
   ```

4. **下行標準差（近 90 天）**
   ```
   returnDownsideDeviation = standardDeviation(
       realizedReturnPercentagePerPosition 中所有 < 0 的值
   )
   ```
   衡量「賠的時候穩不穩、會不會突然爆一筆」；越高越危險。僅取負報酬，不懲罰上行波動。

5. **陷阱訊號**
   ```
   trapSignal = winRate × normalize(maxAdverseExcursionPercentile90)
   ```
   抓「高勝率（看似穩）但倉位偷偷扛很深」的馬丁格爾陷阱。

6. **正規化函式**
   ```
   normalize(maxAdverseExcursionPercentile90) = clamp(|maxAdverseExcursionPercentile90| / 50, 0, 1)
   normalize(averageLeverage)                 = clamp(averageLeverage / 20, 0, 1)
   normalize(returnDownsideDeviation)         = clamp(returnDownsideDeviation / 30, 0, 1)
   ```

7. **風險分數（0–100，越高越危險）**
   ```
   riskScore = 100 × (
       weightMaxAdverseExcursion      × normalize(maxAdverseExcursionPercentile90)
     + weightAveragingDown            × averagingDownRatio
     + weightTrapSignal               × trapSignal
     + weightReturnDownsideDeviation  × normalize(returnDownsideDeviation)
     + weightLeverage                 × normalize(averageLeverage)
   )
   ```
   **預設權重（皆可設定，總和 = 1）：**

   | 識別字 | 值 |
   | :--- | :--- |
   | `weightMaxAdverseExcursion` | 0.30 |
   | `weightAveragingDown` | 0.25 |
   | `weightTrapSignal` | 0.15 |
   | `weightReturnDownsideDeviation` | 0.15 |
   | `weightLeverage` | 0.15 |

   **設計原則：`riskScore` 衡量「跟單有多危險」，刻意不獎勵報酬率——把「報酬好看」與「適合跟單」徹底分開。**

8. **排序與樣本門檻**
   - `riskRanking` 預設由低到高（安全在前）；可切換 `descending`（黑名單）。
   - 已平倉位數 < `minimumClosedPositions`（預設 20）→ 標記 `insufficientData`，不給 `riskScore`、不納入排行主體。

### Edge Cases

- **Hyperliquid API 限流 / 逾時：** 退避重試；本輪失敗的交易員下輪補撈，不中斷整體流程。
- **倉位在兩次輪詢間開倉又平倉：** 第一版接受漏失（非目標客群），記錄為已知限制。
- **負報酬樣本為 0（從未賠過）：** `returnDownsideDeviation = 0`。
- **單筆成交重複輪詢到：** 以成交唯一 id 去重，確保 idempotency。
- **資料庫寫入失敗：** 該筆重試；分析引擎以最後一次成功的資料為準。

---

## 5. UI/UX Design & Interaction

N/A — 第一版僅提供 REST API，無前端 UI。API 回應為 JSON。

---

## 6. Non-Functional Requirements

- **Performance:** 排行查詢為讀取預算好的 `trader_metrics`，回應 ≤ 1s。分析為背景批次，不阻塞查詢。
- **數字精度：** 金額一律以 `bigint` + decimal 函式庫（decimal.js / dnum）處理，**禁用 JavaScript float**。
- **Security:** 第一版為個人使用；API 可先以簡單 token 保護。不持有任何私鑰、不碰使用者資金。
- **Tech Stack:** TypeScript + Fastify + PostgreSQL/TimescaleDB + Redis + BullMQ；部署單一 VPS + Docker Compose。
- **Naming:** 全名識別字、禁止縮寫。
- **Analytics:** N/A（第一版）。

---

## 7. Dependencies & Risks

- **External Dependencies:**
  - Hyperliquid 官方 REST API（leaderboard、clearinghouseState 等）——資料來源命脈。
  - Redis（BullMQ 佇列與快取）、PostgreSQL/TimescaleDB。
- **Known Risks:**
  - **「能解釋」不等於「能賺錢」：** 鏈上合約為負和遊戲（手續費、資金費率、滑價、MEV）。本工具最務實的成果是「輸得比較慢、比較不會被洗出場」，離穩定獲利仍有距離。**不應將身家壓入驗證。**
  - **Hyperliquid API 變動 / 限流：** 第一版強耦合單一資料源，需監控其 API 穩定性。
  - **權重與門檻為主觀預設：** `riskScore` 權重、各 normalize 上限、`minimumClosedPositions` 皆為初始假設，須以實際資料回測校準。
  - **產品化最大難點是信任：** 故定位為「賣分析/風控工具」而非代操（法規雷區）。

---

## 8. Appendix

- 發想與技術討論全文：專案根目錄 `DISCUSSION.md`
- 需求共識：`.sdd/2026-06-19-trader-risk-radar/BRIEF.md`
- 通用語言地圖：`.sdd/UL-MAP.md`
- **待後續校準的開放項：** leaderboard 同步頻率、追蹤交易員數量上限、分層輪詢具體間隔與 rate-limit 預算、snapshot 取樣密度、資料保留期限、各 normalize 上限值（50 / 20 / 30）的回測校準。
