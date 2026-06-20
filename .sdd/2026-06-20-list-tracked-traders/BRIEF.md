# List Tracked Traders — Requirements Brief

## Goal

新增唯讀端點 `GET /traders`，列出**所有追蹤中的交易員**（包含 `insufficientData=true`、尚未進入 `/rankings` 的），支援 `?provider=` 篩選與分頁。目的是讓使用者看見「已同步但尚未可排行」的交易員（例如 OKX 那 6 個公開帶單員），補上 `/rankings`（只回可排行者）的可視性缺口。**純讀取，不做任何寫入 CRUD**（資料由 worker 背景攝取）。

## Requirements

- `GET /traders`：回傳 `TraderRiskDto[]`（沿用既有形狀，含 `provider`/`insufficientData`/各指標，未計算者為 null）。
- 涵蓋**全部**已重算交易員（`trader_metrics` 全列，含 `insufficientData=true`），**不**套用 `/rankings` 的可排行過濾。
- `?provider=` 篩選（`hyperliquid`/`okx`）；缺漏則回全部來源。
- 分頁 `?offset=&limit=`（沿用 `/rankings` 慣例與預設）。
- 預設排序：**可排行者依 `riskScore` 升冪在前，`insufficientData`（null score）殿後**。
- domain 慣例：跨多 trader 查詢置於 Domain Service；repository 新增「不過濾 insufficientData」的查詢方法。

## Out of Scope

- 任何寫入型 CRUD（create/update/delete 交易員或指標）——與背景攝取衝突，且不在產品需求。
- 「已同步但從未重算」（只有 `traders`、無 `trader_metrics` 列）的交易員——短暫過渡狀態，先不納入。
- 變更 `/rankings`、`/traders/:address`、ingestion、domain 指標公式。

## Open Decisions

留給 PRD 作者解決：

- 是否需要 `?insufficientData=` 之類的篩選旗標（目前一律全列）。
- `limit` 預設值與上限（沿用 `/rankings` 的 50 即可？）。

## Context / Background

- 起因：OKX 同步回 10 個帶單員（6 公開、4 私密 60004），但 `/rankings?provider=okx` 為空，因為它們 `insufficientData=true`（指標需「有 snapshot 的已平倉位」累積，歷史回補倉位無 snapshot → closed=0）。資料其實已存、`/traders/:address?provider=okx` 查得到，只是 `/rankings` 看不到。
- 此端點補的是「列出全部、看累積進度」的可視性，而非新功能邏輯。
- 形狀沿用 `TraderRiskDto`；可參照 `RiskRankingService`（排序/分頁）與 `riskRankingController`（`?provider=`/分頁解析）。
- 相關：`.sdd/2026-06-20-multi-source-trader-ranking/`（多源 + provider 識別）、`.sdd/2026-06-19-trader-risk-radar/PRD.md`（US-01 排行、§4 指標需 snapshot 口徑）。
