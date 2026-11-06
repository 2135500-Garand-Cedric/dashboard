import { CURRENCIES, FinanceValidationError, type FinanceAccount, type FinanceCategory } from "./validation";

export const TRANSACTION_TYPES = { EXPENSE: "Expense", INCOME: "Income", TRANSFER: "Transfer", REFUND: "Refund", ADJUSTMENT: "Adjustment" } as const;
export type TransactionType = keyof typeof TRANSACTION_TYPES;
export const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export interface TransactionInput {
  date: string; description: string; amount: string; currency: string; type: TransactionType;
  accountId: number; categoryId: number | null; counterparty: string | null; notes: string | null;
  destinationAccountId: number | null; destinationAmount: string | null;
  requestKey: string | null; expectedUpdatedAt: string | null; allowDuplicate: boolean;
}

export interface FinanceTransaction {
  id: number; date: string; description: string; amount: string; currency: string; type: TransactionType;
  account: FinanceAccount; category: FinanceCategory | null; counterparty: string | null; notes: string | null;
  source: "MANUAL" | "IMPORTED"; updatedAt: string;
  transfer: { id: string; transactionId: number; account: FinanceAccount; amount: string; currency: string } | null;
}

export interface TransactionPage { transactions: FinanceTransaction[]; total: number; page: number; pageSize: number; }

export function calendarDate(value: unknown, label = "Date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) throw new FinanceValidationError(`${label} must be a valid calendar date.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new FinanceValidationError(`${label} must be a valid calendar date.`);
  return value;
}

// Amounts cross HTTP boundaries as decimal strings. No Number/parseFloat math.
export function decimalAmount(value: unknown, signed = false) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/.test(value.trim())) throw new FinanceValidationError("Enter an amount as decimal text with up to 15 integer digits and 4 decimal places.");
  const text = value.trim();
  if (!signed && text.startsWith("-")) throw new FinanceValidationError("Enter a positive amount. The transaction type determines whether money enters or leaves the account.");
  const negative = text.startsWith("-");
  const [integer, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const result = `${integer}.${fraction.padEnd(4, "0")}`;
  if (result === "0.0000") throw new FinanceValidationError("Amount must be greater than zero (or a non-zero signed amount for an adjustment).");
  return `${negative ? "-" : ""}${result}`;
}

function id(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new FinanceValidationError(`Choose a valid ${label}.`);
  return value;
}

function text(value: unknown, label: string, limit: number, required = false) {
  if (value == null || value === "") {
    if (required) throw new FinanceValidationError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string" || value.includes("\u0000")) throw new FinanceValidationError(`${label} must be text.`);
  const result = value.trim();
  if (result.length > limit || (required && !result)) throw new FinanceValidationError(`${label} must contain ${required ? "1" : "0"} to ${limit} characters.`);
  return result || null;
}

export function transactionInput(value: unknown, editing = false): TransactionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FinanceValidationError("A JSON object is required.");
  const body = value as Record<string, unknown>;
  const allowed = ["date", "description", "amount", "currency", "type", "accountId", "categoryId", "counterparty", "notes", "destinationAccountId", "destinationAmount", "allowDuplicate", editing ? "expectedUpdatedAt" : "requestKey"];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new FinanceValidationError("The transaction contains unsupported fields.");
  if (typeof body.type !== "string" || !Object.hasOwn(TRANSACTION_TYPES, body.type)) throw new FinanceValidationError("Choose a valid transaction type.");
  const type = body.type as TransactionType;
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  if (!CURRENCIES.includes(currency)) throw new FinanceValidationError("Choose a supported three-letter currency code.");
  const accountId = id(body.accountId, "account");
  const categoryId = ["EXPENSE", "INCOME", "REFUND"].includes(type) ? id(body.categoryId, "category") : null;
  if (!categoryId && body.categoryId != null) throw new FinanceValidationError("Transfers and adjustments do not use income or expense categories.");
  const destinationAccountId = type === "TRANSFER" ? id(body.destinationAccountId, "destination account") : null;
  if (destinationAccountId === accountId) throw new FinanceValidationError("Transfer accounts must be different.");
  if (type !== "TRANSFER" && (body.destinationAccountId != null || body.destinationAmount != null)) throw new FinanceValidationError("Only transfers have a destination account or received amount.");
  let requestKey: string | null = null, expectedUpdatedAt: string | null = null;
  if (editing) {
    if (typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) throw new FinanceValidationError("The transaction version is required. Reload it before editing.");
    expectedUpdatedAt = body.expectedUpdatedAt;
  } else {
    if (typeof body.requestKey !== "string" || !UUID_PATTERN.test(body.requestKey)) throw new FinanceValidationError("A valid request identifier is required. Reload the form and try again.");
    requestKey = body.requestKey.toLowerCase();
  }
  if (body.allowDuplicate !== undefined && typeof body.allowDuplicate !== "boolean") throw new FinanceValidationError("Duplicate confirmation must be true or false.");
  return {
    date: calendarDate(body.date), description: text(body.description, "Description", 300, true)!,
    amount: decimalAmount(body.amount, type === "ADJUSTMENT"), currency, type, accountId, categoryId,
    counterparty: text(body.counterparty, "Merchant or counterparty", 200), notes: text(body.notes, "Notes", 2000),
    destinationAccountId, destinationAmount: type === "TRANSFER" && body.destinationAmount != null && body.destinationAmount !== "" ? decimalAmount(body.destinationAmount) : null,
    requestKey, expectedUpdatedAt, allowDuplicate: body.allowDuplicate === true,
  };
}

export function displayAmount(amount: string, currency: string) {
  const negative = amount.startsWith("-");
  const [integer, fraction = ""] = (negative ? amount.slice(1) : amount).split(".");
  const decimals = fraction.padEnd(2, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${negative ? "−" : "+"}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimals} ${currency}`;
}
