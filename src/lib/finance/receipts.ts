import { CURRENCIES, FinanceValidationError, financeId, type FinanceAccount, type FinanceCategory } from "./validation";
import { calendarDate, decimalAmount, UUID_PATTERN } from "./transactions";

export const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;
export const RECEIPT_FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
export interface ReceiptInput {
  merchant: string; date: string; accountId: number; categoryId: number; currency: string;
  subtotal: string; tax: string; tip: string; total: string; notes: string | null;
  transactionAction: "UNMATCHED" | "LINK" | "CREATE"; transactionId: number | null;
  requestKey: string | null; expectedUpdatedAt: string | null; acknowledgeMismatch: boolean;
}
export interface ReceiptDocument { id: number; originalName: string; mimeType: string; byteSize: number; }
export interface FinanceReceipt {
  id: number; merchant: string | null; date: string; account: FinanceAccount | null; category: FinanceCategory | null;
  subtotal: string; tax: string; tip: string; total: string; currency: string; notes: string | null;
  updatedAt: string; difference: string; document: ReceiptDocument | null;
  transaction: { id: number; description: string; date: string; amount: string; currency: string; accountId: number; type: string } | null;
  linkWarning: string | null;
}
export interface ReceiptPage { receipts: FinanceReceipt[]; total: number; page: number; pageSize: number; }
function text(value: unknown, label: string, max: number, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || value.includes("\0") || value.trim().length > max || (required && !value.trim())) throw new FinanceValidationError(`${label} must contain ${required ? "1" : "0"} to ${max} characters.`);
  return value.trim() || null;
}
export function receiptMoney(value: unknown) {
  if (typeof value === "string" && /^0(?:\.0{1,4})?$/.test(value.trim())) return "0.0000";
  return decimalAmount(value);
}
// BigInt arithmetic keeps the browser's reconciliation warning as exact as the database.
export function receiptDifference(subtotal: string, tax: string, tip: string, total: string) {
  const units = (value: string) => BigInt(receiptMoney(value).replace(".", ""));
  const difference = units(total) - units(subtotal) - units(tax) - units(tip);
  const absolute = (difference < BigInt(0) ? -difference : difference).toString().padStart(5, "0");
  return `${difference < BigInt(0) ? "-" : ""}${absolute.slice(0, -4)}.${absolute.slice(-4)}`;
}
export function receiptInput(value: unknown, editing = false): ReceiptInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FinanceValidationError("Receipt details must be a JSON object.");
  const body = value as Record<string, unknown>;
  const fields = ["merchant", "date", "accountId", "categoryId", "currency", "subtotal", "tax", "tip", "total", "notes", "transactionAction", "transactionId", "acknowledgeMismatch", editing ? "expectedUpdatedAt" : "requestKey"];
  if (Object.keys(body).some(key => !fields.includes(key))) throw new FinanceValidationError("Receipt contains unsupported fields.");
  const id = (value: unknown) => { if (typeof value !== "number") throw new FinanceValidationError("Choose a valid account, category or transaction."); return financeId(String(value)); };
  if (typeof body.currency !== "string" || !CURRENCIES.includes(body.currency)) throw new FinanceValidationError("Choose a supported currency.");
  if (!["UNMATCHED", "LINK", "CREATE"].includes(String(body.transactionAction))) throw new FinanceValidationError("Choose how to handle the transaction.");
  if (body.transactionAction !== "LINK" && body.transactionId != null) throw new FinanceValidationError("Only linking uses an existing transaction ID.");
  if (editing ? typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt)) : typeof body.requestKey !== "string" || !UUID_PATTERN.test(body.requestKey)) throw new FinanceValidationError("Reload the receipt form before saving.");
  if (body.acknowledgeMismatch !== undefined && typeof body.acknowledgeMismatch !== "boolean") throw new FinanceValidationError("Total confirmation must be true or false.");
  return {
    merchant: text(body.merchant, "Merchant", 200, true)!, date: calendarDate(body.date),
    accountId: id(body.accountId), categoryId: id(body.categoryId), currency: body.currency,
    subtotal: receiptMoney(body.subtotal), tax: receiptMoney(body.tax), tip: receiptMoney(body.tip ?? "0"), total: receiptMoney(body.total), notes: text(body.notes, "Notes", 2000),
    transactionAction: body.transactionAction as ReceiptInput["transactionAction"], transactionId: body.transactionAction === "LINK" ? id(body.transactionId) : null,
    requestKey: editing ? null : (body.requestKey as string).toLowerCase(), expectedUpdatedAt: editing ? body.expectedUpdatedAt as string : null, acknowledgeMismatch: body.acknowledgeMismatch === true,
  };
}
