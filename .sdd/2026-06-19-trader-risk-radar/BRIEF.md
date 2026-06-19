# Trader Risk Radar — Requirements Brief

## Goal

打造 Trader Risk Radar 第一版（MVP）——定時從 Hyperliquid leaderboard 自動抓取交易員，計算「風險導向」的核心指標（MAE、攤平偵測、基本盈虧/勝率），並透過 REST API 提供風險排行與單一交易員詳情。產品定位為**分析 + 風控工具**（給訊號讓使用者自行判斷），不代操、不自動下單。

## Requirements

### 交易員來源

- 以背景作業定時從 Hyperliquid leaderboard 自動拉取交易員清單並同步。
- 須處理分頁、API 限流、清單去重。

### 資料攝取（polling，非串流）

- 以分層輪詢方式定時撈取每位交易員的持倉 / 成交。
- 寫入兩張核心表：
  - `position_events`：逐筆動作（open / add / reduce / close，含 price、size、leverage、ts）。
  - `position_snapshots`：每次輪詢對每個開倉拍一張浮虧快照（mark_price、unrealized_pnl_pct、margin、ts）。
- 以成交唯一 id / hash 去重（idempotency），避免統計重複計算。

### 核心指標計算（三件組）

- **MAE（最大逆向幅度）**：`min(unrealized_pnl_pct)` over snapshots——倉位最深扛到哪。
- **攤平 / 加倉偵測**：同一倉位在虧損中出現 size 遞增的 `add` 事件 → 標記為攤平/馬丁格爾型（高危）。
- **基本盈虧與勝率**：已實現盈虧、勝率。

### 風險排行

- 以上述指標產出「風險導向」排行（非單純報酬排名），結果寫入 `trader_metrics`。

### REST API

- 風險排行列表（支援排序 / 分頁）。
- 單一交易員詳情（核心指標 + 攤平標記 + MAE）。

### 技術棧

- TypeScript + Fastify + PostgreSQL / TimescaleDB + Redis + BullMQ。
- 金額一律以 `bigint` + decimal 函式庫（decimal.js / dnum）處理，**禁用 JS float**。
- 部署：單一 VPS + Docker Compose，不碰 K8s / 微服務。

## Out of Scope

- 自動下單 / 代操 / 私鑰管理 / 資金託管。
- SSE / WebSocket 即時訊號推送（後續階段）。
- 交易員風格分類標籤（停損型 / 死扛型 / 穩定型）——留待核心指標穩定後再加。
- 多協議支援（GMX / dYdX / Gains 等），第一版僅 Hyperliquid。
- 倉位大小建議 / 後備金回推計算器。
- 前端 UI（第一版只有 API）。

## Open Decisions

交由 PRD 階段釐清：

- Leaderboard 同步頻率、追蹤交易員數量上限。
- 分層輪詢的具體間隔（高排名 vs 長尾）與 rate-limit 預算。
- 「風險導向排行」的具體加權公式（如何將 MAE / 攤平 / 盈虧組合成排序分數）。
- 勝率 / 盈虧的計算口徑（已實現 vs 含未實現、時間窗）。
- 資料保留期限與 snapshot 取樣密度。

## Context / Background

- 完整發想脈絡與根因診斷見專案根目錄 `DISCUSSION.md`。
- 痛點根因：舊跟單系統的排名演算法傾向篩出「攤平/馬丁格爾型」交易員——勝率高、看似都能撐回，但散戶本金小、無法跟進加倉，會在價格最深處（交易員即將反轉前）先爆倉。本產品的核心差異化即在於用 MAE 與攤平偵測，把這種「高危但好看」的交易員標記出來。
- 三個 MVP 範圍決策（2026-06-19 與使用者確認）：
  1. 交易員來源 → 自動抓 Hyperliquid 排行榜。
  2. 必算指標 → 核心三件組（MAE + 攤平偵測 + 基本盈虧/勝率）。
  3. 交付介面 → 純 REST 查詢。
- 第一個里程碑（最薄一條線）：對單一交易員跑通「定時撈 → 存成 events + snapshots → 算出 MAE 與是否攤平」。架構與演算法解耦，指標細節可後續替換。
