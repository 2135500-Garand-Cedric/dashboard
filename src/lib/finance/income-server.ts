import { guardSupportingEdit, syncSupportingMatch, unlinkSupportingMatches } from "./reconciliation-ledger";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { FINANCE_USER_ID, accountSelect, categorySelect, financeHeaders } from "./server";
import { FinanceValidationError, financeId } from "./validation";
import { incomeAmounts, type IncomeInput, type FinanceIncome } from "./income";
import { calendarDate, transactionInput } from "./transactions";
import { saveTransactionInDb, transactionError } from "./transaction-server";
import { storeReceiptFile as storeDocument, removeReceiptFile as removeDocument, type PreparedReceiptFile } from "./receipt-files";

type DB = Prisma.TransactionClient;
export const incomeSourceSelect = { id: true, name: true, kind: true, active: true } as const;
export const deductionTypeSelect = { id: true, name: true, active: true } as const;
const include = {
  source: { select: incomeSourceSelect }, account: { select: accountSelect }, category: { select: categorySelect }, transaction: true,
  matches: { where: { userId: FINANCE_USER_ID, status: "CONFIRMED" as const }, select: { id: true, transactionId: true, amount: true } },
  deductions: { include: { type: { select: deductionTypeSelect } }, orderBy: { id: "asc" as const } },
  documents: { where: { userId: FINANCE_USER_ID, type: "PAY_STUB" as const }, orderBy: { id: "desc" as const } },
} satisfies Prisma.FinancialIncomeRecordInclude;
type Row = Prisma.FinancialIncomeRecordGetPayload<{ include: typeof include }>;
class IncomeConflict extends FinanceValidationError {
  constructor(message: string, public code: string, public existingId?: number) { super(message, 409); }
}
export function incomeError(error: unknown, operation: string) {
  if (error instanceof IncomeConflict) return NextResponse.json({ error: error.message, code: error.code, existingId: error.existingId }, { status: error.status, headers: financeHeaders });
  return transactionError(error, operation);
}
function serialize(row: Row): FinanceIncome {
  const document = row.documents[0], transaction = row.transaction?.userId === FINANCE_USER_ID ? row.transaction : null;
  const grossAmount = row.grossAmount?.toFixed(4) ?? null, netAmount = row.netAmount.toFixed(4);
  const deductions = row.deductions.map(item => ({ typeId: item.typeId, name: item.type.name, active: item.type.active, amount: item.amount.toFixed(4) }));
  return {
    id: row.id, source: row.source, description: row.description, date: row.paidOn.toISOString().slice(0, 10), periodStart: row.periodStart?.toISOString().slice(0, 10) ?? null, periodEnd: row.periodEnd?.toISOString().slice(0, 10) ?? null,
    account: row.account, category: row.category, currency: row.currency, grossAmount, netAmount, deductions, ...incomeAmounts(grossAmount, deductions, netAmount), notes: row.notes, updatedAt: row.updatedAt.toISOString(),
    document: document ? { id: document.id, originalName: document.originalName, mimeType: document.mimeType, byteSize: document.byteSize } : null,
    transaction: transaction ? { id: transaction.id, description: transaction.description, date: transaction.occurredOn.toISOString().slice(0, 10), amount: transaction.amount.toFixed(4), currency: transaction.currency, accountId: transaction.accountId, type: transaction.type } : null,
    allocations: row.matches.map(link => ({ id: link.id, transactionId: link.transactionId, amount: link.amount.toFixed(4) })),
    linkWarning: row.transaction && (!transaction || transaction.type !== "INCOME" || transaction.accountId !== row.accountId || transaction.currency !== row.currency || !transaction.amount.equals(row.netAmount)) ? "The linked deposit differs from this record's account, currency, net amount or type. Income record edits never change the bank transaction; review or unlink the deposit." : null,
  };
}
async function rowById(db: DB, id: number) {
  const row = await db.financialIncomeRecord.findFirst({ where: { id, userId: FINANCE_USER_ID }, include });
  if (!row) throw new FinanceValidationError("Income record not found.", 404);
  return row;
}
export async function getIncome(id: number) { return serialize(await rowById(prisma, id)); }
export async function saveIncome(input: IncomeInput, file: PreparedReceiptFile | null, id?: number) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, expectedUpdatedAt: null, acknowledgeMismatch: false, fileHash: file?.contentHash ?? null })).digest("hex");
  let storageKey: string | null = null, adopted = false;
  try {
    if (file) storageKey = await storeDocument(file);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(async db => {
          if (id === undefined) {
            const replay = await db.financialIncomeRecord.findUnique({ where: { userId_requestKey: { userId: FINANCE_USER_ID, requestKey: input.requestKey! } }, include });
            if (replay) {
              if (replay.requestFingerprint !== fingerprint) throw new IncomeConflict("This form already saved a different income record. Review it or start a new record.", "INCOME_REQUEST_USED", replay.id);
              return { record: serialize(replay), replayed: true, adopted: false, oldKeys: [] as string[] };
            }
          }
          const current = id === undefined ? null : await rowById(db, id);
          await guardSupportingEdit(db, "INCOME", current, input);
          if (current && current.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt!)) throw new FinanceValidationError("This income record changed. Reload before saving.", 409);
          const source = await db.financialIncomeSource.findFirst({ where: { id: input.sourceId, userId: FINANCE_USER_ID } });
          if (!source || (!source.active && current?.sourceId !== source.id)) throw new FinanceValidationError("Choose an active income source belonging to you.");
          const category = await db.financeCategory.findFirst({ where: { id: input.categoryId, userId: FINANCE_USER_ID, type: "INCOME" } });
          if (!category || (!category.active && current?.categoryId !== category.id)) throw new FinanceValidationError("Choose an active income category belonging to you.");
          if (input.accountId !== null) {
            const account = await db.financialAccount.findFirst({ where: { id: input.accountId, userId: FINANCE_USER_ID } });
            if (!account || (!account.active && current?.accountId !== account.id)) throw new FinanceValidationError("Choose an active deposit account belonging to you.");
          }
          for (const line of input.deductions) {
            const type = await db.financialDeductionType.findFirst({ where: { id: line.typeId, userId: FINANCE_USER_ID } });
            if (!type || (!type.active && !current?.deductions.some(item => item.typeId === type.id))) throw new FinanceValidationError("Choose active deduction types belonging to you.");
          }
          const amounts = incomeAmounts(input.grossAmount, input.deductions, input.netAmount);
          if (amounts.difference !== null && amounts.difference !== "0.0000" && !input.acknowledgeMismatch) throw new FinanceValidationError("Gross minus deductions does not equal net. Review the amounts or explicitly confirm the difference.");
          if (file) {
            const duplicate = await db.financialDocument.findFirst({ where: { userId: FINANCE_USER_ID, contentHash: file.contentHash, ...(current ? { OR: [{ incomeRecordId: null }, { incomeRecordId: { not: current.id } }] } : {}) }, select: { receiptId: true, incomeRecordId: true } });
            if (duplicate) throw new IncomeConflict("This original file is already stored. Review the existing financial record instead of uploading it again.", duplicate.receiptId ? "DUPLICATE_RECEIPT" : "DUPLICATE_INCOME", duplicate.receiptId ?? duplicate.incomeRecordId ?? undefined);
          }
          let transactionId: number | null = null;
          const paidOn = new Date(`${input.date}T00:00:00Z`), netAmount = new Prisma.Decimal(input.netAmount);
          if (input.transactionAction === "LINK") {
            const transaction = await db.financialTransaction.findFirst({ where: { id: input.transactionId!, userId: FINANCE_USER_ID } });
            if (!transaction || transaction.type !== "INCOME" || transaction.accountId !== input.accountId || transaction.currency !== input.currency || !transaction.amount.equals(netAmount)) throw new FinanceValidationError("Link an income deposit belonging to you with the same account, currency and net amount. Pay and deposit dates may differ.");
            transactionId = transaction.id;
          } else if (input.transactionAction === "CREATE") {
            if (current?.transactionId) throw new IncomeConflict("This record already has a deposit. Keep its link, or unlink and save before creating another.", "EXISTING_DEPOSIT", current.transactionId);
            if (netAmount.isZero()) throw new FinanceValidationError("A zero-net record can stay unmatched but cannot create a zero-value deposit.");
            const duplicate = await db.financialTransaction.findFirst({ where: { userId: FINANCE_USER_ID, type: "INCOME", accountId: input.accountId!, currency: input.currency, occurredOn: paidOn, amount: netAmount }, select: { id: true } });
            if (duplicate) throw new IncomeConflict("A deposit with this account, date, currency and net amount already exists. Link it instead of creating income twice.", "EXISTING_DEPOSIT", duplicate.id);
            transactionId = (await saveTransactionInDb(db, transactionInput({ date: input.date, description: input.description, amount: input.netAmount, currency: input.currency, type: "INCOME", accountId: input.accountId, categoryId: input.categoryId, counterparty: source.name, notes: input.notes, requestKey: randomUUID() }))).transaction.id;
          }
          const data = { sourceId: input.sourceId, description: input.description, paidOn, periodStart: input.periodStart ? new Date(`${input.periodStart}T00:00:00Z`) : null, periodEnd: input.periodEnd ? new Date(`${input.periodEnd}T00:00:00Z`) : null, accountId: input.accountId, categoryId: input.categoryId, currency: input.currency, grossAmount: input.grossAmount, netAmount, notes: input.notes, transactionId };
          const saved = current ? await db.financialIncomeRecord.update({ where: { id: current.id, userId: FINANCE_USER_ID }, data }) : await db.financialIncomeRecord.create({ data: { ...data, userId: FINANCE_USER_ID, requestKey: input.requestKey, requestFingerprint: fingerprint } });
          if (current) await db.financialIncomeDeduction.deleteMany({ where: { incomeRecordId: current.id } });
          if (input.deductions.length) await db.financialIncomeDeduction.createMany({ data: input.deductions.map(line => ({ incomeRecordId: saved.id, ...line })) });
          await syncSupportingMatch(db, "INCOME", saved, current?.transactionId ?? null);
          const oldKeys: string[] = [];
          if (file && storageKey) {
            if (current?.documents.length) {
              oldKeys.push(...current.documents.map(document => document.storageKey));
              await db.financialDocument.deleteMany({ where: { id: { in: current.documents.map(document => document.id) }, userId: FINANCE_USER_ID } });
            }
            await db.financialDocument.create({ data: { userId: FINANCE_USER_ID, incomeRecordId: saved.id, type: "PAY_STUB", storageKey, originalName: file.originalName, mimeType: file.mimeType, byteSize: file.buffer.length, contentHash: file.contentHash } });
          }
          return { record: serialize(await rowById(db, saved.id)), replayed: false, adopted: !!file, oldKeys };
        }, { isolationLevel: "Serializable", timeout: 15000 });
        adopted = result.adopted;
        await Promise.all(result.oldKeys.map(removeDocument));
        return { record: result.record, replayed: result.replayed };
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        if (attempt < 2 && (code === "P2034" || code === "P2002")) continue;
        throw error;
      }
    }
    throw new FinanceValidationError("Could not save income. Please retry.", 503);
  } finally { if (storageKey && !adopted) await removeDocument(storageKey); }
}
export async function deleteIncome(id: number, documentOnly = false, expectedUpdatedAt?: string | null) {
  const keys = await prisma.$transaction(async db => {
    const row = await rowById(db, id);
    if (!expectedUpdatedAt || Date.parse(expectedUpdatedAt) !== row.updatedAt.getTime()) throw new FinanceValidationError("This income record changed. Reload before deleting.", 409);
    await db.financialDocument.deleteMany({ where: { userId: FINANCE_USER_ID, incomeRecordId: id, type: "PAY_STUB" } });
    if (documentOnly) await db.financialIncomeRecord.update({ where: { id, userId: FINANCE_USER_ID }, data: { updatedAt: new Date() } });
    else { await unlinkSupportingMatches(db, "INCOME", id); await db.financialIncomeRecord.delete({ where: { id, userId: FINANCE_USER_ID } }); }
    return row.documents.map(document => document.storageKey);
  }, { isolationLevel: "Serializable" });
  await Promise.all(keys.map(removeDocument));
}
export async function getIncomeDocument(id: number) {
  const document = await prisma.financialDocument.findFirst({ where: { userId: FINANCE_USER_ID, type: "PAY_STUB", incomeRecordId: id, incomeRecord: { userId: FINANCE_USER_ID } }, orderBy: { id: "desc" } });
  if (!document) throw new FinanceValidationError("Pay stub not found.", 404);
  return document;
}
export async function listIncome(params: URLSearchParams) {
  const where: Prisma.FinancialIncomeRecordWhereInput = { userId: FINANCE_USER_ID };
  const search = params.get("search")?.trim();
  if (search) {
    if (search.length > 200) throw new FinanceValidationError("Search must not exceed 200 characters.");
    where.OR = [{ description: { contains: search, mode: "insensitive" } }, { notes: { contains: search, mode: "insensitive" } }, { source: { name: { contains: search, mode: "insensitive" } } }];
  }
  if (params.get("status") === "unmatched") where.AND = [{ transactionId: null }, { matches: { none: { status: "CONFIRMED" } } }];
  else if (params.get("status") === "linked") where.AND = [{ OR: [{ transactionId: { not: null } }, { matches: { some: { status: "CONFIRMED" } } }] }];
  else if (params.get("status")) throw new FinanceValidationError("Invalid deposit status filter.");
  for (const [param, field] of [["account", "accountId"], ["source", "sourceId"]] as const) if (params.get(param)) where[field] = financeId(params.get(param)!);
  const from = params.get("from"), to = params.get("to");
  if (from || to) where.paidOn = { ...(from ? { gte: new Date(`${calendarDate(from)}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${calendarDate(to)}T00:00:00Z`) } : {}) };
  if (from && to && from > to) throw new FinanceValidationError("From date must not be after To date.");
  const pageText = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(pageText)) throw new FinanceValidationError("Invalid page number.");
  const page = Number(pageText), pageSize = 20;
  return prisma.$transaction(async db => {
    const total = await db.financialIncomeRecord.count({ where });
    const rows = await db.financialIncomeRecord.findMany({ where, include, orderBy: [{ paidOn: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
    return { records: rows.map(serialize), total, page, pageSize };
  }, { isolationLevel: "RepeatableRead" });
}
