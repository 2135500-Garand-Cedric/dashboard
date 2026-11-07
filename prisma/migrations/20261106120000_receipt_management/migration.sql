-- AlterTable
ALTER TABLE "FinancialReceipt" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "requestFingerprint" VARCHAR(64),
ADD COLUMN     "requestKey" UUID,
ADD COLUMN     "subtotal" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "tax" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "tip" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "FinancialReceipt" SET "subtotal" = "total";
ALTER TABLE "FinancialReceipt" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FinancialDocument" ADD COLUMN     "contentHash" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialReceipt_userId_requestKey_key" ON "FinancialReceipt"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocument_userId_contentHash_key" ON "FinancialDocument"("userId", "contentHash");

ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_nonnegative_amounts" CHECK ("subtotal" >= 0 AND "tax" >= 0 AND "tip" >= 0 AND "total" >= 0) NOT VALID;
