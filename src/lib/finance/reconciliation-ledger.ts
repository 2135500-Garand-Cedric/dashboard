import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { FinanceValidationError } from "./validation";
import { FINANCE_USER_ID } from "./server";
import type { MatchKind } from "./reconciliation";

type DB = Prisma.TransactionClient;
export const matchKey = (kind: MatchKind, sourceId: number, transactionId: number) => `${kind}:${sourceId}:${transactionId}`;
export const sourceWhere = (kind: MatchKind, id: number): Prisma.FinancialMatchWhereInput => kind === "RECEIPT" ? { receiptId: id } : kind === "INCOME" ? { incomeRecordId: id } : kind === "STATEMENT" ? { importEntryId: id } : { sourceTransactionId: id };
export async function writeMatch(db: DB, value: { kind: MatchKind; sourceId: number; transactionId: number; amount: string; currency: string; status: "CONFIRMED" | "REJECTED" | "UNLINKED"; snapshot: Prisma.InputJsonValue; action: string; note?: string; requestKey?: string; fingerprint?: string }) {
  const { kind, sourceId, transactionId } = value;
  const pairKey = matchKey(kind, sourceId, transactionId);
  const data = { amount: value.amount, currency: value.currency, status: value.status, note: value.note || null, sourceSnapshot: value.snapshot };
  const match = await db.financialMatch.upsert({ where: { userId_pairKey: { userId: FINANCE_USER_ID, pairKey } }, create: { userId: FINANCE_USER_ID, kind, pairKey, transactionId, ...(kind === "RECEIPT" ? { receiptId: sourceId } : kind === "INCOME" ? { incomeRecordId: sourceId } : kind === "STATEMENT" ? { importEntryId: sourceId } : { sourceTransactionId: sourceId }), ...data }, update: { ...data, revision: { increment: 1 } } });
  await db.financialMatchEvent.create({ data: { userId: FINANCE_USER_ID, matchId: match.id, requestKey: value.requestKey ?? randomUUID(), requestFingerprint: value.fingerprint ?? createHash("sha256").update(JSON.stringify(value)).digest("hex"), action: value.action, details: { kind, sourceId, transactionId, amount: value.amount, currency: value.currency, status: value.status, note: value.note ?? "", source: value.snapshot } } });
  return match;
}
type Supporting = { id: number; transactionId: number | null; accountId: number | null; currency: string; total?: Prisma.Decimal; netAmount?: Prisma.Decimal; };
export async function guardSupportingEdit(db: DB, kind: "RECEIPT" | "INCOME", current: Supporting | null, next: { accountId: number | null; currency: string; total?: string; netAmount?: string; transactionAction: string; transactionId: number | null }) {
  if (!current) return;
  const links = await db.financialMatch.findMany({ where: { userId: FINANCE_USER_ID, kind, ...sourceWhere(kind, current.id), status: "CONFIRMED" } });
  const simple = !links.length || links.length === 1 && links[0].transactionId === current.transactionId;
  if (!simple && (next.transactionAction !== "UNMATCHED" || next.accountId !== current.accountId || next.currency !== current.currency || !(current.total ?? current.netAmount)!.equals(next.total ?? next.netAmount!))) throw new FinanceValidationError("This record has payment allocations. Correct or unlink them in Reconciliation before changing its amount, currency, account or direct transaction link.", 409);
}
export async function syncSupportingMatch(db: DB, kind: "RECEIPT" | "INCOME", record: Supporting & { merchant?: string | null; description?: string; purchasedOn?: Date; paidOn?: Date }, previousTransactionId: number | null = null) {
  const links = await db.financialMatch.findMany({ where: { userId: FINANCE_USER_ID, kind, ...sourceWhere(kind, record.id), status: "CONFIRMED" } });
  // Multi-payment allocations are owned by the reconciliation workspace, not the legacy single-link control.
  if (!record.transactionId && !previousTransactionId && links.length) return;
  for (const link of links) if (link.transactionId !== record.transactionId && link.transactionId) await writeMatch(db, { kind, sourceId: record.id, transactionId: link.transactionId, amount: link.amount.toFixed(4), currency: link.currency, status: "UNLINKED", snapshot: link.sourceSnapshot as Prisma.InputJsonValue, action: "UNLINK", note: "Direct record link changed" });
  if (record.transactionId) {
    const amount = (record.total ?? record.netAmount)!.toFixed(4), existing = links.find(link => link.transactionId === record.transactionId && link.amount.equals(amount));
    if (!existing) await writeMatch(db, { kind, sourceId: record.id, transactionId: record.transactionId, amount, currency: record.currency, status: "CONFIRMED", snapshot: { origin: "direct", label: record.merchant ?? record.description ?? kind, date: (record.purchasedOn ?? record.paidOn)!.toISOString().slice(0, 10), accountId: record.accountId, amount, currency: record.currency }, action: "CONFIRM", note: "Confirmed in supporting record form" });
  }
}
export async function unlinkSupportingMatches(db: DB, kind: "RECEIPT" | "INCOME", id: number) {
  const links = await db.financialMatch.findMany({ where: { userId: FINANCE_USER_ID, kind, ...sourceWhere(kind, id), status: "CONFIRMED" } });
  for (const link of links) if (link.transactionId) await writeMatch(db, { kind, sourceId: id, transactionId: link.transactionId, amount: link.amount.toFixed(4), currency: link.currency, status: "UNLINKED", snapshot: link.sourceSnapshot as Prisma.InputJsonValue, action: "UNLINK", note: "Supporting record deleted; financial transaction retained" });
}
