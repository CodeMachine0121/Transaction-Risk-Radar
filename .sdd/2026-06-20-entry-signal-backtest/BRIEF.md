# 進場訊號 + 回測 Entry Signal & Backtest — Requirements Brief

## Goal

在強化後的安全群共識之上，新增一個**決策層** domain service（`EntrySignalService`），由 `SafeCohortConsensusApplication` 在 `listConsensus` 之後呼叫，對每個 coin 輸出**可解釋、分級**的進場傾向訊號（非下單指令）；並建立**離線回測**驗證這些規則是否真有預測力。此為「描述 → 半建議」的定位轉向，故訊號為獨立 opt-in 端點、帶更重免責，且**門檻必須由回測校準後才可被信任**。

## Requirements

### B1 — 訊號層（request-time，實驗性）
- 新增 `EntrySignalService`（domain，跨 coin 判讀）。Application 編排：`consensus = listConsensus(query)` → `entrySignalService.evaluate(consensus)`。兩者皆具體 domain service、注入 Application（無介面）。
- 輸出每 coin 一筆 `EntrySignalDto`：
  `{ coin, lean: 'long'|'short'|'neutral', setupQuality: string(0..1), verdict: 'worth-considering'|'avoid'|'no-signal', reasons: string[], disclaimer }`。
  - `setupQuality` 是規則綜合分，**非「獲利機率」**；`reasons` 必填，逐條說明判斷依據（可解釋）。
- 規則（門檻**全部可注入**、預設未校準）：
  - 強度門檻：`consensusStrength ≥ 門檻` 且方向明確 → 給 `lean`；
  - 擁擠 / 高槓桿煞車：`averageLeverage` 過高、或一致到極端（接近 ±1）→ 降級或標 `avoid`（擁擠視為潛在反指標）；
  - 穩健度：套用 conviction 加權（feature A）後方向不翻 → 加分；
  - 樣本/巨鯨過濾：參與人數過少或單人 conviction 佔比過高 → `no-signal`。
- 獨立 opt-in 端點 `GET /signals`（不取代 `/consensus`），回應帶**比 `/consensus` 更重的免責**，並明標 `experimental / uncalibrated`（在 B2 校準完成前）。

### B2 — 回測與校準（離線，非 request-time）
- **共識時序留存**：定期（對齊 recompute/poll 節奏）將 `listConsensus` 結果快照寫入新表（如 `consensus_snapshots`，記 coin、bias、strength、conviction 指標、`capturedAt`）。
- **價格對照**：接 Hyperliquid 價格序列（candle / oracle px）作為「之後價格」基準。
- **離線評估 job**：對每個歷史共識點，計算其後 N 個時間窗的前向報酬 / 命中率 / 與方向的相關性等指標，輸出規則門檻的預測力評估；**不在任何 HTTP request 路徑內**。
- **校準回饋**：評估結果產出建議門檻值，回填 B1 訊號規則的可注入參數；在校準完成前，`/signals` 維持 experimental 標記。
- **UL-MAP 同步**：`entrySignal`、`setupQuality`、`entryVerdict`（enum）、`consensusSnapshot`、`forwardReturn`、`signalHitRate` 等詞條。

## Out of Scope

- 自動下單 / 代操 / 私鑰 / 資金託管（永久 out of scope，全專案立場）。
- 倉位大小建議。
- 即時串流推送。
- 改動 `riskScore` 公式與既有 `/consensus`（feature A）/ `/rankings` / `/traders` 行為。
- 以 P&L 報酬高低排序或評分（違反「不獎勵報酬」立場）。

## Open Decisions

供 PRD 作者解決：

- **`/signals` 是否在 B2 校準前先上線**：建議「上線但強制 `experimental` 旗標 + 重免責 + 預設保守門檻」，或「gate 到回測完成才開」。傾向前者（可邊用邊收資料），但需把「未校準」訊號的誤用風險講清楚。
- **回測價格來源與解析度**：Hyperliquid candle 端點 vs oracle px；K 線週期。
- **前向評估視窗 N 與指標定義**：要驗哪些 horizon（如 1h/4h/1d）、用前向報酬均值、命中率、還是資訊係數（IC）。
- **共識時序的留存頻率與保留期限**：對齊 poll(30s)/recompute(5min) 哪一個；資料量與保留窗。
- **`verdict` 與 `setupQuality` 的門檻初值**：校準前的保守預設；`avoid` 與 `no-signal` 的界線。
- **擁擠反指標的方向處理**：極端一致時是「降級為 avoid」還是「反向 lean」（需回測決定，預設只降級不反向）。

## Context / Background

- 動機：純描述的 `/consensus` 無法回答「該不該進場」；使用者希望 Application 在 `listConsensus` 後呼叫一個 service 產出進場訊號。架構上可行（Application 編排兩個 domain service、回傳 DTO），但**包成 service 不等於有預測力**——規則只有經回測驗證才有意義，故 B 必須綁回測。
- 定位風險：這跨過了原專案刻意守住的「風控工具、非建議」界線（最初討論時使用者選了描述性雷達）。因此 B 以獨立 opt-in 端點 + 重免責 + experimental 標記控管，不污染既有描述性輸出。
- 依賴 feature A：`setupQuality` 的穩健度規則使用 A 的 conviction 加權結果。建議 **先完成 A 再做 B**。
- 既有可沿用：domain service 編排於 Application、DTO 回傳邊界、ORM/Decimal/禁 any、新表走 Prisma code-first migration。
- 權威來源：`.sdd/2026-06-20-safe-cohort-consensus/PRD.md`、`architecture.md`、`.sdd/UL-MAP.md`、主 PRD §4 與 §7（風險：能解釋≠能賺錢、負和遊戲、信任為產品化難點）。
