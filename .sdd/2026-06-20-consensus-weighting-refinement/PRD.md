# Product Requirements Document (PRD) — Consensus Weighting Refinement

**Feature:** 共識加權強化（feature A）
**Status:** Draft
**Version:** v1.0
**Owner:** James (james.hsueh@cafler.com)
**Stakeholders:** Engineering（solo）
**Brief:** `.sdd/2026-06-20-consensus-weighting-refinement/BRIEF.md`

> 命名慣例：所有程式識別字一律全名、禁止縮寫（見 `.sdd/UL-MAP.md`）。

---

## 1. Background & Goal (Why & Goal)

- **Problem Statement:** 實測 `GET /consensus` 發現共識被 2 位各持 178 個 coin 的巨鯨主導——「每人一票（僅 inverse-riskScore）」讓這種**指數型/做市型大書**對每個 coin 都投同等票，數值（如 strength≈0.36）本質只是「兩鯨同向、第三人唱反調」，鑑別度低、也看不出誰是**重押**。
- **Expected Outcome:** 將投票權重升級為**同時反映安全度與 conviction**：每票權重 = `inverse-riskScore × 該倉位佔該交易員總部位的比例`。持極多 coin 的巨鯨在單一 coin 佔比極小 → 自動降權；重押少數 coin 者 → 票重。輸出向後相容（保留既有欄位、並列新增 conviction 視角）。**成功標準：同一份資料下，conviction 加權的方向共識能明顯與「巨鯨平均」拉開，且 `weighting=equal` 可完全回退既有行為。維持描述性，不跨建議。**
- **Out of Scope:**
  - 進場訊號 / verdict / `GET /signals`、回測與門檻校準（feature B）。
  - 精準 openedAt-based 持倉時間（feature B；A 僅提供窗內觀測的粗略代理）。
  - 改動 `riskScore` 公式、`/rankings`、`/traders`、account-level fallback。
  - 納入 account-tier 交易員（續排除）。

---

## 2. User Personas

- **Primary Role:** 散戶（查 `/consensus` 時希望共識不被分散巨鯨稀釋、能看出重押方向）；系統（查詢時即時聚合）。
- **Usage Context:** REST 查詢；即時聚合自背景輪詢預存的最新快照。

---

## 3. User Stories & Acceptance Criteria

| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| **US-01** | **As a** 散戶, **I want** 共識以 conviction 加權, **so that** 分散的巨鯨書不會稀釋掉重押者的方向訊號。 | 1. 每票權重 = `clamp(1−riskScore/100,0,1) × positionConvictionShare`<br>2. `positionConvictionShare = positionNotional / 該交易員當前所有持倉 positionNotional 總和`<br>3. `positionNotional = \|signedSize\| × markPrice`（取自 snapshot）<br>4. 每 coin 回傳 `convictionWeightedDirectionBias`（−1…+1）<br>5. 巨鯨（持多 coin）對單一 coin 的影響顯著小於重押者 | P0 |
| **US-02** | **As a** 使用者, **I want** 切換加權法並可回退, **so that** 我能對照新舊、且不破壞既有行為。 | 1. `?weighting=equal\|conviction`，預設 `conviction`<br>2. `equal` 完全回退既有行為（每人一票、僅 inverse-riskScore）<br>3. `consensusStrength` 與排序依**選定**加權法的 bias 計算<br>4. 非法值回 400 | P0 |
| **US-03** | **As a** 散戶, **I want** 同時看見分散度與兩種加權視角, **so that** 我能判斷共識是否被巨鯨主導。 | 1. 保留既有 `netDirectionBias`（inverse-riskScore 加權）、`longShareOfParticipants`（純人頭）、`averageLeverage`，語意不變<br>2. 並列新增 `convictionWeightedDirectionBias`、`averageConvictionShare`、`maxConvictionShare`<br>3. 三組視角同時可見（人頭 / risk 加權 / conviction 加權） | P1 |
| **US-04** | **As a** 散戶, **I want** 看到參與者是否近期才開倉, **so that** 對「剛站進去」的持倉有概念。 | 1. `CurrentOpenPosition` 帶 `firstObservedAt`（新鮮度窗內該 (trader,coin) 最早 `capturedAt`，零額外查詢）<br>2. 每 coin surface `newPositionCount`（`firstObservedAt` 落在最近一個輪詢間隔內的人數）<br>3. **僅 surface，不據此改權重或 gate**<br>4. 明示為窗內觀測的**粗略代理**（精準 openedAt 屬 feature B） | P2 |

---

## 4. Business Flow & Logic

### Flow（查詢時即時聚合，延伸既有 `SafeCohortConsensusService`）

```
cohort = findRankableTraders(provider) filter riskScore ≤ maxRiskScore        # 既有
positions = findCurrentOpenPositions(provider, addresses, freshAfter)          # 既有 + 帶 notional/firstObservedAt
# 新增：per trader 聚總 notional
traderTotalNotional[t] = Σ positions[t].positionNotional
for each position p of trader t on coin c:
    inverseRiskScoreWeight = t.consensusWeight()                               # 既有 entity 方法
    positionConvictionShare = traderTotalNotional[t]=0 ? 0 : p.positionNotional / traderTotalNotional[t]
    convictionWeight = inverseRiskScoreWeight × positionConvictionShare
# 每 coin 同時累加 risk-加權 與 conviction-加權兩組 signedWeight/totalWeight
selectedBias = weighting==='equal' ? netDirectionBias : convictionWeightedDirectionBias
consensusStrength = |selectedBias|；排序依 consensusStrength
```

