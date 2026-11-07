import { FinanceValidationError, financeId } from "./validation";
import { decimalAmount, UUID_PATTERN } from "./transactions";

export const MATCH_KINDS = { RECEIPT: "Receipt payments", INCOME: "Income deposits", DUPLICATE: "Manual / statement duplicates", REFUND: "Refunds", STATEMENT: "Statement row matches" } as const;
export type MatchKind = keyof typeof MATCH_KINDS;
export interface MatchRecord {
  id: number; kind: MatchKind; label: string; date: string; amount: string; signedAmount: string;
  currency: string; accountId: number | null; account: string; type: string; version: string;
  allocated: string; remaining: string; href: string;
  canMatch?: boolean;
}
export interface MatchLink {
  id: number; revision: number; kind: MatchKind; sourceId: number | null; transactionId: number | null;
  amount: string; currency: string; status: "CONFIRMED" | "REJECTED" | "UNLINKED"; note: string | null;
  sourceLabel: string; targetLabel: string; updatedAt: string;
}
export interface MatchCandidate { transaction: MatchRecord; score: number; reasons: string[]; warning: string | null; amount: string; link: MatchLink | null; }
export interface MatchDetail { source: MatchRecord; links: MatchLink[]; related: MatchLink[]; candidates: MatchCandidate[]; warnings?: string[]; }
export interface MatchCommand {
  kind: MatchKind; sourceId: number; transactionId: number; action: "CONFIRM" | "REJECT" | "UNLINK";
  amount: string; expectedRevision: number; sourceVersion: string; targetVersion: string;
  requestKey: string; note: string; acknowledgeAccountDifference: boolean;
}
export function matchKind(value: unknown): MatchKind {
  if (typeof value !== "string" || !Object.hasOwn(MATCH_KINDS, value)) throw new FinanceValidationError("Choose a valid reconciliation type.");
  return value as MatchKind;
}
export function matchInput(value: unknown): MatchCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FinanceValidationError("Reconciliation details are required.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["kind", "sourceId", "transactionId", "action", "amount", "expectedRevision", "sourceVersion", "targetVersion", "requestKey", "note", "acknowledgeAccountDifference"].includes(key))) throw new FinanceValidationError("Reconciliation contains unsupported fields.");
  const id = (value: unknown) => { if (typeof value !== "number") throw new FinanceValidationError("Choose a valid record."); return financeId(String(value)); };
  if (!["CONFIRM", "REJECT", "UNLINK"].includes(String(body.action))) throw new FinanceValidationError("Choose confirm, reject or unlink.");
  if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new FinanceValidationError("Reload the match before saving.");
  if (typeof body.requestKey !== "string" || !UUID_PATTERN.test(body.requestKey)) throw new FinanceValidationError("Reload the form before saving.");
  for (const key of ["sourceVersion", "targetVersion"] as const) if (typeof body[key] !== "string" || body[key].length > 100) throw new FinanceValidationError("Record versions are required.");
  if (typeof body.note !== "string" || body.note.length > 1000 || body.note.includes("\0")) throw new FinanceValidationError("Decision notes must be at most 1,000 characters.");
  if (typeof body.acknowledgeAccountDifference !== "boolean") throw new FinanceValidationError("Confirm any account difference explicitly.");
  const amount = body.action !== "CONFIRM" && typeof body.amount === "string" && /^0(?:\.0{1,4})?$/.test(body.amount) ? "0.0000" : decimalAmount(body.amount);
  return { kind: matchKind(body.kind), sourceId: id(body.sourceId), transactionId: id(body.transactionId), action: body.action as MatchCommand["action"], amount, expectedRevision: Number(body.expectedRevision), sourceVersion: body.sourceVersion as string, targetVersion: body.targetVersion as string, requestKey: body.requestKey, note: body.note.trim(), acknowledgeAccountDifference: body.acknowledgeAccountDifference };
}
export function textSimilarity(left: string, right: string) {
  const words = (value: string) => new Set(value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  const a = words(left), b = words(right);
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter(word => b.has(word)).length;
  return shared / (a.size + b.size - shared);
}
export function matchScore(source: MatchRecord, target: MatchRecord) {
  const reasons: string[] = ["Same currency"], days = Math.round(Math.abs(Date.parse(source.date) - Date.parse(target.date)) / 86400000);
  let score = 10;
  if (source.accountId === target.accountId) { score += 20; reasons.push("Same account"); }
  if (source.remaining === target.remaining) { score += 35; reasons.push("Same remaining amount"); }
  else if (source.amount === target.amount) { score += 25; reasons.push("Same original amount"); }
  else reasons.push("Partial allocation — check both amounts");
  if (days <= 3) score += 15; else if (days <= 14) score += 10; else if (days <= 60) score += 5;
  reasons.push(`${days} days apart`);
  const similarity = textSimilarity(source.label, target.label);
  score += Math.round(similarity * 20); if (similarity) reasons.push(`Description similarity ${Math.round(similarity * 100)}%`);
  return { score, reasons };
}
