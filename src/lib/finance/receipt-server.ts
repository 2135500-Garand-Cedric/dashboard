import { guardSupportingEdit, syncSupportingMatch, unlinkSupportingMatches } from "./reconciliation-ledger";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { FINANCE_USER_ID, accountSelect, categorySelect, financeHeaders } from "./server";
import { FinanceValidationError } from "./validation";
import { receiptDifference, type ReceiptInput, type FinanceReceipt } from "./receipts";
import { calendarDate, transactionInput } from "./transactions";
import { saveTransactionInDb, transactionError } from "./transaction-server";
import { storeReceiptFile, removeReceiptFile, type PreparedReceiptFile } from "./receipt-files";

type DB = Prisma.TransactionClient;
const include = { account: { select: accountSelect }, category: { select: categorySelect }, transaction: true, matches: { where: { userId: FINANCE_USER_ID, status: "CONFIRMED" as const }, select: { id: true, transactionId: true, amount: true } }, documents: { where: { userId: FINANCE_USER_ID, type: "RECEIPT" as const }, orderBy: { id: "desc" as const } } } satisfies Prisma.FinancialReceiptInclude;
type Row = Prisma.FinancialReceiptGetPayload<{ include: typeof include }>;
class ReceiptConflict extends FinanceValidationError {
  constructor(message: string, public code: string, public existingId?: number) { super(message, 409); }
}
export function receiptError(error: unknown, operation: string) {
  if (error instanceof ReceiptConflict) return NextResponse.json({ error: error.message, code: error.code, existingId: error.existingId }, { status: error.status, headers: financeHeaders });
  return transactionError(error, operation);
}
function linkProblem(row: Row) {
  const transaction = row.transaction;
  if (!transaction) return null;
  return transaction.userId !== FINANCE_USER_ID || transaction.type !== "EXPENSE" || transaction.accountId !== row.accountId || transaction.currency !== row.currency || !transaction.amount.abs().equals(row.total)
    ? "The linked transaction differs from this receipt's account, currency, total or type. Review the transaction or unlink it; receipt edits never change transaction amounts." : null;
}
function serialize(row: Row): FinanceReceipt {
  const document = row.documents[0], transaction = row.transaction?.userId === FINANCE_USER_ID ? row.transaction : null;
  return {
    id: row.id, merchant: row.merchant, date: row.purchasedOn.toISOString().slice(0, 10), account: row.account, category: row.category,
    subtotal: row.subtotal.toFixed(4), tax: row.tax.toFixed(4), tip: row.tip.toFixed(4), total: row.total.toFixed(4), currency: row.currency, notes: row.notes,
    updatedAt: row.updatedAt.toISOString(), difference: receiptDifference(row.subtotal.toFixed(4), row.tax.toFixed(4), row.tip.toFixed(4), row.total.toFixed(4)),
    document: document ? { id: document.id, originalName: document.originalName, mimeType: document.mimeType, byteSize: document.byteSize } : null,
    transaction: transaction ? { id: transaction.id, description: transaction.description, date: transaction.occurredOn.toISOString().slice(0, 10), amount: transaction.amount.toFixed(4), currency: transaction.currency, accountId: transaction.accountId, type: transaction.type } : null,
    allocations: row.matches.map(link => ({ id: link.id, transactionId: link.transactionId, amount: link.amount.toFixed(4) })),
    linkWarning: linkProblem(row),
  };
}
async function rowById(db: DB, id: number) {
  const row = await db.financialReceipt.findFirst({ where: { id, userId: FINANCE_USER_ID }, include });
  if (!row) throw new FinanceValidationError("Receipt not found.", 404);
  return row;
}
export async function getReceipt(id: number) { return serialize(await rowById(prisma, id)); }

