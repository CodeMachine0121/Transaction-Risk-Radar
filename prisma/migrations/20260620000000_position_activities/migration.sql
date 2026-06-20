-- DropTable (TraderFill → TraderActivity 一般化；dev 資料可捨棄)
DROP TABLE "position_fills";

-- DropEnum (FillSide 不再使用)
DROP TYPE "FillSide";

-- CreateTable
CREATE TABLE "position_activities" (
    "source_reference" TEXT NOT NULL,
    "trader_address" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "signed_size" DECIMAL(38,18) NOT NULL,
    "signed_size_before" DECIMAL(38,18) NOT NULL,
    "realized_profit_and_loss" DECIMAL(38,18) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_activities_pkey" PRIMARY KEY ("source_reference")
);

-- CreateIndex
CREATE INDEX "position_activities_trader_address_coin_occurred_at_idx" ON "position_activities"("trader_address", "coin", "occurred_at");
