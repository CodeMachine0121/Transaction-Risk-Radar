# Application Service 層

用例編排 (use case orchestration)。協調 Domain Service 與 Repository/Proxy 完成一個完整用例，但**不含核心業務規則**（那屬於 Domain）。

- 範例用例：同步 leaderboard、輪詢交易員、重算指標、查詢 Risk Ranking。
- 透過**介面**依賴 Domain Service 與 Repository/Proxy（DIP）。

> 實作將於 `/tdd` 階段接上。