export async function saveReceipt(input: ReceiptInput, file: PreparedReceiptFile | null, id?: number) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, expectedUpdatedAt: null, acknowledgeMismatch: false, fileHash: file?.contentHash ?? null })).digest("hex");
  let storageKey: string | null = null, adopted = false;
  try {
    if (file) storageKey = await storeReceiptFile(file);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(async db => {
          if (id === undefined) {
            const replay = await db.financialReceipt.findUnique({ where: { userId_requestKey: { userId: FINANCE_USER_ID, requestKey: input.requestKey! } }, include });
            if (replay) {
              if (replay.requestFingerprint !== fingerprint) throw new ReceiptConflict("This form already saved a different receipt. Review it or open a new form.", "RECEIPT_REQUEST_USED", replay.id);
              return { receipt: serialize(replay), replayed: true, adopted: false, oldKeys: [] as string[] };
            }
          }
          const current = id === undefined ? null : await rowById(db, id);
          await guardSupportingEdit(db, "RECEIPT", current, input);
          if (current && current.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt!)) throw new FinanceValidationError("This receipt changed since you opened it. Reload before saving.", 409);
          const account = await db.financialAccount.findFirst({ where: { id: input.accountId, userId: FINANCE_USER_ID } });
          const category = await db.financeCategory.findFirst({ where: { id: input.categoryId, userId: FINANCE_USER_ID, type: "EXPENSE" } });
          if (!account || (!account.active && current?.accountId !== account.id)) throw new FinanceValidationError("Choose an active payment account belonging to you.");
          if (!category || (!category.active && current?.categoryId !== category.id)) throw new FinanceValidationError("Choose an active expense category belonging to you.");
          if (receiptDifference(input.subtotal, input.tax, input.tip, input.total) !== "0.0000" && !input.acknowledgeMismatch) throw new FinanceValidationError("Subtotal + tax + tip does not equal total. Review the amounts or confirm that you want to keep this difference.");
          if (file) {
            const duplicate = await db.financialDocument.findFirst({ where: { userId: FINANCE_USER_ID, contentHash: file.contentHash, ...(current ? { OR: [{ receiptId: null }, { receiptId: { not: current.id } }] } : {}) }, select: { receiptId: true, incomeRecordId: true } });
            if (duplicate?.incomeRecordId) throw new ReceiptConflict("This file is already stored as an income document. Choose another file.", "DUPLICATE_DOCUMENT");
            if (duplicate) throw new ReceiptConflict("This original file is already attached to a receipt. Review that receipt instead of uploading it again.", "DUPLICATE_RECEIPT", duplicate.receiptId ?? undefined);
          }
          let transactionId: number | null = null;
          const date = new Date(`${input.date}T00:00:00Z`), total = new Prisma.Decimal(input.total);
          if (input.transactionAction === "LINK") {
            const transaction = await db.financialTransaction.findFirst({ where: { id: input.transactionId!, userId: FINANCE_USER_ID } });
            if (!transaction || transaction.type !== "EXPENSE" || transaction.accountId !== input.accountId || transaction.currency !== input.currency || !transaction.amount.equals(total.negated())) throw new FinanceValidationError("Link an expense belonging to you with the same account, currency and total. Receipt and transaction dates may differ.");
            transactionId = transaction.id;
          } else if (input.transactionAction === "CREATE") {
            if (current?.transactionId) throw new ReceiptConflict("This receipt already has a transaction. Keep the link or unlink and save before creating another expense.", "EXISTING_EXPENSE", current.transactionId);
            if (total.isZero()) throw new FinanceValidationError("A zero-total receipt can stay unmatched but cannot create a zero-value expense.");
            const duplicate = await db.financialTransaction.findFirst({ where: { userId: FINANCE_USER_ID, type: "EXPENSE", accountId: input.accountId, currency: input.currency, occurredOn: date, amount: total.negated() }, select: { id: true } });
            if (duplicate) throw new ReceiptConflict("An expense with this account, date, currency and total already exists. Select and link that expense instead of creating another.", "EXISTING_EXPENSE", duplicate.id);
            transactionId = (await saveTransactionInDb(db, transactionInput({ date: input.date, description: input.merchant, amount: input.total, currency: input.currency, type: "EXPENSE", accountId: input.accountId, categoryId: input.categoryId, counterparty: input.merchant, notes: input.notes, requestKey: randomUUID() }))).transaction.id;
          }
          const data = { accountId: input.accountId, categoryId: input.categoryId, purchasedOn: date, merchant: input.merchant, subtotal: input.subtotal, tax: input.tax, tip: input.tip, total: input.total, currency: input.currency, notes: input.notes, transactionId };
          const saved = current
            ? await db.financialReceipt.update({ where: { id: current.id, userId: FINANCE_USER_ID }, data })
            : await db.financialReceipt.create({ data: { ...data, userId: FINANCE_USER_ID, requestKey: input.requestKey, requestFingerprint: fingerprint } });
          await syncSupportingMatch(db, "RECEIPT", saved, current?.transactionId ?? null);
          const oldKeys: string[] = [];
          if (file && storageKey) {
            if (current?.documents.length) {
              oldKeys.push(...current.documents.map(document => document.storageKey));
              await db.financialDocument.deleteMany({ where: { id: { in: current.documents.map(document => document.id) }, userId: FINANCE_USER_ID } });
            }
            await db.financialDocument.create({ data: { userId: FINANCE_USER_ID, receiptId: saved.id, type: "RECEIPT", storageKey, originalName: file.originalName, mimeType: file.mimeType, byteSize: file.buffer.length, contentHash: file.contentHash } });
          }
          return { receipt: serialize(await rowById(db, saved.id)), replayed: false, adopted: !!file, oldKeys };
        }, { isolationLevel: "Serializable", timeout: 15000 });
        adopted = result.adopted;
        await Promise.all(result.oldKeys.map(removeReceiptFile));
        return { receipt: result.receipt, replayed: result.replayed };
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        if (attempt < 2 && (code === "P2034" || code === "P2002")) continue;
        throw error;
      }
    }
    throw new FinanceValidationError("Could not save the receipt. Please retry.", 503);
  } finally { if (storageKey && !adopted) await removeReceiptFile(storageKey); }
}

