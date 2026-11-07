-- CreateEnum
CREATE TYPE "FinancialMatchKind" AS ENUM ('RECEIPT', 'INCOME', 'DUPLICATE', 'REFUND', 'STATEMENT');

-- CreateEnum
CREATE TYPE "FinancialMatchStatus" AS ENUM ('CONFIRMED', 'REJECTED', 'UNLINKED');

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "excludedAmount" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FinancialMatch" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" "FinancialMatchKind" NOT NULL,
    "pairKey" TEXT NOT NULL,
    "receiptId" INTEGER,
    "incomeRecordId" INTEGER,
    "sourceTransactionId" INTEGER,
    "importEntryId" INTEGER,
    "transactionId" INTEGER,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "FinancialMatchStatus" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "sourceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialMatchEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialMatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialMatch_userId_status_kind_idx" ON "FinancialMatch"("userId", "status", "kind");

-- CreateIndex
CREATE INDEX "FinancialMatch_receiptId_status_idx" ON "FinancialMatch"("receiptId", "status");

-- CreateIndex
CREATE INDEX "FinancialMatch_incomeRecordId_status_idx" ON "FinancialMatch"("incomeRecordId", "status");

-- CreateIndex
CREATE INDEX "FinancialMatch_sourceTransactionId_status_idx" ON "FinancialMatch"("sourceTransactionId", "status");

-- CreateIndex
CREATE INDEX "FinancialMatch_transactionId_status_idx" ON "FinancialMatch"("transactionId", "status");

-- CreateIndex
CREATE INDEX "FinancialMatch_importEntryId_status_idx" ON "FinancialMatch"("importEntryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialMatch_userId_pairKey_key" ON "FinancialMatch"("userId", "pairKey");

-- CreateIndex
CREATE INDEX "FinancialMatchEvent_userId_createdAt_idx" ON "FinancialMatchEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialMatchEvent_matchId_idx" ON "FinancialMatchEvent"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialMatchEvent_userId_requestKey_key" ON "FinancialMatchEvent"("userId", "requestKey");

-- AddForeignKey
ALTER TABLE "FinancialMatch" ADD CONSTRAINT "FinancialMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMatch" ADD CONSTRAINT "FinancialMatch_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "FinancialReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMatch" ADD CONSTRAINT "FinancialMatch_incomeRecordId_fkey" FOREIGN KEY ("incomeRecordId") REFERENCES "FinancialIncomeRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMatch" ADD CONSTRAINT "FinancialMatch_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMatch" ADD CONSTRAINT "FinancialMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMatch" ADD CONSTRAINT "FinancialMatch_importEntryId_fkey" FOREIGN KEY ("importEntryId") REFERENCES "FinancialImportEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMatchEvent" ADD CONSTRAINT "FinancialMatchEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMatchEvent" ADD CONSTRAINT "FinancialMatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "FinancialMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing explicit links remain confirmed; preserve them rather than guessing new matches.
INSERT INTO "FinancialMatch" ("userId","kind","pairKey","receiptId","transactionId","amount","currency","status","sourceSnapshot","updatedAt")
SELECT r."userId",'RECEIPT','RECEIPT:'||r.id||':'||r."transactionId",r.id,r."transactionId",r.total,r.currency,'CONFIRMED',jsonb_build_object('origin','direct','label',r.merchant,'date',r."purchasedOn"::text,'accountId',r."accountId",'amount',r.total::text,'currency',r.currency),CURRENT_TIMESTAMP FROM "FinancialReceipt" r WHERE r."transactionId" IS NOT NULL;
INSERT INTO "FinancialMatch" ("userId","kind","pairKey","incomeRecordId","transactionId","amount","currency","status","sourceSnapshot","updatedAt")
SELECT r."userId",'INCOME','INCOME:'||r.id||':'||r."transactionId",r.id,r."transactionId",r."netAmount",r.currency,'CONFIRMED',jsonb_build_object('origin','direct','label',r.description,'date',r."paidOn"::text,'accountId',r."accountId",'amount',r."netAmount"::text,'currency',r.currency),CURRENT_TIMESTAMP FROM "FinancialIncomeRecord" r WHERE r."transactionId" IS NOT NULL;
INSERT INTO "FinancialMatch" ("userId","kind","pairKey","importEntryId","transactionId","amount","currency","status","sourceSnapshot","updatedAt")
SELECT b."userId",'STATEMENT','STATEMENT:'||e.id||':'||e."transactionId",e.id,e."transactionId",abs(t.amount),t.currency,'CONFIRMED',jsonb_build_object('origin','import','label',coalesce(e.normalized->>'description',t.description),'date',coalesce(e.normalized->>'date',t."occurredOn"::text),'accountId',b."accountId",'amount',abs(t.amount)::text,'signedAmount',t.amount::text,'currency',t.currency,'type',t.type),CURRENT_TIMESTAMP FROM "FinancialImportEntry" e JOIN "FinancialImport" b ON b.id=e."importId" JOIN "FinancialTransaction" t ON t.id=e."transactionId" WHERE b.status='COMPLETED' AND e.action='MATCH';
INSERT INTO "FinancialMatchEvent" ("userId","matchId","requestKey","requestFingerprint","action","details")
SELECT "userId",id,gen_random_uuid(),'migration:'||id,'MIGRATED',jsonb_build_object('kind',kind,'sourceId',coalesce("receiptId","incomeRecordId","sourceTransactionId","importEntryId"),'transactionId',"transactionId",'amount',amount::text,'currency',currency,'status',status,'note','Preserved existing explicit link','source',"sourceSnapshot") FROM "FinancialMatch";
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_excludedAmount_bounds" CHECK ("excludedAmount" >= 0 AND "excludedAmount" <= abs(amount));
ALTER TABLE "FinancialMatch" ADD CONSTRAINT "FinancialMatch_nonnegative_amount" CHECK (amount >= 0);
