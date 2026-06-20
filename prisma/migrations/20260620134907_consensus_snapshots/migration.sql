-- CreateTable
CREATE TABLE "consensus_snapshots" (
    "id" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "net_direction_bias" DECIMAL(20,18) NOT NULL,
    "conviction_weighted_direction_bias" DECIMAL(20,18) NOT NULL,
    "consensus_strength" DECIMAL(20,18) NOT NULL,
    "max_conviction_share" DECIMAL(20,18) NOT NULL,
    "participant_count" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consensus_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consensus_snapshots_coin_captured_at_idx" ON "consensus_snapshots"("coin", "captured_at");