export async function deleteReceipt(id: number, documentOnly = false, expectedUpdatedAt?: string | null) {
  const keys = await prisma.$transaction(async db => {
    const row = await rowById(db, id);
    if (!expectedUpdatedAt || Date.parse(expectedUpdatedAt) !== row.updatedAt.getTime()) throw new FinanceValidationError("This receipt changed. Reload before deleting.", 409);
    await db.financialDocument.deleteMany({ where: { userId: FINANCE_USER_ID, receiptId: id, type: "RECEIPT" } });
    if (documentOnly) await db.financialReceipt.update({ where: { id, userId: FINANCE_USER_ID }, data: { updatedAt: new Date() } });
    else { await unlinkSupportingMatches(db, "RECEIPT", id); await db.financialReceipt.delete({ where: { id, userId: FINANCE_USER_ID } }); }
    return row.documents.map(document => document.storageKey);
  }, { isolationLevel: "Serializable" });
  await Promise.all(keys.map(removeReceiptFile));
}
export async function getReceiptDocument(id: number) {
  const document = await prisma.financialDocument.findFirst({ where: { userId: FINANCE_USER_ID, type: "RECEIPT", receiptId: id, receipt: { userId: FINANCE_USER_ID } }, orderBy: { id: "desc" } });
  if (!document) throw new FinanceValidationError("Receipt document not found.", 404);
  return document;
}
export async function listReceipts(params: URLSearchParams, exporting = false) {
  const where: Prisma.FinancialReceiptWhereInput = { userId: FINANCE_USER_ID };
  const search = params.get("search")?.trim();
  if (search) {
    if (search.length > 200) throw new FinanceValidationError("Search must not exceed 200 characters.");
    where.OR = [{ merchant: { contains: search, mode: "insensitive" } }, { notes: { contains: search, mode: "insensitive" } }];
  }
  if (params.get("status") === "unmatched") where.AND = [{ transactionId: null }, { matches: { none: { status: "CONFIRMED" } } }];
  else if (params.get("status") === "linked") where.AND = [{ OR: [{ transactionId: { not: null } }, { matches: { some: { status: "CONFIRMED" } } }] }];
  else if (params.get("status")) throw new FinanceValidationError("Invalid receipt status filter.");
  if (params.get("account")) {
    if (!/^[1-9]\d{0,9}$/.test(params.get("account")!) || Number(params.get("account")) > 2147483647) throw new FinanceValidationError("Invalid account filter.");
    where.accountId = Number(params.get("account"));
  }
  const from = params.get("from"), to = params.get("to");
  if (from || to) where.purchasedOn = { ...(from ? { gte: new Date(`${calendarDate(from)}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${calendarDate(to)}T00:00:00Z`) } : {}) };
  if (from && to && from > to) throw new FinanceValidationError("From date must not be after To date.");
  const pageText = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(pageText)) throw new FinanceValidationError("Invalid page number.");
  const page = exporting ? 1 : Number(pageText), pageSize = exporting ? 5000 : 20;
  return prisma.$transaction(async db => {
    const total = await db.financialReceipt.count({ where });
    if (exporting && total > pageSize) throw new FinanceValidationError("Export is limited to 5,000 records. Narrow the date range or filters.", 413);
    const rows = await db.financialReceipt.findMany({ where, include, orderBy: [{ purchasedOn: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
    return { receipts: rows.map(serialize), total, page, pageSize };
  }, { isolationLevel: "RepeatableRead" });
}