### Core Business Rules

1. **conviction 權重**：`convictionWeight = clamp(1−riskScore/100,0,1) × positionConvictionShare`；`positionConvictionShare = positionNotional / traderTotalNotional`，`positionNotional = |signedSize| × markPrice`。
2. **兩組 bias 並存**：`netDirectionBias = Σ(side × inverseRiskScoreWeight)/Σ(inverseRiskScoreWeight)`（既有，不變）；`convictionWeightedDirectionBias = Σ(side × convictionWeight)/Σ(convictionWeight)`（新增）。
3. **selected lens**：`weighting`（預設 `conviction`）決定 `consensusStrength = |selectedBias|` 與排序基準；`equal` 用 `netDirectionBias`。
4. **描述欄位**：`averageConvictionShare`（該 coin 參與者 positionConvictionShare 平均）、`maxConvictionShare`（最大單一佔比，越高代表越被單人主導）。
5. **firstObservedAt / newPositionCount**：repository 在既有窗查詢中順便回每 (trader,coin) 的最早 `capturedAt`；`newPositionCount` = 該 coin 中 `now − firstObservedAt ≤ 一個輪詢間隔` 的人數。

### Edge Cases

- **`traderTotalNotional = 0`**（理論上不會，持倉皆非零；防呆）→ 該 trader 所有 `positionConvictionShare = 0`，convictionWeight=0、不貢獻方向。
- **`Σ convictionWeight = 0`**（某 coin 所有參與者 conviction 權重皆 0）→ `convictionWeightedDirectionBias = 0`。
- **`weighting=equal`**：完全走既有路徑，conviction 欄位仍照常並列輸出（描述用）。
- **markPrice 缺漏/為 0**（舊資料）：notional=0 → 該倉 conviction 權重 0；但新鮮度窗只採新快照，舊資料自然排除。
- **參數非法**（`weighting` 非 equal/conviction）→ 400。

---

## 5. UI/UX Design & Interaction

- **N/A** — REST JSON。`CoinConsensusDto` 新增 `convictionWeightedDirectionBias`、`averageConvictionShare`、`maxConvictionShare`、`newPositionCount`（皆向後相容新增欄位）；`CurrentOpenPosition` 新增 `positionNotional`、`firstObservedAt`。新增 querystring `weighting`。

---

## 6. Non-Functional Requirements

- **可測試性（強制）**：
  - conviction 聚合（per-trader 總 notional → 每倉佔比 → 加權方向）以 application 測試（注入真實 `SafeCohortConsensusService` + 真實 `Trader`，mock `ITraderRepository`/`IPositionRepository`）；以合成 `CurrentOpenPosition`（含 notional）驗證巨鯨降權、`equal` 回退、兩組 bias 並存。
  - `consensusWeight()` 既有 entity 單測不變。
- **效能**：仍即時聚合、無額外 DB 查詢（notional 由既有快照欄位導出、firstObservedAt 由既有窗查詢順帶）；對齊 ≤1s。
- **型別**：Decimal（含 notional/share/bias）；禁 any/unknown；DTO/Query 用 `type`，跨 entity 聚合續放 `SafeCohortConsensusService`。

---

## 7. Dependencies & Risks

- **External:** 無新增外部依賴（沿用既有 `position_snapshots`）。
- **Known Risks:**
  - **conviction share 對 notional 精度敏感**：`markPrice` 由 poll 當下推得，跨 coin 比較須同基準（皆 USD 計價，Hyperliquid 一致）。
  - **firstObservedAt 為窗內粗略代理**：新鮮度窗短（2×POLL≈60s），`positionAge` 上限受窗限制，僅作弱描述；精準時間屬 feature B，避免在 A 誤用為訊號。
  - **單人主導**：`maxConvictionShare` 高時，conviction 加權可能變成「單一重押者說了算」——這是描述事實，B 的訊號層需再設過濾（本 feature 僅 surface）。

---

## 8. Appendix — Open Decisions（v1 決議）

1. **conviction share 公式** → `positionNotional / traderTotalNotional` **直接當乘數**，v1 不加凹函式（sqrt 等）緩和；不設單票上下限。極端集中由 `maxConvictionShare` 揭露，校準留後續。
2. **notional 來源** → `|signedSize| × markPrice`（snapshot 既有欄位）。
3. **positionAge 來源** → v1 採「新鮮度窗內該 (trader,coin) 最早 `capturedAt`」近似（`firstObservedAt`，零額外查詢）；carried 不特別處理；精準 openedAt-based 移至 feature B。
4. **輸出形狀** → 既有欄位語意不動，conviction 欄位**並列新增**（向後相容）；`weighting` 只切換 `consensusStrength`/排序的 lens。
5. **`weighting` 預設** → `conviction`；`equal` 回退既有行為。
6. **分散度指標** → v1 以 `averageConvictionShare` + `maxConvictionShare` 表達；Herfindahl/每人持有 coin 數列為後續。
7. 相關文件：`.sdd/2026-06-20-safe-cohort-consensus/`（被強化對象）、`.sdd/2026-06-20-entry-signal-backtest/`（後續 B，使用本 feature 的 conviction 結果）；UL-MAP 已加相關詞條。
