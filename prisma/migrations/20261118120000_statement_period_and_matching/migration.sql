-- Additive: historical imports and their original files remain intact.
ALTER TABLE "FinancialImport"
  ADD COLUMN "periodStart" DATE,
  ADD COLUMN "periodEnd" DATE,
  ADD COLUMN "matchingOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinancialImport" ADD CONSTRAINT "FinancialImport_period_check"
  CHECK (("periodStart" IS NULL AND "periodEnd" IS NULL)
    OR ("periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL AND "periodStart" <= "periodEnd"));
