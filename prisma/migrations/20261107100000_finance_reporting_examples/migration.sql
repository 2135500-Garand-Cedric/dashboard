CREATE TABLE "FinancialExampleDataset" (
  "userId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "manifest" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialExampleDataset_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "FinancialExampleDataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
