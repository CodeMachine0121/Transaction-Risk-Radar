-- (provider, address) 識別：重建四表並加入 Provider enum（dev 資料可捨棄）

DROP TABLE "trader_metrics";
DROP TABLE "position_activities";
DROP TABLE "position_snapshots";
DROP TABLE "traders";

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('hyperliquid', 'okx');

-- CreateTable
CREATE TABLE "traders" (
    "provider" "Provider" NOT NULL,
    "address" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traders_pkey" PRIMARY KEY ("provider", "address")
);

-- CreateTable
CREATE TABLE "position_activities" (
    "provider" "Provider" NOT NULL,
    "source_reference" TEXT NOT NULL,
    "trader_address" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "signed_size" DECIMAL(38,18) NOT NULL,
    "signed_size_before" DECIMAL(38,18) NOT NULL,
    "realized_profit_and_loss" DECIMAL(38,18) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_activities_pkey" PRIMARY KEY ("provider", "source_reference")
);

-- CreateTable
CREATE TABLE "position_snapshots" (
    "id" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "trader_address" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "mark_price" DECIMAL(38,18) NOT NULL,
    "unrealized_profit_and_loss_percentage" DECIMAL(18,8) NOT NULL,
    "margin" DECIMAL(38,18) NOT NULL,
    "leverage" DECIMAL(18,4) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trader_metrics" (
    "provider" "Provider" NOT NULL,
    "trader_address" TEXT NOT NULL,
    "max_adverse_excursion_percentile_90" DECIMAL(18,8),
    "averaging_down_ratio" DECIMAL(9,8),
    "win_rate" DECIMAL(9,8),
    "realized_profit_and_loss" DECIMAL(38,18),
    "return_downside_deviation" DECIMAL(18,8),
    "average_leverage" DECIMAL(18,4),
    "trap_signal" DECIMAL(9,8),
    "risk_score" DECIMAL(9,4),
    "closed_position_count" INTEGER NOT NULL DEFAULT 0,
    "insufficient_data" BOOLEAN NOT NULL DEFAULT true,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trader_metrics_pkey" PRIMARY KEY ("provider", "trader_address")
);

-- CreateIndex
CREATE INDEX "position_activities_provider_trader_coin_time_idx" ON "position_activities"("provider", "trader_address", "coin", "occurred_at");

-- CreateIndex
CREATE INDEX "position_snapshots_provider_trader_coin_time_idx" ON "position_snapshots"("provider", "trader_address", "coin", "captured_at");

-- AddForeignKey
ALTER TABLE "trader_metrics" ADD CONSTRAINT "trader_metrics_provider_trader_address_fkey" FOREIGN KEY ("provider", "trader_address") REFERENCES "traders"("provider", "address") ON DELETE RESTRICT ON UPDATE CASCADE;
