# Controller 層

HTTP 入口（Fastify route handlers）。**唯一職責**：請求 / 回應的轉換與驗證，將工作委派給 Application Service。

- 只依賴 Application Service 的**介面**，不含業務邏輯。
- 對外端點：`GET /rankings`（Risk Ranking）、`GET /traders/:address`（交易員詳情）。

> 實作將於 `/tdd` 階段接上。
