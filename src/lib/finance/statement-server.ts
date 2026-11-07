import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { FinanceValidationError, financeId } from "./validation";
import { FINANCE_USER_ID, accountSelect, categorySelect } from "./server";
import { calendarDate, decimalAmount, transactionInput } from "./transactions";
import { saveTransactionInDb } from "./transaction-server";
import { writeMatch } from "./reconciliation-ledger";
import { storeReceiptFile, removeReceiptFile, type PreparedReceiptFile } from "./receipt-files";
import { type ParsedStatement, MAX_CSV_ROWS } from "./statement-csv";
import { strictObject, statementId, mappingInput, mappedReview, reviewInput, normalizedText, validCurrency, IMPORT_ACTIONS, type ImportAction, type ImportBatch, type ImportCandidate, type ImportMapping, type ImportReview, type ImportRow } from "./statement-imports";

type DB = Prisma.TransactionClient;
const include = { account: { select: accountSelect }, entries: { orderBy: { id: "asc" as const } }, documents: { where: { userId: FINANCE_USER_ID, type: { in: ["BANK_STATEMENT" as const, "CREDIT_CARD_STATEMENT" as const] } }, orderBy: { id: "desc" as const } } } satisfies Prisma.FinancialImportInclude;
type Batch = Prisma.FinancialImportGetPayload<{ include: typeof include }>;
type Entry = Batch["entries"][number];
const candidateInclude = {
  importEntries: { where: { import: { userId: FINANCE_USER_ID, status: "COMPLETED" as const } }, select: { sourceIdentifier: true } },
  transfer: { include: { transactions: { where: { userId: FINANCE_USER_ID, account: { userId: FINANCE_USER_ID } }, include: { account: { select: accountSelect } } } } },
} satisfies Prisma.FinancialTransactionInclude;
type CandidateRow = Prisma.FinancialTransactionGetPayload<{ include: typeof candidateInclude }>;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const financialKey = (row: ImportReview) => { let amount = row.amount; try { amount = decimalAmount(amount, true); } catch {} return fingerprint([row.date, normalizedText(row.description), amount, row.currency]); };
const sourceFingerprint = (row: ImportReview) => fingerprint([row.date, normalizedText(row.description), row.amount, row.currency, row.reference]);
function original(entry: Entry) {
  const value = entry.originalData as { cells?: unknown; line?: unknown };
  return { cells: Array.isArray(value?.cells) ? value.cells.map(String) : [], line: typeof value?.line === "number" ? value.line : entry.rowNumber ?? 0 };
}
async function findBatch(db: DB, id: number) {
  const batch = await db.financialImport.findFirst({ where: { id, userId: FINANCE_USER_ID, account: { userId: FINANCE_USER_ID } }, include });
  if (!batch) throw new FinanceValidationError("Statement import not found.", 404);
  return batch;
}
async function references(db: DB) {
  const accounts = await db.financialAccount.findMany({ where: { userId: FINANCE_USER_ID }, select: accountSelect });
  const categories = await db.financeCategory.findMany({ where: { userId: FINANCE_USER_ID }, select: categorySelect });
  return { accounts, categories };
}
function checkRevision(batch: Batch, value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value !== batch.revision) throw new FinanceValidationError("This import changed since you opened it. Reload it before saving or importing.", 409);
}
async function candidates(db: DB, batch: Batch, entry: Entry, row: ImportReview): Promise<{ items: ImportCandidate[]; sourceIds: number[] }> {
  let amount: string;
  try { amount = decimalAmount(row.amount, true); } catch { return { items: [], sourceIds: [] }; }
  if (!validCurrency(row.currency)) return { items: [], sourceIds: [] };
  const priorScope = { import: { userId: FINANCE_USER_ID, accountId: batch.accountId, OR: [{ status: "COMPLETED" as const }, { id: batch.id }] }, transactionId: { not: null } };
  // Query references independently: many repeated fingerprints must never hide a used bank ID.
  const byReference = row.reference && row.reference.length <= 200 ? await db.financialImportEntry.findMany({ where: { ...priorScope, sourceIdentifier: row.reference }, include: { transaction: { include: candidateInclude } }, take: 21 }) : [];
  const byFingerprint = entry.rowFingerprint ? await db.financialImportEntry.findMany({ where: { ...priorScope, rowFingerprint: entry.rowFingerprint }, include: { transaction: { include: candidateInclude } }, take: 21 }) : [];
  const prior = [...byFingerprint, ...byReference];
  const conditions: Prisma.FinancialTransactionWhereInput[] = [];
  try { const day = new Date(`${calendarDate(row.date)}T00:00:00Z`); conditions.push({ occurredOn: { gte: new Date(day.getTime() - 7 * 86400000), lte: new Date(day.getTime() + 7 * 86400000) } }); } catch { /* Strong IDs can still identify a row with a date needing correction. */ }
  const nearby = conditions.length ? await db.financialTransaction.findMany({ where: { userId: FINANCE_USER_ID, accountId: batch.accountId, excludedAmount: 0, amount, currency: row.currency, OR: conditions }, include: candidateInclude, orderBy: [{ occurredOn: "desc" }, { id: "desc" }], take: 21 }) : [];
  // An explicitly selected old transaction must remain matchable even when suggestions are capped.
  if (row.matchId && !nearby.some(item => item.id === row.matchId)) {
    const selected = await db.financialTransaction.findFirst({ where: { id: row.matchId, userId: FINANCE_USER_ID, accountId: batch.accountId, excludedAmount: 0, amount, currency: row.currency }, include: candidateInclude });
    if (selected) nearby.push(selected);
  }
  const sourceIds: number[] = [], rows = new Map<number, { row: CandidateRow; confidence: ImportCandidate["confidence"] }>();
  for (const item of prior) {
    const transaction = item.transaction;
    if (!transaction || transaction.userId !== FINANCE_USER_ID || transaction.accountId !== batch.accountId) continue;
    const sameId = !!row.reference && item.sourceIdentifier === row.reference;
    if (sameId) sourceIds.push(transaction.id);
    rows.set(transaction.id, { row: transaction, confidence: sameId ? "SOURCE_ID" : "EXACT" });
  }
  for (const transaction of nearby) {
    if (rows.has(transaction.id)) continue;
    const differentReference = !!row.reference && transaction.importEntries.some(item => item.sourceIdentifier && item.sourceIdentifier !== row.reference);
    const exact = !differentReference && transaction.occurredOn.toISOString().slice(0, 10) === row.date && normalizedText(transaction.description) === normalizedText(row.description) && (!row.type || row.type === transaction.type);
    rows.set(transaction.id, { row: transaction, confidence: exact ? "EXACT" : "POSSIBLE" });
  }
  const ordered = [...rows.values()].sort((a, b) => Number(b.row.id === row.matchId) - Number(a.row.id === row.matchId) || Number(b.confidence === "SOURCE_ID") - Number(a.confidence === "SOURCE_ID"));
  return { sourceIds, items: ordered.slice(0, 40).map(({ row: item, confidence }) => ({ id: item.id, date: item.occurredOn.toISOString().slice(0, 10), description: item.description, amount: item.amount.toFixed(4), currency: item.currency, type: item.type, source: item.source, confidence, otherAccount: item.transfer?.userId === FINANCE_USER_ID ? item.transfer.transactions.find(leg => leg.accountId !== batch.accountId)?.account.name ?? null : null })) };
}
function compatible(row: ImportReview, candidate: ImportCandidate) {
  try { return candidate.amount === decimalAmount(row.amount, true) && candidate.currency === row.currency && (!row.type || row.type === candidate.type); } catch { return false; }
}
async function analyze(db: DB, batch: Batch, entry: Entry, refs: Awaited<ReturnType<typeof references>>, duplicateOf: number | null, defaults = false): Promise<ImportRow> {
  const base = { id: entry.id, rowNumber: entry.rowNumber ?? 0, original: original(entry), action: entry.action as ImportAction, transactionId: entry.transactionId };
  if (!entry.normalized) return { ...base, review: null, errors: ["Map the CSV columns first."], warnings: [], candidates: [], duplicateOf };
  const row = reviewInput(entry.normalized);
  if (batch.status === "COMPLETED") return { ...base, review: row, errors: [], warnings: [], candidates: [], duplicateOf: null };
  const errors: string[] = [], warnings: string[] = [];
  try { calendarDate(row.date); } catch { errors.push("Correct the date using YYYY-MM-DD."); }
  try { row.amount = decimalAmount(row.amount, true); } catch { errors.push("Correct the signed amount using dot decimals, up to four places; zero values must be skipped."); }
  if (!row.description || row.description.length > 300) errors.push("Description must contain 1 to 300 characters.");
  if (!validCurrency(row.currency) || row.currency !== batch.account.currency) errors.push(`Use the settled amount in this account's currency (${batch.account.currency}).`);
  if (row.counterparty.length > 200 || row.notes.length > 2000 || row.reference.length > 200) errors.push("Counterparty/reference must be at most 200 characters and notes at most 2,000.");
  const found = await candidates(db, batch, entry, row);
  if (found.items.length) warnings.push("Existing transactions may describe this movement. Link the correct one, or explicitly confirm a separate transaction.");
  if (duplicateOf !== null) warnings.push(`This resembles another row in this CSV (row ${duplicateOf}). Skip a duplicate or confirm a separate movement.`);
  const possibleTransfer = /\b(payment|paiement|transfer|virement|interac|etransfer)\b/i.test(row.description);
  if (possibleTransfer && row.type !== "TRANSFER") warnings.push("This may be a transfer or bill payment. Confirm the type before creating a transaction.");
  if (batch.account.type === "CREDIT_CARD" && !row.amount.startsWith("-") && row.type === "INCOME") warnings.push("A card inflow may be a payment or refund rather than income. Confirm its type.");
  let action = base.action;
  if (defaults) {
    const exact = found.items.filter(item => item.confidence !== "POSSIBLE" && compatible(row, item));
    if (duplicateOf !== null) action = "SKIP";
    else if (!errors.length && exact.length === 1) { action = "MATCH"; row.matchId = exact[0].id; row.type = exact[0].type; if (row.type === "TRANSFER" || row.type === "ADJUSTMENT") row.categoryId = null; }
    else action = !errors.length && row.type && !warnings.length ? "CREATE" : "REVIEW";
  }
  if (!row.type) errors.push("Choose a transaction type; amount direction alone does not establish its purpose.");
  if (row.type === "EXPENSE" && !row.amount.startsWith("-")) errors.push("Expenses must reduce the account balance (negative amount).");
  if ((row.type === "INCOME" || row.type === "REFUND") && row.amount.startsWith("-")) errors.push("Income and refunds must increase the account balance (positive amount).");
  if (row.categoryId !== null && !refs.categories.some(item => item.id === row.categoryId)) errors.push("Choose a category belonging to you.");
  if (action === "CREATE") {
    if (row.type && ["INCOME", "EXPENSE", "REFUND"].includes(row.type)) {
      const kind = row.type === "INCOME" ? "INCOME" : "EXPENSE";
      if (!refs.categories.some(item => item.id === row.categoryId && item.active && item.type === kind)) errors.push(`Choose an active ${kind.toLowerCase()} category.`);
    } else if (row.categoryId !== null) errors.push("Transfers and adjustments do not use income/expense categories.");
    if (row.type === "TRANSFER") {
      const other = refs.accounts.find(item => item.id === row.otherAccountId && item.active && item.id !== batch.accountId);
      if (!other) errors.push("Choose a different active owned account for the other side of the transfer.");
      if (other && (other.currency !== row.currency || row.otherAmount)) {
        try { const otherAmount = decimalAmount(row.otherAmount); if (other.currency === row.currency && otherAmount !== row.amount.replace(/^-/, "")) errors.push("A same-currency transfer must move the same amount on both sides. Record fees separately."); }
        catch { errors.push("Enter the positive amount on the other account, in its currency."); }
      }
    } else if (row.otherAccountId !== null || row.otherAmount) errors.push("Only transfers use another account or amount.");
    if (found.sourceIds.length) errors.push("This source identifier was already imported. Match its transaction or skip; do not create another movement with the same identifier.");
    else if ((found.items.length || duplicateOf !== null) && !row.allowDuplicate) errors.push("Resolve the possible duplicate: match, skip, or confirm that this is a separate transaction.");
  }
  if (action === "MATCH") {
    const selected = found.items.find(item => item.id === row.matchId);
    if (!selected || !compatible(row, selected)) errors.push("Select an owned transaction on this account with the same signed amount, currency and type.");
    if (found.sourceIds.length && !found.sourceIds.includes(row.matchId ?? 0)) errors.push("This source identifier already refers to another transaction. Use that transaction or skip the row.");
  }
  if (action === "REVIEW") errors.push("Choose create, link existing, or skip after reviewing this row.");
  return { ...base, action, review: row, errors, warnings, candidates: found.items, duplicateOf };
}
async function serialize(db: DB, batch: Batch, defaults = false): Promise<ImportBatch> {
  const refs = await references(db), rows: ImportRow[] = [], first = new Map<string, number>(), identifiers = new Map<string, number>();
  for (const entry of batch.entries) {
    const review = entry.normalized as unknown as ImportReview | null;
    const key = review ? financialKey(review) : null, duplicateOf = review?.reference ? identifiers.get(review.reference) ?? (key ? first.get(key) ?? null : null) : key ? first.get(key) ?? null : null;
    if (review?.reference && entry.action !== "SKIP" && !identifiers.has(review.reference)) identifiers.set(review.reference, entry.rowNumber ?? 0);
    if (key && entry.action !== "SKIP" && !first.has(key)) first.set(key, entry.rowNumber ?? 0);
    rows.push(await analyze(db, batch, entry, refs, duplicateOf, defaults));
  }
  return { id: batch.id, account: batch.account, status: batch.status, revision: batch.revision, originalName: batch.originalName, byteSize: batch.byteSize, createdAt: batch.createdAt.toISOString(), completedAt: batch.completedAt?.toISOString() ?? null, headers: Array.isArray(batch.headers) ? batch.headers.map(String) : [], parsing: batch.parsing as unknown as ImportBatch["parsing"], mapping: batch.mapping as unknown as ImportMapping | null, rows, documentAvailable: !!batch.documents.length };
}
export async function getStatement(id: number) { return prisma.$transaction(async db => serialize(db, await findBatch(db, id)), { isolationLevel: "RepeatableRead", timeout: 60000 }); }
export async function createStatement(accountId: number, parsed: ParsedStatement, file: PreparedReceiptFile) {
  let key: string | null = null, adopted = false;
  try {
    key = await storeReceiptFile(file);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(async db => {
          const account = await db.financialAccount.findFirst({ where: { id: accountId, userId: FINANCE_USER_ID, active: true } });
          if (!account) throw new FinanceValidationError("Choose an active statement account belonging to you.");
          const existing = await db.financialImport.findFirst({ where: { userId: FINANCE_USER_ID, accountId, fingerprint: file.contentHash }, include });
          if (existing) return { batch: await serialize(db, existing), reused: true };
          const batch = await db.financialImport.create({ data: { userId: FINANCE_USER_ID, accountId, fingerprint: file.contentHash, originalName: file.originalName, byteSize: file.buffer.length, parsing: json(parsed.parsing), headers: json(parsed.headers), entries: { create: parsed.rows.map((row, index) => ({ rowKey: String(index + 1), rowNumber: index + 1, originalData: json(row) })) } } });
          await db.financialDocument.create({ data: { userId: FINANCE_USER_ID, accountId, importId: batch.id, type: account.type === "CREDIT_CARD" ? "CREDIT_CARD_STATEMENT" : "BANK_STATEMENT", storageKey: key!, originalName: file.originalName, mimeType: file.mimeType, byteSize: file.buffer.length } });
          return { batch: await serialize(db, await findBatch(db, batch.id)), reused: false };
        }, { isolationLevel: "Serializable", timeout: 60000 });
        adopted = !result.reused;
        return result;
      } catch (error) { const code = error && typeof error === "object" && "code" in error ? error.code : null; if (attempt < 2 && (code === "P2034" || code === "P2002")) continue; throw error; }
    }
    throw new FinanceValidationError("Could not create the import. Please retry.", 503);
  } finally { if (key && !adopted) await removeReceiptFile(key); }
}
export async function updateStatement(id: number, value: unknown) {
  const body = strictObject(value, ["expectedRevision", "mapping", "rows"]);
  if ((body.mapping === undefined) === (body.rows === undefined)) throw new FinanceValidationError("Save either column mapping or reviewed rows.");
  return prisma.$transaction(async db => {
    let batch = await findBatch(db, id); checkRevision(batch, body.expectedRevision);
    if (batch.status !== "DRAFT") throw new FinanceValidationError("Completed imports are read-only.", 409);
    if (body.mapping !== undefined) {
      const width = Array.isArray(batch.headers) ? batch.headers.length : 0, mapping = mappingInput(body.mapping, width), refs = await references(db);
      for (const [categoryId, kind] of [[mapping.expenseCategoryId, "EXPENSE"], [mapping.incomeCategoryId, "INCOME"]] as const) if (categoryId !== null && !refs.categories.some(item => item.id === categoryId && item.type === kind && item.active)) throw new FinanceValidationError("Choose active default categories belonging to you.");
      for (const entry of batch.entries) {
        const review = mappedReview(original(entry).cells, mapping, batch.account.currency);
        if (mapping.categoryColumn !== null && review.type && ["INCOME", "EXPENSE", "REFUND"].includes(review.type)) {
          const name = normalizedText(original(entry).cells[mapping.categoryColumn] ?? ""), kind = review.type === "INCOME" ? "INCOME" : "EXPENSE";
          review.categoryId = refs.categories.find(item => item.type === kind && item.active && normalizedText(item.name) === name)?.id ?? null;
        }
        await db.financialImportEntry.update({ where: { id: entry.id }, data: { action: "REVIEW", normalized: json(review), rowFingerprint: sourceFingerprint(review), sourceIdentifier: review.reference || null } });
      }
      await db.financialImport.update({ where: { id, userId: FINANCE_USER_ID }, data: { mapping: json(mapping), revision: { increment: 1 } } });
      batch = await findBatch(db, id);
      const preview = await serialize(db, batch, true);
      for (const row of preview.rows) await db.financialImportEntry.update({ where: { id: row.id }, data: { action: row.action, normalized: json(row.review) } });
      return preview;
    }
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > MAX_CSV_ROWS) throw new FinanceValidationError("Provide 1 to 1,000 reviewed rows.");
    const seen = new Set<number>();
    for (const value of body.rows) {
      const item = strictObject(value, ["id", "action", "review"]), rowId = statementId(item.id);
      if (seen.has(rowId) || !batch.entries.some(entry => entry.id === rowId)) throw new FinanceValidationError("A reviewed row is repeated or does not belong to this import.");
      seen.add(rowId);
      if (typeof item.action !== "string" || !Object.hasOwn(IMPORT_ACTIONS, item.action)) throw new FinanceValidationError("Choose a valid import action.");
      const review = reviewInput(item.review);
      await db.financialImportEntry.update({ where: { id: rowId }, data: { action: item.action as ImportAction, normalized: json(review), sourceIdentifier: review.reference || null } });
    }
    await db.financialImport.update({ where: { id, userId: FINANCE_USER_ID }, data: { revision: { increment: 1 } } });
    return serialize(db, await findBatch(db, id));
  }, { isolationLevel: "Serializable", timeout: 60000 });
}
async function createMovement(db: DB, batch: Batch, row: ImportReview) {
  const negative = row.amount.startsWith("-"), absolute = row.amount.replace(/^-/, "");
  const other = row.type === "TRANSFER" ? await db.financialAccount.findFirst({ where: { id: row.otherAccountId!, userId: FINANCE_USER_ID, active: true } }) : null;
  const incomingTransfer = row.type === "TRANSFER" && !negative;
  const result = await saveTransactionInDb(db, transactionInput({ date: row.date, description: row.description, type: row.type, amount: row.type === "ADJUSTMENT" ? row.amount : incomingTransfer ? row.otherAmount || absolute : absolute, currency: incomingTransfer ? other!.currency : row.currency, accountId: incomingTransfer ? other!.id : batch.accountId, categoryId: row.type === "TRANSFER" || row.type === "ADJUSTMENT" ? null : row.categoryId, counterparty: row.counterparty || null, notes: row.notes || null, destinationAccountId: row.type === "TRANSFER" ? incomingTransfer ? batch.accountId : other!.id : null, destinationAmount: row.type === "TRANSFER" ? incomingTransfer ? absolute : row.otherAmount || absolute : null, requestKey: randomUUID(), allowDuplicate: row.allowDuplicate }));
  const ids = [result.transaction.id, ...(result.transaction.transfer ? [result.transaction.transfer.transactionId] : [])];
  await db.financialTransaction.updateMany({ where: { id: { in: ids }, userId: FINANCE_USER_ID }, data: { source: "IMPORTED" } });
  return incomingTransfer ? result.transaction.transfer!.transactionId : result.transaction.id;
}
export async function commitStatement(id: number, value: unknown) {
  const body = strictObject(value, ["expectedRevision"]);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async db => {
        const batch = await findBatch(db, id);
        if (batch.status === "COMPLETED") return { batch: await serialize(db, batch), replayed: true };
        checkRevision(batch, body.expectedRevision);
        if (!batch.account.active) throw new FinanceValidationError("Reactivate this account before importing.", 409);
        if (!batch.mapping) throw new FinanceValidationError("Map and review the CSV before importing.");
        const refs = await references(db), first = new Map<string, number>();
        // Recheck row-by-row inside the same transaction, including earlier rows just created.
        for (const entry of batch.entries) {
          if (entry.action === "SKIP") continue;
          const review = entry.normalized as unknown as ImportReview | null;
          if (!review) throw new FinanceValidationError(`Row ${entry.rowNumber}: map columns before importing.`);
          const key = financialKey(review), duplicateOf = first.get(key) ?? null;
          if (!first.has(key)) first.set(key, entry.rowNumber ?? 0);
          const checked = await analyze(db, batch, entry, refs, duplicateOf);
          if (checked.errors.length) throw new FinanceValidationError(`Row ${entry.rowNumber}: ${checked.errors.join(" ")}`, 409);
          const row = checked.review!;
          const transactionId = checked.action === "MATCH" ? row.matchId! : await createMovement(db, batch, row);
          await db.financialImportEntry.update({ where: { id: entry.id }, data: { transactionId, normalized: json(row), sourceIdentifier: row.reference || null } });
          if (checked.action === "MATCH") await writeMatch(db, { kind: "STATEMENT", sourceId: entry.id, transactionId, amount: row.amount.replace(/^-/, ""), currency: row.currency, status: "CONFIRMED", snapshot: json({ ...row, label: row.description, signedAmount: row.amount, accountId: batch.accountId, origin: "import" }), action: "CONFIRM", note: "Confirmed when importing reviewed statement rows" });
        }
        await db.financialImport.update({ where: { id, userId: FINANCE_USER_ID }, data: { status: "COMPLETED", completedAt: new Date(), revision: { increment: 1 } } });
        return { batch: await serialize(db, await findBatch(db, id)), replayed: false };
      }, { isolationLevel: "Serializable", timeout: 60000 });
    } catch (error) { const code = error && typeof error === "object" && "code" in error ? error.code : null; if (attempt < 2 && (code === "P2034" || code === "P2002")) continue; throw error; }
  }
  throw new FinanceValidationError("The statement could not be imported. Retry this batch.", 503);
}
export async function deleteStatement(id: number, revision: unknown, documentOnly = false) {
  const keys = await prisma.$transaction(async db => {
    const batch = await findBatch(db, id); checkRevision(batch, revision);
    if (!documentOnly && batch.status !== "DRAFT") throw new FinanceValidationError("Completed import history is retained. You can delete its source CSV without changing transactions.", 409);
    await db.financialDocument.deleteMany({ where: { userId: FINANCE_USER_ID, importId: id, type: { in: ["BANK_STATEMENT", "CREDIT_CARD_STATEMENT"] } } });
    if (documentOnly) await db.financialImport.update({ where: { id, userId: FINANCE_USER_ID }, data: { revision: { increment: 1 } } });
    else await db.financialImport.delete({ where: { id, userId: FINANCE_USER_ID } });
    return batch.documents.map(document => document.storageKey);
  }, { isolationLevel: "Serializable" });
  await Promise.all(keys.map(removeReceiptFile));
}
export async function getStatementDocument(id: number) {
  const document = await prisma.financialDocument.findFirst({ where: { importId: id, userId: FINANCE_USER_ID, import: { userId: FINANCE_USER_ID }, type: { in: ["BANK_STATEMENT", "CREDIT_CARD_STATEMENT"] } } });
  if (!document) throw new FinanceValidationError("Original CSV not found.", 404);
  return document;
}
export async function listStatements(params: URLSearchParams) {
  const where: Prisma.FinancialImportWhereInput = { userId: FINANCE_USER_ID, account: { userId: FINANCE_USER_ID } };
  if (params.get("account")) where.accountId = financeId(params.get("account")!);
  if (params.get("status")) { if (!["DRAFT", "COMPLETED"].includes(params.get("status")!)) throw new FinanceValidationError("Invalid import status."); where.status = params.get("status") as "DRAFT" | "COMPLETED"; }
  const page = Number(params.get("page") || "1"); if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new FinanceValidationError("Invalid page number.");
  return prisma.$transaction(async db => {
    const total = await db.financialImport.count({ where });
    const batches = await db.financialImport.findMany({ where, include: { account: { select: accountSelect }, entries: { select: { action: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (page - 1) * 20 });
    return { batches: batches.map(batch => ({ id: batch.id, account: batch.account, status: batch.status, originalName: batch.originalName, createdAt: batch.createdAt.toISOString(), completedAt: batch.completedAt?.toISOString() ?? null, counts: batch.entries.reduce((counts, row) => { counts[row.action]++; return counts; }, { REVIEW: 0, CREATE: 0, MATCH: 0, SKIP: 0 }) })), total, page, pageSize: 20 };
  }, { isolationLevel: "RepeatableRead" });
}
