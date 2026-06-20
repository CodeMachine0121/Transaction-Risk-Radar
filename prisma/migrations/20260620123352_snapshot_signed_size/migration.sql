-- AlterTable
ALTER TABLE "position_snapshots" ADD COLUMN     "signed_size" DECIMAL(38,18) NOT NULL DEFAULT 0;

-- RenameIndex
ALTER INDEX "position_activities_provider_trader_coin_time_idx" RENAME TO "position_activities_provider_trader_address_coin_occurred_a_idx";

-- RenameIndex
ALTER INDEX "position_snapshots_provider_trader_coin_time_idx" RENAME TO "position_snapshots_provider_trader_address_coin_captured_at_idx";
