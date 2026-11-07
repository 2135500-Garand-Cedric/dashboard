import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { FINANCE_USER_ID } from "./server";
import { FinanceValidationError, financeId } from "./validation";
import { matchKind, matchScore, textSimilarity, type MatchKind, type MatchRecord, type MatchLink, type MatchCommand, type MatchDetail } from "./reconciliation";
import { matchKey, writeMatch } from "./reconciliation-ledger";

type DB = Prisma.TransactionClient;
const confirmed = (status: string) => status === "CONFIRMED";
const money = (value: Prisma.Decimal) => value.toFixed(4);
const sum = (values: Prisma.Decimal[]) => values.reduce((a, b) => a.plus(b), new Prisma.Decimal(0));
const remaining = (total: Prisma.Decimal, used: Prisma.Decimal) => Prisma.Decimal.max(0, total.minus(used));
const json = (value: unknown) => value as Prisma.InputJsonValue;
async function state(db: DB) {
  const transactions = await db.financialTransaction.findMany({ where: { userId: FINANCE_USER_ID, account: { userId: FINANCE_USER_ID } }, include: { account: true, importEntries: { where: { import: { userId: FINANCE_USER_ID, status: "COMPLETED" } }, select: { id: true }, take: 1 } }, orderBy: [{ occurredOn: "desc" }, { id: "desc" }] });
  const receipts = await db.financialReceipt.findMany({ where: { userId: FINANCE_USER_ID }, include: { account: true }, orderBy: [{ purchasedOn: "desc" }, { id: "desc" }] });
  const income = await db.financialIncomeRecord.findMany({ where: { userId: FINANCE_USER_ID }, include: { account: true }, orderBy: [{ paidOn: "desc" }, { id: "desc" }] });
  const entries = await db.financialImportEntry.findMany({ where: { import: { userId: FINANCE_USER_ID, status: "COMPLETED", account: { userId: FINANCE_USER_ID } }, action: "MATCH" }, include: { import: { include: { account: true } } }, orderBy: { id: "desc" } });
  const links = await db.financialMatch.findMany({ where: { userId: FINANCE_USER_ID }, orderBy: { id: "desc" } });
  return { transactions, receipts, income, entries, links };
}
type State = Awaited<ReturnType<typeof state>>;
type Transaction = State["transactions"][number];
type Link = State["links"][number];
function sourceId(link: Link) { return link.receiptId ?? link.incomeRecordId ?? link.sourceTransactionId ?? link.importEntryId; }
function sourceLinks(data: State, kind: MatchKind, id: number) { return data.links.filter(link => link.kind === kind && sourceId(link) === id); }
function allocated(data: State, kind: MatchKind, id: number, target = false, except?: number) {
  return sum(data.links.filter(link => confirmed(link.status) && link.kind === kind && (target ? link.transactionId === id : sourceId(link) === id) && link.id !== except).map(link => link.amount));
}
function targetRecord(data: State, row: Transaction, kind: MatchKind): MatchRecord {
  const amount = row.amount.abs(), used = allocated(data, kind, row.id, true);
  return { id: row.id, kind, label: [row.description, row.counterparty].filter(Boolean).join(" · "), date: row.occurredOn.toISOString().slice(0, 10), amount: money(amount), signedAmount: money(row.amount), currency: row.currency, accountId: row.accountId, account: row.account.name, type: row.type, version: row.updatedAt.toISOString(), allocated: money(used), remaining: money(remaining(amount, used)), href: `/finance/transactions/${row.id}` };
}
function supportCoverage(data: State, row: Transaction, kind: "RECEIPT" | "INCOME", except?: number) {
  const direct = allocated(data, kind, row.id, true, except);
  const inherited = sum(data.links.filter(link => link.kind === "DUPLICATE" && confirmed(link.status) && link.transactionId === row.id).map(link => {
    const manual = data.transactions.find(item => item.id === link.sourceTransactionId);
    return manual && allocated(data, kind, manual.id, true, except).greaterThanOrEqualTo(manual.amount.abs()) ? link.amount : new Prisma.Decimal(0);
  }));
  return direct.plus(inherited);
}
function sourceRecord(data: State, kind: MatchKind, id: number): MatchRecord {
  const used = allocated(data, kind, id), base = { id, kind, allocated: money(used) };
  if (kind === "RECEIPT" || kind === "INCOME") {
    const receipt = kind === "RECEIPT" ? data.receipts.find(item => item.id === id) : null, income = kind === "INCOME" ? data.income.find(item => item.id === id) : null;
    if (!receipt && !income) throw new FinanceValidationError("Supporting record not found.", 404);
    const row = (receipt ?? income)!, total = receipt?.total ?? income!.netAmount;
    return { ...base, label: receipt?.merchant ?? income?.description ?? "Receipt", date: (receipt?.purchasedOn ?? income!.paidOn).toISOString().slice(0, 10), amount: money(total), signedAmount: money(receipt ? total.negated() : total), currency: row.currency, accountId: row.accountId, account: row.account?.name ?? "No account selected", type: receipt ? "EXPENSE" : "INCOME", version: row.updatedAt.toISOString(), remaining: money(remaining(total, used)), href: `/finance/${receipt ? "receipts" : "income"}/${id}` };
  }
  if (kind === "STATEMENT") {
    const entry = data.entries.find(item => item.id === id); if (!entry) throw new FinanceValidationError("Matched statement row not found.", 404);
    const snapshot = sourceLinks(data, kind, id)[0]?.sourceSnapshot as Record<string, unknown> | undefined;
    const review = entry.normalized as Record<string, unknown> | null, original = data.transactions.find(item => item.id === entry.transactionId);
    const amount = new Prisma.Decimal(String(review?.amount ?? snapshot?.signedAmount ?? original?.amount ?? "0"));
    return { ...base, label: String(review?.description ?? snapshot?.label ?? original?.description ?? `Statement row ${entry.rowNumber ?? entry.rowKey}`), date: String(review?.date ?? snapshot?.date ?? original?.occurredOn.toISOString().slice(0, 10) ?? entry.import.createdAt.toISOString().slice(0, 10)), amount: money(amount.abs()), signedAmount: money(amount), currency: entry.import.account.currency, accountId: entry.import.accountId, account: entry.import.account.name, type: String(review?.type ?? snapshot?.type ?? original?.type ?? ""), version: `${entry.import.revision}:${entry.transactionId ?? 0}`, remaining: money(remaining(amount.abs(), used)), href: `/finance/imports/${entry.importId}` };
  }
  const row = data.transactions.find(item => item.id === id); if (!row) throw new FinanceValidationError("Source transaction not found.", 404);
  const canMatch = kind === "REFUND" ? row.type === "REFUND" : row.source === "MANUAL" && !row.importEntries.length && (row.type !== "TRANSFER" || row.amount.isNegative());
  return canMatch ? { ...targetRecord(data, row, kind), ...base, remaining: money(remaining(row.amount.abs(), used)), canMatch } : { ...targetRecord(data, row, kind), canMatch };
}
function linkRecord(data: State, row: Link): MatchLink {
  const snapshot = row.sourceSnapshot as { label?: string }, target = data.transactions.find(item => item.id === row.transactionId);
  return { id: row.id, revision: row.revision, kind: row.kind, sourceId: sourceId(row), transactionId: row.transactionId, amount: money(row.amount), currency: row.currency, status: row.status, note: row.note, sourceLabel: snapshot?.label ?? row.kind, targetLabel: target?.description ?? "Deleted transaction", updatedAt: row.updatedAt.toISOString() };
}
function eligible(data: State, source: MatchRecord, row: Transaction) {
  if (row.currency !== source.currency || row.id === (source.kind === "DUPLICATE" || source.kind === "REFUND" ? source.id : -1) || row.excludedAmount.greaterThanOrEqualTo(row.amount.abs())) return false;
  if (source.kind === "RECEIPT") return row.type === "EXPENSE" && row.amount.isNegative();
  if (source.kind === "INCOME") return row.type === "INCOME" && row.amount.isPositive();
  if (source.kind === "REFUND") return row.type === "EXPENSE" && row.amount.isNegative();
  if (source.kind === "STATEMENT") return row.accountId === source.accountId && row.type === source.type && row.amount.equals(source.signedAmount);
  return row.accountId === source.accountId && row.type === source.type && row.amount.isNegative() === source.signedAmount.startsWith("-") && (row.source === "IMPORTED" || !!row.importEntries.length);
}
function candidates(data: State, source: MatchRecord, search = "", includeRejected = false) {
  const links = sourceLinks(data, source.kind, source.id), query = search.trim().toLowerCase();
  return data.transactions.filter(row => {
    const link = links.find(item => item.transactionId === row.id);
    if (link?.status === "CONFIRMED") return true;
    if (!eligible(data, source, row)) return false;
    if (link?.status === "REJECTED" && !includeRejected) return false;
    if (query) return String(row.id) === query.replace(/^#/, "") || `${row.description} ${row.counterparty ?? ""}`.toLowerCase().includes(query);
    const days = Math.abs(Date.parse(source.date) - row.occurredOn.getTime()) / 86400000;
    return days <= 60 && (row.amount.abs().equals(source.amount) || textSimilarity(source.label, `${row.description} ${row.counterparty ?? ""}`) > 0.15);
  }).map(row => {
    const transaction = targetRecord(data, row, source.kind), existing = links.find(item => item.transactionId === row.id);
    const capacity = source.kind === "STATEMENT" ? row.amount.abs() : source.kind === "RECEIPT" || source.kind === "INCOME" ? remaining(row.amount.abs().minus(row.excludedAmount), supportCoverage(data, row, source.kind, existing?.id)) : new Prisma.Decimal(transaction.remaining).plus(existing?.status === "CONFIRMED" ? existing.amount : 0), sourceCapacity = new Prisma.Decimal(source.remaining).plus(existing?.status === "CONFIRMED" ? existing.amount : 0);
    return { transaction, ...matchScore(source, transaction), amount: money(Prisma.Decimal.min(sourceCapacity, capacity)), warning: source.accountId !== null && row.accountId !== source.accountId ? "Different payment account: explicitly confirm this is a split payment / deposit on another account." : null, link: existing ? linkRecord(data, existing) : null };
  }).sort((a, b) => b.score - a.score || a.transaction.id - b.transaction.id).slice(0, 30);
}
function detail(data: State, kind: MatchKind, id: number, search = "", includeRejected = false): MatchDetail {
  const source = sourceRecord(data, kind, id);
  const own = sourceLinks(data, kind, id), related = kind === "DUPLICATE" || kind === "REFUND" ? data.links.filter(link => link.transactionId === id && confirmed(link.status)) : [];
  const warnings = new Set<string>();
  if (new Prisma.Decimal(source.allocated).greaterThan(source.amount)) warnings.add("Confirmed allocations exceed this record's current total. Correct or unlink the allocations.");
  for (const link of [...own, ...related]) {
    const target = data.transactions.find(row => row.id === link.transactionId);
    if (confirmed(link.status) && target && (link.kind === "RECEIPT" || link.kind === "INCOME") && supportCoverage(data, target, link.kind).greaterThan(target.amount.abs())) warnings.add(`Transaction #${target.id} has overlapping supporting-record links that exceed its original amount. Review duplicate documents or correct allocations; original links have been retained.`);
  }
  return { source, links: own.map(row => linkRecord(data, row)), related: related.map(row => linkRecord(data, row)), candidates: source.canMatch === false ? [] : candidates(data, source, search, includeRejected), warnings: [...warnings] };
}
export async function getReconciliation(kind: MatchKind, id: number, params: URLSearchParams) {
  const search = params.get("search") ?? ""; if (search.length > 200) throw new FinanceValidationError("Search must be at most 200 characters.");
  return prisma.$transaction(async db => detail(await state(db), kind, id, search, params.get("rejected") === "true"), { isolationLevel: "RepeatableRead", timeout: 30000 });
}
async function synchronize(db: DB, data: State, source: MatchRecord) {
  const active = sourceLinks(data, source.kind, source.id).filter(link => confirmed(link.status));
  if (source.kind === "RECEIPT" || source.kind === "INCOME") {
    const transactionId = active.length === 1 && active[0].amount.equals(source.amount) ? active[0].transactionId : null;
    if (source.kind === "RECEIPT") await db.financialReceipt.update({ where: { id: source.id, userId: FINANCE_USER_ID }, data: { transactionId, updatedAt: new Date() } });
    else await db.financialIncomeRecord.update({ where: { id: source.id, userId: FINANCE_USER_ID }, data: { transactionId, updatedAt: new Date() } });
  } else if (source.kind === "STATEMENT") {
    const entry = data.entries.find(item => item.id === source.id)!;
    await db.financialImportEntry.update({ where: { id: entry.id }, data: { transactionId: active[0]?.transactionId ?? null, ...(entry.normalized ? { normalized: json({ ...(entry.normalized as Record<string, unknown>), matchId: active[0]?.transactionId ?? null }) } : {}) } });
    await db.financialImport.update({ where: { id: entry.importId, userId: FINANCE_USER_ID }, data: { revision: { increment: 1 } } });
  } else if (source.kind === "DUPLICATE") {
    const row = data.transactions.find(item => item.id === source.id)!;
    const excludedAmount = sum(active.map(link => link.amount));
    await db.financialTransaction.update({ where: { id: row.id, userId: FINANCE_USER_ID }, data: { excludedAmount, updatedAt: new Date() } });
    if (row.transferId) {
      const peer = data.transactions.find(item => item.transferId === row.transferId && item.id !== row.id)!;
      await db.financialTransaction.update({ where: { id: peer.id, userId: FINANCE_USER_ID }, data: { excludedAmount: excludedAmount.isZero() ? 0 : peer.amount.abs(), updatedAt: new Date() } });
    }
  } else await db.financialTransaction.update({ where: { id: source.id, userId: FINANCE_USER_ID }, data: { updatedAt: new Date() } });
}
export async function decideMatch(command: MatchCommand) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...command, requestKey: null })).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(async db => {
      const replay = await db.financialMatchEvent.findUnique({ where: { userId_requestKey: { userId: FINANCE_USER_ID, requestKey: command.requestKey } } });
      if (replay) { if (replay.requestFingerprint !== fingerprint) throw new FinanceValidationError("This request already saved a different decision. Reload before saving.", 409); return { replayed: true }; }
      const data = await state(db), source = sourceRecord(data, command.kind, command.sourceId), target = data.transactions.find(row => row.id === command.transactionId);
      if (!target) throw new FinanceValidationError("Transaction not found.", 404);
      const current = data.links.find(link => link.pairKey === matchKey(command.kind, source.id, target.id));
      if ((current?.revision ?? 0) !== command.expectedRevision || source.version !== command.sourceVersion || target.updatedAt.toISOString() !== command.targetVersion) throw new FinanceValidationError("These records or allocations changed. Reload before confirming a decision.", 409);
      if (command.action !== "CONFIRM" && (!current || current.status !== "CONFIRMED") && command.action === "UNLINK") throw new FinanceValidationError("This pair is not confirmed.", 409);
      if (command.action === "REJECT" && current?.status === "CONFIRMED") throw new FinanceValidationError("Unlink a confirmed pair before rejecting its suggestion.", 409);
      if (command.kind === "DUPLICATE" && command.action === "CONFIRM") {
        const manual = data.transactions.find(row => row.id === source.id)!;
        if (manual.source !== "MANUAL" || manual.importEntries.length || manual.type === "TRANSFER" && manual.amount.isPositive()) throw new FinanceValidationError("Choose a manual transaction not already confirmed by a statement. Select the outgoing leg for transfers.");
      }
      if (command.action === "CONFIRM" && command.kind === "REFUND" && source.type !== "REFUND") throw new FinanceValidationError("Choose a refund transaction as the source.");
      if (command.action === "CONFIRM") {
        if (!eligible(data, source, target)) throw new FinanceValidationError("The selected transaction has an incompatible account, currency, direction, type or is already fully excluded.");
        if (source.accountId !== null && source.accountId !== target.accountId && !command.acknowledgeAccountDifference) throw new FinanceValidationError("Confirm the different account for this payment, deposit or refund.");
        const amount = new Prisma.Decimal(command.amount), sourceUsed = allocated(data, command.kind, source.id, false, current?.id), targetUsed = command.kind === "RECEIPT" || command.kind === "INCOME" ? supportCoverage(data, target, command.kind, current?.id) : allocated(data, command.kind, target.id, true, current?.id);
        if (amount.plus(sourceUsed).greaterThan(source.amount) || command.kind !== "STATEMENT" && amount.plus(targetUsed).greaterThan(target.amount.abs().minus(command.kind === "RECEIPT" || command.kind === "INCOME" ? target.excludedAmount : 0))) throw new FinanceValidationError("This allocation exceeds the remaining source or transaction amount. Correct or unlink another allocation first.", 409);
        if (command.kind === "STATEMENT" && (!amount.equals(source.amount) || sourceUsed.greaterThan(0))) throw new FinanceValidationError("A statement row must link in full to one transaction.");
        if (command.kind === "DUPLICATE" && source.type === "TRANSFER") {
          const manual = data.transactions.find(row => row.id === source.id)!, fromPeer = data.transactions.find(row => row.transferId === manual.transferId && row.id !== manual.id), toPeer = data.transactions.find(row => row.transferId === target.transferId && row.id !== target.id);
          if (!manual.transferId || !target.transferId || !fromPeer || !toPeer || fromPeer.accountId !== toPeer.accountId || fromPeer.currency !== toPeer.currency || !fromPeer.amount.equals(toPeer.amount) || !amount.equals(source.amount) || !amount.equals(target.amount.abs()) || sourceUsed.greaterThan(0)) throw new FinanceValidationError("Transfer duplicates must match both complete account legs and amounts. Partial transfer matching is not supported.");
        }
      }
      const action = command.action === "CONFIRM" && current?.status === "CONFIRMED" ? "CORRECT" : command.action;
      await writeMatch(db, { kind: command.kind, sourceId: source.id, transactionId: target.id, amount: command.action === "UNLINK" ? money(current!.amount) : command.amount, currency: source.currency, status: command.action === "CONFIRM" ? "CONFIRMED" : command.action === "REJECT" ? "REJECTED" : "UNLINKED", snapshot: json({ ...source, origin: "reconciliation", accountDifferenceAcknowledged: command.acknowledgeAccountDifference, target: { id: target.id, description: target.description, date: target.occurredOn.toISOString().slice(0, 10), amount: money(target.amount), accountId: target.accountId, currency: target.currency } }), action, note: command.note, requestKey: command.requestKey, fingerprint });
      await synchronize(db, await state(db), source);
      await db.financialTransaction.update({ where: { id: target.id, userId: FINANCE_USER_ID }, data: { updatedAt: new Date() } });
      return { replayed: false };
    }, { isolationLevel: "Serializable", timeout: 30000 }); }
    catch (error) { const code = error && typeof error === "object" && "code" in error ? error.code : null; if (attempt < 2 && (code === "P2034" || code === "P2002")) continue; throw error; }
  }
  throw new FinanceValidationError("Could not save the reconciliation decision. Retry this form.", 503);
}
export async function listReconciliation(params: URLSearchParams) {
  const view = params.get("view") ?? "RECEIPT", status = params.get("status") ?? "unmatched", search = params.get("search")?.trim().toLowerCase() ?? "", accountId = params.get("account") ? financeId(params.get("account")!) : null, page = Number(params.get("page") || 1), pageSize = 20;
  if (!["all", "unmatched", "confirmed", "rejected"].includes(status) || search.length > 200 || !Number.isInteger(page) || page < 1 || page > 1000000) throw new FinanceValidationError("Invalid reconciliation filters.");
  if (view === "AUDIT") return prisma.$transaction(async db => {
    const where = { userId: FINANCE_USER_ID };
    const total = await db.financialMatchEvent.count({ where });
    const events = await db.financialMatchEvent.findMany({ where, orderBy: { id: "desc" }, take: pageSize, skip: (page - 1) * pageSize });
    return { events: events.map(event => ({ id: event.id, action: event.action, createdAt: event.createdAt.toISOString(), details: event.details })), records: [], total, page, pageSize };
  }, { isolationLevel: "RepeatableRead" });
  if (view !== "TRANSACTIONS") matchKind(view);
  return prisma.$transaction(async db => {
    const data = await state(db);
    let records: MatchRecord[];
    if (view === "TRANSACTIONS") {
      records = data.transactions.filter(row => ["EXPENSE", "INCOME"].includes(row.type) && row.excludedAmount.lessThan(row.amount.abs())).map(row => {
        const kind = row.type === "INCOME" ? "INCOME" as const : "RECEIPT" as const, record = targetRecord(data, row, kind);
        const used = supportCoverage(data, row, kind);
        return { ...record, allocated: money(used), remaining: money(remaining(row.amount.abs().minus(row.excludedAmount), used)) };
      });
    } else {
      const kind = view as MatchKind;
      const ids = kind === "RECEIPT" ? data.receipts.map(row => row.id) : kind === "INCOME" ? data.income.map(row => row.id) : kind === "STATEMENT" ? data.entries.map(row => row.id) : data.transactions.filter(row => kind === "REFUND" ? row.type === "REFUND" && (status !== "unmatched" || row.excludedAmount.lessThan(row.amount.abs())) : row.source === "MANUAL" && !row.importEntries.length && (row.type !== "TRANSFER" || row.amount.isNegative())).map(row => row.id);
      records = ids.map(id => sourceRecord(data, kind, id));
      if (kind === "DUPLICATE" && status === "unmatched") records = records.filter(row => candidates(data, row).some(item => item.link?.status !== "CONFIRMED"));
    }
    records = records.filter(row => {
      if (accountId && row.accountId !== accountId || search && !`${row.id} ${row.label} ${row.account}`.toLowerCase().includes(search)) return false;
      if (status === "unmatched") return new Prisma.Decimal(row.remaining).greaterThan(0);
      if (status === "confirmed") return new Prisma.Decimal(row.allocated).greaterThan(0);
      if (status === "rejected") return view === "TRANSACTIONS" ? data.links.some(link => link.kind === row.kind && link.transactionId === row.id && link.status === "REJECTED") : sourceLinks(data, row.kind, row.id).some(link => link.status === "REJECTED");
      return true;
    });
    return { records: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize, events: [] };
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}
