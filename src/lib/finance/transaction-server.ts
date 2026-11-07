import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FinanceValidationError } from "./validation";
import { FINANCE_USER_ID, accountSelect, categorySelect, financeError, financeHeaders } from "./server";
import { calendarDate, TRANSACTION_TYPES, type FinanceTransaction, type TransactionInput } from "./transactions";

type DB = Prisma.TransactionClient;
const include = {
  account: { select: accountSelect }, category: { select: categorySelect },
  receipts: { where: { userId: FINANCE_USER_ID }, select: { id: true, merchant: true, purchasedOn: true }, orderBy: [{ purchasedOn: "desc" as const }, { id: "desc" as const }] },
  incomeRecords: { where: { userId: FINANCE_USER_ID }, select: { id: true, description: true, paidOn: true }, orderBy: [{ paidOn: "desc" as const }, { id: "desc" as const }] },
  _count: { select: { importEntries: true } },
  matchSources: { where: { userId: FINANCE_USER_ID, status: "CONFIRMED" as const } },
  matchTargets: { where: { userId: FINANCE_USER_ID, status: "CONFIRMED" as const }, include: { receipt: { select: { id: true, merchant: true, purchasedOn: true } }, incomeRecord: { select: { id: true, description: true, paidOn: true } }, sourceTransaction: { select: { receipts: { where: { userId: FINANCE_USER_ID }, select: { id: true, merchant: true, purchasedOn: true } }, incomeRecords: { where: { userId: FINANCE_USER_ID }, select: { id: true, description: true, paidOn: true } } } } } },
  transfer: { include: { transactions: { where: { userId: FINANCE_USER_ID }, include: { account: { select: accountSelect }, _count: { select: { importEntries: true } } } } } },
} satisfies Prisma.FinancialTransactionInclude;
type Row = Prisma.FinancialTransactionGetPayload<{ include: typeof include }>;

class TransactionConflict extends FinanceValidationError {
  constructor(message: string, public code: string, public existingId: number) { super(message, 409); }
}

export function transactionError(error: unknown, operation: string) {
  if (error instanceof TransactionConflict) return NextResponse.json({ error: error.message, code: error.code, existingId: error.existingId }, { status: 409, headers: financeHeaders });
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "Another request saved this transaction at the same time. Retry this form or check transaction history." }, { status: 409, headers: financeHeaders });
  return financeError(error, operation);
}

function peer(row: Row) {
  if (!row.transfer) return null;
  if (row.transfer.userId !== FINANCE_USER_ID || row.transfer.transactions.length !== 2) throw new FinanceValidationError("This transfer has incomplete account entries and cannot be modified.", 409);
  return row.transfer.transactions.find(item => item.id !== row.id)!;
}

export function serializeTransaction(row: Row): FinanceTransaction {
  const incoming = peer(row);
  return {
    id: row.id, date: row.occurredOn.toISOString().slice(0, 10), description: row.description,
    amount: row.amount.toFixed(4), currency: row.currency, type: row.type,
    account: row.account, category: row.category, counterparty: row.counterparty, notes: row.notes,
    editable: row.source === "MANUAL" && !row._count.importEntries && incoming?.source !== "IMPORTED" && !incoming?._count.importEntries && !row.matchSources.length && !row.matchTargets.some(link => ["DUPLICATE", "REFUND", "STATEMENT"].includes(link.kind)),
    ledgerAmount: row.amount.isNegative() ? row.amount.plus(row.excludedAmount).toFixed(4) : row.amount.minus(row.excludedAmount).toFixed(4), excludedAmount: row.excludedAmount.toFixed(4),
    source: row.source, updatedAt: row.updatedAt.toISOString(),
    receipts: [...new Map([...row.receipts, ...row.matchTargets.flatMap(link => [...(link.receipt ? [link.receipt] : []), ...(link.kind === "DUPLICATE" ? link.sourceTransaction?.receipts ?? [] : [])])].map(receipt => [receipt.id, { id: receipt.id, merchant: receipt.merchant, date: receipt.purchasedOn.toISOString().slice(0, 10) }])).values()],
    incomeRecords: [...new Map([...row.incomeRecords, ...row.matchTargets.flatMap(link => [...(link.incomeRecord ? [link.incomeRecord] : []), ...(link.kind === "DUPLICATE" ? link.sourceTransaction?.incomeRecords ?? [] : [])])].map(record => [record.id, { id: record.id, description: record.description, date: record.paidOn.toISOString().slice(0, 10) }])).values()],
    transfer: incoming ? { id: row.transferId!, transactionId: incoming.id, account: incoming.account, amount: incoming.amount.toFixed(4), ledgerAmount: incoming.amount.minus(incoming.excludedAmount).toFixed(4), currency: incoming.currency } : null,
  };
}

