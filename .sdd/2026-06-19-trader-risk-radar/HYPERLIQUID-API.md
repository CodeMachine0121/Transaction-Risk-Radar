# Hyperliquid API 契約（ingest 用，皆為公開讀取、免 API key）

## 1. Leaderboard — 交易員清單

- **GET** `https://stats-data.hyperliquid.xyz/Mainnet/leaderboard`
- 回應：
  ```json
  { "leaderboardRows": [
    { "ethAddress": "0x...", "accountValue": "12345.6",
      "displayName": "...", "prize": 0,
      "windowPerformances": [
        ["day",   { "pnl": "..", "roi": "..", "vlm": ".." }],
        ["week",  { ... }], ["month", { ... }], ["allTime", { ... }]
      ] } ] }
  ```
- 約 15,000 筆。時間窗：day/week/month/allTime（各含 pnl、roi、vlm）。

## 2. clearinghouseState — 持倉快照

- **POST** `https://api.hyperliquid.xyz/info`，body `{ "type": "clearinghouseState", "user": "0x..." }`
- 回應重點：
  ```json
  { "assetPositions": [
      { "type": "oneWay",
        "position": {
          "coin": "ETH", "szi": "2.0",        // 帶正負號：正=多、負=空
          "entryPx": "3000.0",
          "leverage": { "type": "cross", "value": 10, "rawUsd": "..." },
          "unrealizedPnl": "50.0", "positionValue": "6000.0",
          "marginUsed": "600.0", "liquidationPx": "...", "returnOnEquity": "..."
        } } ],
    "marginSummary": { "accountValue": "...", "totalNtlPos": "...", ... },
    "time": 1700000000000 }
  ```
- 注意：`szi`/價格/金額皆為**字串** → 一律以 Decimal 解析。`assetPositions[].position` 為巢狀。

## 3. userFillsByTime — 成交（重建倉位生命週期用）

- **POST** `https://api.hyperliquid.xyz/info`，body `{ "type": "userFillsByTime", "user": "0x...", "startTime": <ms>, "endTime": <ms?> }`
- 每次最多 2000 筆，僅保留最近 10000 筆。`userFills`（不帶時間）回最近 2000 筆。
- fill 物件：
  ```json
  {
    "coin": "AVAX",
    "px": "18.435",
    "sz": "93.53",
    "side": "B", // B=買(bid)、A=賣(ask)
    "time": 1681222254710,
    "startPosition": "26.86", // 本筆成交前的帶號持倉量
    "dir": "Open Long", // Open/Close Long/Short …（語義方向）
    "closedPnl": "0.0",
    "hash": "0x...",
    "oid": 90542681,
    "fee": "0.01",
    "tid": 118906512037719
  }
  ```
- **去重鍵：`tid`**（成交唯一 id）。倉位重建：由 `startPosition` + `side`×`sz` 推導帶號持倉變化，分類為 open/add/reduce/close。

## 認證

- 上述三者皆**公開讀取、不需 API key / 簽章**。僅下單等 exchange 端點需錢包簽章（本專案不涉及）。
- 未來若需私有資料，API base URL 等以環境變數注入（見 `.env.example`）。
