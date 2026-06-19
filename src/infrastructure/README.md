# Infrastructure 層（Repository / Proxy）

對外部世界的存取，實作 Domain / Application 定義的介面（DIP）。

- **Repository**：以 Prisma Client 存取 PostgreSQL。禁手寫 SQL；schema 為 code-first (`prisma/schema.prisma`)。
- **Proxy**：封裝 Hyperliquid 官方 API（leaderboard 同步、持倉/成交輪詢）。
- 邊界轉換：Prisma 的 `Decimal` 在離開本層前轉為 Domain 使用的 decimal 型別。

> 實作將於 `/tdd` 階段接上。
