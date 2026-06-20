# syntax=docker/dockerfile:1

# 主專案打包：API（main.ts）與 worker（worker.ts）共用此 image，由 compose 指定不同 command。
FROM oven/bun:1 AS base
WORKDIR /app
# husky prepare 在容器內無 .git，略過避免 install 失敗。
ENV HUSKY=0

# 依賴層：先帶入 manifest 與 prisma schema（postinstall 會跑 prisma generate）。
FROM base AS dependencies
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# 執行層：帶入已安裝的依賴（含已生成的 Prisma client）與原始碼。
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# 預設啟動 API；worker 由 compose 覆寫 command。
CMD ["bun", "run", "start"]
