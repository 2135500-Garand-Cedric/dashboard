-- AlterEnum
ALTER TYPE "FinancialTransactionType" ADD VALUE 'REFUND';

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "contentFingerprint" VARCHAR(64),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "requestFingerprint" VARCHAR(64),
ADD COLUMN     "requestKey" UUID,
ADD COLUMN     "transferId" UUID;

-- CreateTable
CREATE TABLE "FinancialTransfer" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "FinancialTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialTransfer_userId_idx" ON "FinancialTransfer"("userId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_userId_contentFingerprint_idx" ON "FinancialTransaction"("userId", "contentFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_userId_requestKey_key" ON "FinancialTransaction"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_transferId_accountId_key" ON "FinancialTransaction"("transferId", "accountId");

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "FinancialTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransfer" ADD CONSTRAINT "FinancialTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Apply invariants to new writes without rewriting any pre-existing foundation
-- records. Cast the enum to text so REFUND is safe in this migration transaction.
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_amount_direction_check"
CHECK ("amount" <> 0 AND
  ("type"::text <> 'EXPENSE' OR "amount" < 0) AND
  ("type"::text NOT IN ('INCOME', 'REFUND') OR "amount" > 0)) NOT VALID;
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_transfer_link_check"
CHECK (("type"::text = 'TRANSFER') = ("transferId" IS NOT NULL)) NOT VALID;

