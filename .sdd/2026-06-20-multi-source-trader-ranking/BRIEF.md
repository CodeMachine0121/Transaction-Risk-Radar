# Multi-Source Trader Ingestion & Unified Risk Ranking — Requirements Brief

## Goal

把資料層從**單一來源（Hyperliquid）**擴展為**多來源（Hyperliquid + OKX）**，各來源正規化成**統一的交易員/排行資料格式**，以 `(provider, address)` 為識別，產出一份（中繼用的）risk-ranked trader list。**兩個來源都保住攤平偵測**（OKX 透過 per-order sub-position 重建）。這是日後「provider-agnostic 聰明錢部位/方向訊號」的資料地基；**訊號層本身不在此範圍**。

## Requirements

- **資料來源層一般化**：建立 provider-agnostic 的攝取契約，per-provider Proxy 實作（`HyperliquidProxy` 已存在；新增 `OkxProxy`），各自正規化成共用 domain VO。
- **交易員識別加 `provider`**：主鍵 `(provider, address)`（OKX 以 lead-trader `uniqueCode` 放入 address 欄位）。需 schema migration。
- **per-provider 追蹤名單（發現）**：Hyperliquid `leaderboard`；OKX `public-lead-traders`（ranks）。
- **per-provider 已平倉位取得（供指標）**：
  - Hyperliquid：`userFillsByTime` → `Position.reconstruct`（逐筆 fills）。
  - OKX：`public-subpositions-history` → 由 **per-order sub-position 重建**（每筆 sub-position = 一個加倉 tranche：price = `openAvgPx`、size = `subPos`、time = `openTime`）。
- **攤平偵測兩來源都保留**：把「逐筆/逐 tranche 序列」餵進既有 `Position.isAveragingDown()`。
- **MAE / 槓桿靠輪詢當前開倉**：Hyperliquid `clearinghouseState`；OKX `public-current-subpositions`（`uplRatio`、`lever`）。
- **per-provider 限流**：沿用 `RequestWeightLimiter` + 429 退避樣式（OKX 有自己的 rate limit，另配一組）。
- **統一排行輸出格式帶 `provider`**：`/rankings` 增加 provider 維度/篩選。
- **Scheduler per-provider 跑** sync → poll → recompute（維持 per-trader 失敗隔離）。

## Out of Scope

- **provider-agnostic 市場/部位「訊號」層（B）** — 留待後續 feature。
- **幣安及其他 CEX**（官方無公開取得他人帶單員資料的 API，只能 scraping）。
- 其他鏈上場所（dYdX / GMX / Drift） — 未來。
- 變動 Hyperliquid 既有行為，或更動 domain **指標公式本身**（MAE/攤平/勝率/下行標準差算法不變）。

## Open Decisions

留給 PRD 作者解決：

- **實測確認 OKX sub-position = per-open-order**：分批加倉是否確實回多筆 sub-position；以及「同一張單一直加（同 subPosId 內部更新）」這個盲點的實際影響程度。
- **OKX 認證**：`public-*` copytrading 端點是否需要 API key/passphrase。
- **OKX 邏輯倉位的歸併口徑**（重要）：把**每筆 sub-position 當成一個倉位**，還是把同一標的的多筆 sub-position **歸併成一個邏輯倉位（開→平）**？這直接影響 `closedPositionCount`、`winRate`、`realizedReturnPercentage` 的計算正確性。
- **跨源排行形態**：統一一張榜 vs 分場所榜（兩源現在都支援攤平 → 指標集一致 → 統一較可行；但人群分布不同，需訂代表性/加權政策）。
- OKX rate-limit 預算/設定；是否抽出共用的 `IRateLimiter` 給各 proxy。
- `minimumClosedPositions` 等門檻在各 provider 的適用性。

## Context / Background

- **北極星**：最終產品是 provider-agnostic 的「聰明錢部位/方向訊號」——使用者在任何交易所都能用。本 brief 只蓋**多源資料地基 + 中繼排行**，訊號後做。
- **OKX 能算攤平的依據（修正先前結論）**：OKX 以 **per-open-order 的 sub-position** 記錄（證據：回應帶 `openOrdId` 單一開倉單 ID；OKX 官方 FAQ：「Lead 分頁算個別下單數，Open Position 分頁按合約彙總，2 張單 → Lead=2、Open Position=1」）。→ 分批加倉會呈現為**多筆 sub-position**，可重建加倉路徑。先前「OKX 只給一筆彙總、攤平報廢」的假設是錯的；痛點降級為「需用 sub-position 重建，而非 raw fills」。
- **幣安排除**：copy-trading API 只給帶單員管理自己；無官方公開瀏覽他人部位/歷史 → 只能 scraping（脆弱、踩 ToS）。
- **識別**：EVM 場所共用 `0x` 格式 → 裸地址非全域唯一 → 必須 `(provider, address)`。
- **架構現況**：Clean/Onion，domain 不依賴來源；proxy 在 infra；近期完成的限流（`RequestWeightLimiter` + 429 退避）可 per-provider 複用。
- **輸出非預測**：排行/部位皆為 descriptive；訊號層日後也以 descriptive-first 為原則。
