import { prisma } from "@/lib/prisma";
import { FINANCE_USER_ID, accountSelect, categorySelect } from "./server";
import { buildReport, moneyText, moneyUnits, type ReportData, type ReportFilters } from "./reporting";

// One consistent snapshot for summaries, charts, pay details and reconciliation coverage.
export async function financeReport(filters: ReportFilters) {
  return prisma.$transaction(async db => {
    const accounts = await db.financialAccount.findMany({ where: { userId: FINANCE_USER_ID }, select: accountSelect });
    const categories = await db.financeCategory.findMany({ where: { userId: FINANCE_USER_ID }, select: categorySelect });
    const sources = await db.financialIncomeSource.findMany({ where: { userId: FINANCE_USER_ID }, select: { id: true, name: true, kind: true } });
    const transactions = await db.financialTransaction.findMany({ where: { userId: FINANCE_USER_ID, account: { userId: FINANCE_USER_ID } }, include: { importEntries: { where: { import: { userId: FINANCE_USER_ID, status: "COMPLETED" } }, select: { id: true }, take: 1 } } });
    const receipts = await db.financialReceipt.findMany({ where: { userId: FINANCE_USER_ID } });
    const income = await db.financialIncomeRecord.findMany({ where: { userId: FINANCE_USER_ID }, include: { deductions: { select: { amount: true } } } });
    const matches = await db.financialMatch.findMany({ where: { userId: FINANCE_USER_ID }, select: { kind: true, receiptId: true, incomeRecordId: true, sourceTransactionId: true, transactionId: true, amount: true, status: true } });
    const examples = await db.financialExampleDataset.findUnique({ where: { userId: FINANCE_USER_ID } });
    const manifest = examples?.manifest as { accountIds?: unknown; receiptIds?: unknown; incomeIds?: unknown } | undefined;
    const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0) : [];
    const data: ReportData = {
      accounts, categories, sources,
      transactions: transactions.map(row => ({ id: row.id, accountId: row.accountId, categoryId: row.categoryId, date: row.occurredOn.toISOString().slice(0, 10), amount: row.amount.toFixed(4), excludedAmount: row.excludedAmount.toFixed(4), currency: row.currency, type: row.type, source: row.source, statementBacked: row.source === "IMPORTED" || !!row.importEntries.length, description: row.description, counterparty: row.counterparty })),
      receipts: receipts.map(row => ({ id: row.id, accountId: row.accountId, categoryId: row.categoryId, date: row.purchasedOn.toISOString().slice(0, 10), total: row.total.toFixed(4), currency: row.currency, merchant: row.merchant, transactionId: row.transactionId })),
      income: income.map(row => ({ id: row.id, accountId: row.accountId, categoryId: row.categoryId, sourceId: row.sourceId, date: row.paidOn.toISOString().slice(0, 10), gross: row.grossAmount?.toFixed(4) ?? null, net: row.netAmount.toFixed(4), deductions: moneyText(row.deductions.reduce((sum, line) => sum + moneyUnits(line.amount.toFixed(4)), BigInt(0))), currency: row.currency, transactionId: row.transactionId, description: row.description })),
      matches: matches.map(row => ({ ...row, amount: row.amount.toFixed(4) })),
      examples: { accountIds: ids(manifest?.accountIds), receiptIds: ids(manifest?.receiptIds), incomeIds: ids(manifest?.incomeIds) },
    };
    return buildReport(data, filters);
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
