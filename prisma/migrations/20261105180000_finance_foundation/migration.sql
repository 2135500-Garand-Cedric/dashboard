-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('CHEQUING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceCategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FinancialTransactionSource" AS ENUM ('MANUAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "FinancialDocumentType" AS ENUM ('RECEIPT', 'BANK_STATEMENT', 'CREDIT_CARD_STATEMENT', 'PAY_STUB', 'OTHER');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalizedName" VARCHAR(100) NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "maskedIdentifier" VARCHAR(32),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalizedName" VARCHAR(100) NOT NULL,
    "type" "FinanceCategoryType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "occurredOn" DATE NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "type" "FinancialTransactionType" NOT NULL,
    "source" "FinancialTransactionSource" NOT NULL DEFAULT 'MANUAL',
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReceipt" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER,
    "categoryId" INTEGER,
    "transactionId" INTEGER,
    "purchasedOn" DATE NOT NULL,
    "merchant" TEXT,
    "total" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialIncomeRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER,
    "categoryId" INTEGER,
    "transactionId" INTEGER,
    "paidOn" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "grossAmount" DECIMAL(19,4),
    "netAmount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialIncomeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialDocument" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER,
    "transactionId" INTEGER,
    "receiptId" INTEGER,
    "incomeRecordId" INTEGER,
    "importId" INTEGER,
    "type" "FinancialDocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialImport" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialImportEntry" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "rowKey" TEXT NOT NULL,
    "originalData" JSONB NOT NULL,
    "transactionId" INTEGER,

    CONSTRAINT "FinancialImportEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_active_idx" ON "FinancialAccount"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_userId_normalizedName_key" ON "FinancialAccount"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "FinanceCategory_userId_active_idx" ON "FinanceCategory"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_userId_type_normalizedName_key" ON "FinanceCategory"("userId", "type", "normalizedName");

-- CreateIndex
CREATE INDEX "FinancialTransaction_userId_occurredOn_idx" ON "FinancialTransaction"("userId", "occurredOn");

-- CreateIndex
CREATE INDEX "FinancialTransaction_accountId_occurredOn_idx" ON "FinancialTransaction"("accountId", "occurredOn");

-- CreateIndex
CREATE INDEX "FinancialTransaction_categoryId_idx" ON "FinancialTransaction"("categoryId");

-- CreateIndex
CREATE INDEX "FinancialReceipt_userId_purchasedOn_idx" ON "FinancialReceipt"("userId", "purchasedOn");

-- CreateIndex
CREATE INDEX "FinancialReceipt_accountId_idx" ON "FinancialReceipt"("accountId");

-- CreateIndex
CREATE INDEX "FinancialReceipt_categoryId_idx" ON "FinancialReceipt"("categoryId");

-- CreateIndex
CREATE INDEX "FinancialReceipt_transactionId_idx" ON "FinancialReceipt"("transactionId");

-- CreateIndex
CREATE INDEX "FinancialIncomeRecord_userId_paidOn_idx" ON "FinancialIncomeRecord"("userId", "paidOn");

-- CreateIndex
CREATE INDEX "FinancialIncomeRecord_accountId_idx" ON "FinancialIncomeRecord"("accountId");

-- CreateIndex
CREATE INDEX "FinancialIncomeRecord_categoryId_idx" ON "FinancialIncomeRecord"("categoryId");

-- CreateIndex
CREATE INDEX "FinancialIncomeRecord_transactionId_idx" ON "FinancialIncomeRecord"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocument_storageKey_key" ON "FinancialDocument"("storageKey");

-- CreateIndex
CREATE INDEX "FinancialDocument_userId_idx" ON "FinancialDocument"("userId");

-- CreateIndex
CREATE INDEX "FinancialDocument_accountId_idx" ON "FinancialDocument"("accountId");

-- CreateIndex
CREATE INDEX "FinancialDocument_transactionId_idx" ON "FinancialDocument"("transactionId");

-- CreateIndex
CREATE INDEX "FinancialDocument_receiptId_idx" ON "FinancialDocument"("receiptId");

-- CreateIndex
CREATE INDEX "FinancialDocument_incomeRecordId_idx" ON "FinancialDocument"("incomeRecordId");

-- CreateIndex
CREATE INDEX "FinancialDocument_importId_idx" ON "FinancialDocument"("importId");

-- CreateIndex
CREATE INDEX "FinancialImport_userId_idx" ON "FinancialImport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialImport_accountId_fingerprint_key" ON "FinancialImport"("accountId", "fingerprint");

-- CreateIndex
CREATE INDEX "FinancialImportEntry_transactionId_idx" ON "FinancialImportEntry"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialImportEntry_importId_rowKey_key" ON "FinancialImportEntry"("importId", "rowKey");

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "FinancialReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_incomeRecordId_fkey" FOREIGN KEY ("incomeRecordId") REFERENCES "FinancialIncomeRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinancialImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialImport" ADD CONSTRAINT "FinancialImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialImport" ADD CONSTRAINT "FinancialImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialImportEntry" ADD CONSTRAINT "FinancialImportEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinancialImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialImportEntry" ADD CONSTRAINT "FinancialImportEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Currency is explicit on every monetary record; money uses NUMERIC, never FLOAT.
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "FinancialReceipt" ADD CONSTRAINT "FinancialReceipt_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "FinancialIncomeRecord" ADD CONSTRAINT "FinancialIncomeRecord_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_masked_identifier_check" CHECK ("maskedIdentifier" IS NULL OR "maskedIdentifier" ~ '^[*•xX -]*[A-Za-z0-9]{1,4}$');
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_byte_size_check" CHECK ("byteSize" >= 0);