async function rowById(db: DB, id: number) {
  let row = await db.financialTransaction.findFirst({ where: { id, userId: FINANCE_USER_ID }, include });
  if (!row) throw new FinanceValidationError("Transaction not found.", 404);
  if (row.transferId && row.amount.isPositive()) row = await db.financialTransaction.findFirst({ where: { transferId: row.transferId, userId: FINANCE_USER_ID, amount: { lt: 0 } }, include });
  if (!row) throw new FinanceValidationError("The transfer's outgoing entry is missing.", 409);
  return row;
}

export async function getTransaction(id: number) { return serializeTransaction(await rowById(prisma, id)); }

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalized = (value: string | null) => value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA") ?? "";
function requestFingerprint(input: TransactionInput) {
  return hash([input.date, input.description, input.amount, input.currency, input.type, input.accountId, input.categoryId, input.counterparty, input.notes, input.destinationAccountId, input.destinationAmount]);
}

async function references(db: DB, input: TransactionInput, current?: Row) {
  const account = await db.financialAccount.findFirst({ where: { id: input.accountId, userId: FINANCE_USER_ID } });
  if (!account || (!account.active && current?.accountId !== account.id)) throw new FinanceValidationError("Choose an active account belonging to you.");
  if (input.currency !== account.currency) throw new FinanceValidationError("Transaction currency must match the selected account. Enter the settled amount in that account's currency.");
  if (input.categoryId !== null) {
    const category = await db.financeCategory.findFirst({ where: { id: input.categoryId, userId: FINANCE_USER_ID } });
    if (!category || (!category.active && current?.categoryId !== category.id)) throw new FinanceValidationError("Choose an active category belonging to you.");
    if (category.type !== (input.type === "INCOME" ? "INCOME" : "EXPENSE")) throw new FinanceValidationError("Income requires an income category; expenses and refunds require an expense category.");
  }
  if (input.type !== "TRANSFER") return null;
  const destination = await db.financialAccount.findFirst({ where: { id: input.destinationAccountId!, userId: FINANCE_USER_ID } });
  const oldPeer = current ? peer(current) : null;
  if (!destination || (!destination.active && oldPeer?.accountId !== destination.id)) throw new FinanceValidationError("Choose a different active destination account belonging to you.");
  if (destination.currency !== account.currency && input.destinationAmount === null) throw new FinanceValidationError("For a transfer between currencies, enter the amount received in the destination currency.");
  if (destination.currency === account.currency && input.destinationAmount !== null && input.destinationAmount !== input.amount) throw new FinanceValidationError("A same-currency transfer must send and receive the same amount. Record any fee as a separate expense.");
  return { account: destination, amount: new Prisma.Decimal(input.destinationAmount ?? input.amount) };
}

function assertEditable(row: Row) {
  const incoming = peer(row);
  if (row.source !== "MANUAL" || incoming?.source === "IMPORTED" || row._count.importEntries || incoming?._count.importEntries) throw new FinanceValidationError("This entry is imported or linked to an import. It cannot be changed through manual transaction management.", 409);
  if (row.matchSources.length || row.matchTargets.some(link => ["DUPLICATE", "REFUND", "STATEMENT"].includes(link.kind))) throw new FinanceValidationError("Unlink this transaction's confirmed reconciliation decisions before changing it.", 409);
}

