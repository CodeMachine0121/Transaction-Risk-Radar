-- 帳戶級風險 fallback：trader_metrics 加 risk_score_tier；新增 trader_account_stats

-- AlterTable
ALTER TABLE "trader_metrics" ADD COLUMN "risk_score_tier" TEXT NOT NULL DEFAULT 'position';

-- CreateTable
CREATE TABLE "trader_account_stats" (
    "provider" "Provider" NOT NULL,
    "address" TEXT NOT NULL,
    "win_ratio" DECIMAL(9,8) NOT NULL,
    "return_series" TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trader_account_stats_pkey" PRIMARY KEY ("provider", "address")
);
