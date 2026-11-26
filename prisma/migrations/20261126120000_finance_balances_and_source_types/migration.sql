ALTER TABLE "FinancialAccount" ADD COLUMN "balanceRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "FinancialAccountBalance" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "accountId" INTEGER NOT NULL REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT,
  "date" DATE NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "ledgerAmount" DECIMAL(19,4) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialAccountBalance_amount_check" CHECK (abs("amount") <= 999999999999999.9999)
);
CREATE UNIQUE INDEX "FinancialAccountBalance_accountId_date_key" ON "FinancialAccountBalance"("accountId", "date");
CREATE INDEX "FinancialAccountBalance_userId_accountId_date_idx" ON "FinancialAccountBalance"("userId", "accountId", "date");
CREATE TABLE "FinancialIncomeSourceType" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "name" VARCHAR(100) NOT NULL,
  "normalizedName" VARCHAR(100) NOT NULL,
  "legacyKind" "FinancialIncomeKind",
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "FinancialIncomeSourceType_userId_normalizedName_key" ON "FinancialIncomeSourceType"("userId", "normalizedName");
CREATE UNIQUE INDEX "FinancialIncomeSourceType_userId_legacyKind_key" ON "FinancialIncomeSourceType"("userId", "legacyKind");
INSERT INTO "FinancialIncomeSourceType" ("userId","name","normalizedName","legacyKind")
SELECT u.id, v.name, lower(v.name), v.kind::"FinancialIncomeKind" FROM "User" u
CROSS JOIN (VALUES ('Employment','EMPLOYMENT'),('Freelance','FREELANCE'),('Interest','INTEREST'),('Gift','GIFT'),('Reimbursement','REIMBURSEMENT'),('Other income','OTHER')) v(name,kind);
ALTER TABLE "FinancialIncomeSource" ADD COLUMN "typeId" INTEGER;
UPDATE "FinancialIncomeSource" s SET "typeId"=t.id FROM "FinancialIncomeSourceType" t
WHERE t."userId"=s."userId" AND t."legacyKind"=s.kind;
ALTER TABLE "FinancialIncomeSource" ADD CONSTRAINT "FinancialIncomeSource_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "FinancialIncomeSourceType"("id") ON DELETE RESTRICT;
CREATE INDEX "FinancialIncomeSource_typeId_idx" ON "FinancialIncomeSource"("typeId");
