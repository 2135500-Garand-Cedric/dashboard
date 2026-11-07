-- CreateEnum
CREATE TYPE "FinancialIncomeKind" AS ENUM ('EMPLOYMENT', 'FREELANCE', 'INTEREST', 'GIFT', 'REIMBURSEMENT', 'OTHER');

-- AlterTable
ALTER TABLE "FinancialIncomeRecord" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "periodEnd" DATE,
ADD COLUMN     "periodStart" DATE,
ADD COLUMN     "requestFingerprint" VARCHAR(64),
ADD COLUMN     "requestKey" UUID,
ADD COLUMN     "sourceId" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FinancialIncomeRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FinancialIncomeSource" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "kind" "FinancialIncomeKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FinancialIncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialDeductionType" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FinancialDeductionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialIncomeDeduction" (
    "id" SERIAL NOT NULL,
    "incomeRecordId" INTEGER NOT NULL,
    "typeId" INTEGER NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "FinancialIncomeDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialIncomeSource_userId_normalizedName_key" ON "FinancialIncomeSource"("userId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDeductionType_userId_normalizedName_key" ON "FinancialDeductionType"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "FinancialIncomeDeduction_typeId_idx" ON "FinancialIncomeDeduction"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialIncomeDeduction_incomeRecordId_typeId_key" ON "FinancialIncomeDeduction"("incomeRecordId", "typeId");

-- CreateIndex
CREATE INDEX "FinancialIncomeRecord_sourceId_idx" ON "FinancialIncomeRecord"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialIncomeRecord_userId_requestKey_key" ON "FinancialIncomeRecord"("userId", "requestKey");

-- AddForeignKey
ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FinancialIncomeSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIncomeSource" ADD CONSTRAINT "FinancialIncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDeductionType" ADD CONSTRAINT "FinancialDeductionType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIncomeDeduction" ADD CONSTRAINT "FinancialIncomeDeduction_incomeRecordId_fkey" FOREIGN KEY ("incomeRecordId") REFERENCES "FinancialIncomeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIncomeDeduction" ADD CONSTRAINT "FinancialIncomeDeduction_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "FinancialDeductionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing installations get owner-managed defaults; development seed handles a fresh database.
INSERT INTO "FinancialDeductionType" ("userId", "name", "normalizedName", "active")
SELECT "User"."id", defaults.name, defaults.normalized, true
FROM "User" CROSS JOIN (VALUES
  ('Income tax', 'income tax'), ('QPP/CPP', 'qpp/cpp'), ('EI', 'ei'), ('QPIP', 'qpip'), ('Other deductions', 'other deductions')
) AS defaults(name, normalized)
WHERE "User"."id" = 1
ON CONFLICT ("userId", "normalizedName") DO NOTHING;

ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_nonnegative_amounts"
CHECK ("netAmount" >= 0 AND ("grossAmount" IS NULL OR "grossAmount" >= 0)) NOT VALID;
ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_pay_period"
CHECK (("periodStart" IS NULL AND "periodEnd" IS NULL) OR ("periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL AND "periodStart" <= "periodEnd")) NOT VALID;
ALTER TABLE "FinancialIncomeDeduction" ADD CONSTRAINT "FinancialIncomeDeduction_nonnegative_amount" CHECK ("amount" >= 0);
