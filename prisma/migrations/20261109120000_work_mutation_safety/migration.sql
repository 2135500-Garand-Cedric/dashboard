-- Additive technical state only. No original fields, timestamps or User balances change.
ALTER TABLE "Todo"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rewardAppliedXp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rewardAppliedCoins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rewardAccountingBasis" TEXT NOT NULL DEFAULT 'TRACKED';
-- Compatibility baseline for future reversal; NOT evidence of a historical payout.
UPDATE "Todo" SET
  "rewardAppliedXp" = CASE WHEN "status" = 'DONE' THEN "rewardXp" ELSE 0 END,
  "rewardAppliedCoins" = CASE WHEN "status" = 'DONE' THEN "rewardCoins" ELSE 0 END,
  "rewardAccountingBasis" = 'LEGACY_BASELINE';
ALTER TABLE "Event" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Subtask" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "WorkMutationReceipt" (
  "id" UUID NOT NULL,
  "userId" INTEGER NOT NULL,
  "requestKey" UUID NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "operation" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkMutationReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkMutationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkMutationReceipt_userId_requestKey_key" ON "WorkMutationReceipt"("userId", "requestKey");
CREATE INDEX "Todo_userId_createdAt_idx" ON "Todo"("userId", "createdAt");
CREATE INDEX "Todo_dependsOnId_idx" ON "Todo"("dependsOnId");