export async function saveTransaction(input: TransactionInput, id?: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async db => {
        return saveTransactionInDb(db, input, id);
      }, { isolationLevel: "Serializable", timeout: 15000 });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (attempt < 2 && (code === "P2034" || code === "P2002")) continue;
      throw error;
    }
  }
  throw new FinanceValidationError("The transaction could not be saved. Please retry.", 503);
}

// Shared atomic write used when a receipt explicitly creates its expense.
export async function saveTransactionInDb(db: DB, input: TransactionInput, id?: number) {
  const fingerprint = requestFingerprint(input);
  if (id === undefined) {
    const existing = await db.financialTransaction.findUnique({ where: { userId_requestKey: { userId: FINANCE_USER_ID, requestKey: input.requestKey! } }, include });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw new TransactionConflict("This form already saved a different entry. Open that transaction or start a new entry.", "REQUEST_ALREADY_USED", existing.id);
      return { transaction: serializeTransaction(existing), replayed: true };
    }
  }
  const current = id === undefined ? undefined : await rowById(db, id);
  if (current) {
    assertEditable(current);
    if (current.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt!)) throw new FinanceValidationError("This transaction changed since you opened it. Reload before saving your edits.", 409);
  }
  const destination = await references(db, input, current);
  const contentFingerprint = hash([input.date, normalized(input.description), input.amount, input.currency, input.type, input.accountId, normalized(input.counterparty), input.destinationAccountId, destination?.amount.toFixed(4) ?? null]);
  if (!input.allowDuplicate) {
    const duplicate = await db.financialTransaction.findFirst({ where: { userId: FINANCE_USER_ID, source: "MANUAL", contentFingerprint, ...(current ? { id: { not: current.id } } : {}) }, select: { id: true } });
    if (duplicate) throw new TransactionConflict("A matching manual entry already exists for these accounts, date, type, amount, description, and counterparty. Review it before saving another.", "DUPLICATE_TRANSACTION", duplicate.id);
  }
  const amount = new Prisma.Decimal(input.amount);
  if (current?.matchTargets.length) {
    for (const kind of ["RECEIPT", "INCOME"] as const) {
      const links = current.matchTargets.filter(link => link.kind === kind);
      const used = links.reduce((total, link) => total.plus(link.amount), new Prisma.Decimal(0));
      if (links.length && (input.accountId !== current.accountId || input.currency !== current.currency || input.type !== (kind === "RECEIPT" ? "EXPENSE" : "INCOME") || used.greaterThan(amount.abs()))) throw new FinanceValidationError("These changes conflict with confirmed payment allocations. Correct or unlink them in Reconciliation first.", 409);
    }
  }
  const signedAmount = input.type === "EXPENSE" || input.type === "TRANSFER" ? amount.negated() : amount;
  const data = {
    accountId: input.accountId, categoryId: input.categoryId, occurredOn: new Date(`${input.date}T00:00:00Z`),
    amount: signedAmount, currency: input.currency, type: input.type, description: input.description,
    counterparty: input.counterparty, notes: input.notes, contentFingerprint,
  };
  let transferId = current?.transferId ?? null;
  const oldPeer = current ? peer(current) : null;
  if (destination) {
    if (!transferId) transferId = (await db.financialTransfer.create({ data: { userId: FINANCE_USER_ID } })).id;
    // Temporarily detach the incoming leg to allow swapping account IDs
    // without violating the unique (transferId, accountId) constraint.
    if (oldPeer) await db.financialTransaction.update({ where: { id: oldPeer.id }, data: { transferId: null, type: "ADJUSTMENT" } });
  }
  const root = current
    ? await db.financialTransaction.update({ where: { id: current.id, userId: FINANCE_USER_ID }, data: { ...data, transferId: destination ? transferId : null } })
    : await db.financialTransaction.create({ data: { ...data, userId: FINANCE_USER_ID, source: "MANUAL", transferId, requestKey: input.requestKey, requestFingerprint: fingerprint } });
  if (destination) {
    const incoming = { userId: FINANCE_USER_ID, accountId: destination.account.id, amount: destination.amount, currency: destination.account.currency, type: "TRANSFER" as const, source: "MANUAL" as const, occurredOn: data.occurredOn, categoryId: null, description: input.description, counterparty: input.counterparty, notes: input.notes, transferId };
    if (oldPeer) await db.financialTransaction.update({ where: { id: oldPeer.id }, data: incoming });
    else await db.financialTransaction.create({ data: incoming });
  } else if (current?.transferId) {
    await db.financialTransfer.delete({ where: { id: current.transferId, userId: FINANCE_USER_ID } });
  }
  const saved = await rowById(db, root.id);
  return { transaction: serializeTransaction(saved), replayed: false };
}

