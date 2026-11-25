BEGIN;
CREATE TABLE "FinancialReimbursementPlan" (
  "expenseId" INTEGER PRIMARY KEY REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "person" VARCHAR(100) NOT NULL,
  "expectedAmount" DECIMAL(19,4) NOT NULL CHECK ("expectedAmount" > 0),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "FinancialReimbursementPlan_userId_idx" ON "FinancialReimbursementPlan"("userId");
CREATE TABLE "FinancialReimbursement" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "expenseId" INTEGER NOT NULL REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentId" INTEGER NOT NULL REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(19,4) NOT NULL CHECK ("amount" > 0),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CHECK ("expenseId" <> "paymentId")
);
CREATE UNIQUE INDEX "FinancialReimbursement_expenseId_paymentId_key" ON "FinancialReimbursement"("expenseId", "paymentId");
CREATE INDEX "FinancialReimbursement_userId_paymentId_idx" ON "FinancialReimbursement"("userId", "paymentId");
COMMIT;
