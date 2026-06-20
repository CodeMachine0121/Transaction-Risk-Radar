-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FillSide" AS ENUM ('buy', 'sell');

-- CreateTable
CREATE TABLE "traders" (
    "address" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traders_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "position_fills" (
    "trade_id" BIGINT NOT NULL,
    "trader_address" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "side" "FillSide" NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "size" DECIMAL(38,18) NOT NULL,
    "start_position" DECIMAL(38,18) NOT NULL,
    "direction" TEXT NOT NULL,
    "closed_profit_and_loss" DECIMAL(38,18) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "position_fills_pkey" PRIMARY KEY ("trade_id")
);

-- CreateTable
CREATE TABLE "position_snapshots" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "trader_metrics_pkey" PRIMARY KEY ("trader_address")
);

-- CreateIndex
CREATE INDEX "position_fills_trader_address_coin_occurred_at_idx" ON "position_fills"("trader_address", "coin", "occurred_at");

-- CreateIndex
CREATE INDEX "position_snapshots_trader_address_coin_captured_at_idx" ON "position_snapshots"("trader_address", "coin", "captured_at");

-- AddForeignKey
ALTER TABLE "trader_metrics" ADD CONSTRAINT "trader_metrics_trader_address_fkey" FOREIGN KEY ("trader_address") REFERENCES "traders"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

