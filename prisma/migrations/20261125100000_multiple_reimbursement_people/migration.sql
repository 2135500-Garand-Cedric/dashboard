BEGIN;
-- Retain existing plans and allocations, assigning each to its original person.
ALTER TABLE "FinancialReimbursementPlan" ADD COLUMN "id" SERIAL;
ALTER TABLE "FinancialReimbursementPlan" DROP CONSTRAINT "FinancialReimbursementPlan_pkey";
ALTER TABLE "FinancialReimbursementPlan" ADD PRIMARY KEY ("id");
CREATE UNIQUE INDEX "FinancialReimbursementPlan_expenseId_person_key" ON "FinancialReimbursementPlan"("expenseId", "person");
ALTER TABLE "FinancialReimbursement" ADD COLUMN "planId" INTEGER;
UPDATE "FinancialReimbursement" r SET "planId" = p.id
FROM "FinancialReimbursementPlan" p WHERE p."expenseId" = r."expenseId";
ALTER TABLE "FinancialReimbursement" ALTER COLUMN "planId" SET NOT NULL;
ALTER TABLE "FinancialReimbursement" ADD CONSTRAINT "FinancialReimbursement_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "FinancialReimbursementPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "FinancialReimbursement_expenseId_paymentId_key";
CREATE UNIQUE INDEX "FinancialReimbursement_planId_paymentId_key" ON "FinancialReimbursement"("planId", "paymentId");
CREATE INDEX "FinancialReimbursement_expenseId_idx" ON "FinancialReimbursement"("expenseId");
COMMIT;