export async function deleteTransaction(id: number) {
  await prisma.$transaction(async db => {
    const row = await rowById(db, id);
    assertEditable(row);
    if (row.matchTargets.length || row.matchSources.length) throw new FinanceValidationError("Unlink confirmed reconciliation allocations before deleting this transaction.", 409);
    if (row.transferId) await db.financialTransfer.delete({ where: { id: row.transferId, userId: FINANCE_USER_ID } });
    else await db.financialTransaction.delete({ where: { id: row.id, userId: FINANCE_USER_ID } });
  }, { isolationLevel: "Serializable" });
}

export async function listTransactions(params: URLSearchParams, exporting = false) {
  const conditions: Prisma.FinancialTransactionWhereInput[] = [{ OR: [{ transferId: null }, { amount: { lt: 0 } }] }];
  for (const key of ["account", "category"]) {
    const value = params.get(key);
    if (!value) continue;
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) throw new FinanceValidationError(`Invalid ${key} filter.`);
    if (key === "category") conditions.push({ categoryId: Number(value) });
    else conditions.push({ OR: [{ accountId: Number(value) }, { transfer: { transactions: { some: { accountId: Number(value), userId: FINANCE_USER_ID } } } }] });
  }
  const type = params.get("type"), currency = params.get("currency");
  if (type) {
    if (!Object.hasOwn(TRANSACTION_TYPES, type)) throw new FinanceValidationError("Invalid transaction type filter.");
    conditions.push({ type: type as TransactionInput["type"] });
  }
  if (currency) {
    if (!/^[A-Z]{3}$/.test(currency)) throw new FinanceValidationError("Invalid currency filter.");
    conditions.push({ OR: [{ currency }, { transfer: { transactions: { some: { currency, userId: FINANCE_USER_ID } } } }] });
  }
  const from = params.get("from"), to = params.get("to");
  if (from) conditions.push({ occurredOn: { gte: new Date(`${calendarDate(from, "From date")}T00:00:00Z`) } });
  if (to) conditions.push({ occurredOn: { lte: new Date(`${calendarDate(to, "To date")}T00:00:00Z`) } });
  if (from && to && from > to) throw new FinanceValidationError("From date must not be after To date.");
  const search = params.get("search")?.trim();
  if (search) {
    if (search.length > 200) throw new FinanceValidationError("Search must not exceed 200 characters.");
    conditions.push({ OR: ["description", "counterparty", "notes"].map(field => ({ [field]: { contains: search, mode: "insensitive" } })) });
  }
  const pageText = params.get("page") ?? "1";
  if (!/^[1-9]\d*$/.test(pageText) || Number(pageText) > 1000000) throw new FinanceValidationError("Invalid page number.");
  const page = exporting ? 1 : Number(pageText), pageSize = exporting ? 5000 : 25;
  return prisma.$transaction(async db => {
    const where = { userId: FINANCE_USER_ID, AND: conditions };
    const total = await db.financialTransaction.count({ where });
    if (exporting && total > pageSize) throw new FinanceValidationError("Export is limited to 5,000 records. Narrow the date range or filters.", 413);
    const rows = await db.financialTransaction.findMany({ where, include, orderBy: [{ occurredOn: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
    return { transactions: rows.map(serializeTransaction), total, page, pageSize };
  }, { isolationLevel: "RepeatableRead" });
}
