-- CreateEnum
CREATE TYPE "FinancialImportStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FinancialImportAction" AS ENUM ('REVIEW', 'CREATE', 'MATCH', 'SKIP');

-- AlterTable
ALTER TABLE "FinancialImport" ADD COLUMN     "byteSize" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "mapping" JSONB,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "parsing" JSONB,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "FinancialImportStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "FinancialImport" SET "completedAt" = "createdAt";
ALTER TABLE "FinancialImport" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "FinancialImport" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "FinancialImportEntry" ADD COLUMN     "action" "FinancialImportAction" NOT NULL DEFAULT 'REVIEW',
ADD COLUMN     "normalized" JSONB,
ADD COLUMN     "rowFingerprint" VARCHAR(64),
ADD COLUMN     "rowNumber" INTEGER,
ADD COLUMN     "sourceIdentifier" TEXT;

-- CreateIndex
CREATE INDEX "FinancialImportEntry_rowFingerprint_idx" ON "FinancialImportEntry"("rowFingerprint");

-- CreateIndex
CREATE INDEX "FinancialImportEntry_sourceIdentifier_idx" ON "FinancialImportEntry"("sourceIdentifier");

-- Existing relationship-only entries describe already-linked history.
UPDATE "FinancialImportEntry" SET "action" = CASE WHEN "transactionId" IS NULL THEN 'SKIP'::"FinancialImportAction" ELSE 'MATCH'::"FinancialImportAction" END;
