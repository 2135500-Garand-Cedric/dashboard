import {
  CURRENCIES,
  FinanceValidationError,
  financeId,
  type FinanceAccount,
  type FinanceCategory,
} from "./validation";
import { calendarDate, UUID_PATTERN } from "./transactions";
import {
  receiptMoney as nonnegativeAmount,
  type ReceiptDocument,
  type FinanceReceipt,
} from "./receipts";

export const INCOME_KINDS = {
  EMPLOYMENT: "Employment",
  FREELANCE: "Freelance",
  INTEREST: "Interest",
  GIFT: "Gift",
  REIMBURSEMENT: "Reimbursement",
  OTHER: "Other income",
} as const;
export type IncomeKind = keyof typeof INCOME_KINDS;
export interface IncomeSource {
  id: number;
  name: string;
  kind: IncomeKind;
  active: boolean;
}
export interface DeductionType {
  id: number;
  name: string;
  active: boolean;
}
export interface IncomeInput {
  sourceId: number;
  description: string;
  date: string;
  periodStart: string | null;
  periodEnd: string | null;
  accountId: number;
  categoryId: null;
  currency: string;
  grossAmount: string | null;
  netAmount: string;
  deductions: { typeId: number; amount: string }[];
  notes: string | null;
  transactionAction: "LINK" | "CREATE";
  transactionId: number | null;
  requestKey: string | null;
  expectedUpdatedAt: string | null;
  acknowledgeMismatch: boolean;
  syncMovement?: boolean;
}
export interface FinanceIncome {
  id: number;
  source: IncomeSource | null;
  description: string;
  date: string;
  periodStart: string | null;
  periodEnd: string | null;
  account: FinanceAccount | null;
  category: FinanceCategory | null;
  currency: string;
  grossAmount: string | null;
  netAmount: string;
  deductions: { typeId: number; name: string; active: boolean; amount: string }[];
  deductionsTotal: string;
  difference: string | null;
  notes: string | null;
  updatedAt: string;
  document: ReceiptDocument | null;
  transaction: FinanceReceipt["transaction"];
  linkWarning: string | null;
  allocations: { id: number; transactionId: number | null; amount: string }[];
}
export interface IncomePage {
  records: FinanceIncome[];
  total: number;
  page: number;
  pageSize: number;
}
function text(value: unknown, label: string, limit: number, required = false) {
  if (value == null && !required) return null;
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.trim().length > limit ||
    (required && !value.trim())
  )
    throw new FinanceValidationError(
      `${label} must contain ${required ? "1" : "0"} to ${limit} characters.`,
    );
  return value.trim() || null;
}
function id(value: unknown) {
  if (typeof value !== "number")
    throw new FinanceValidationError("Choose a valid financial record.");
  return financeId(String(value));
}
function object(value: unknown, fields: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new FinanceValidationError("The request contains unsupported fields.");
  return value as Record<string, unknown>;
}
export function incomeConfigInput(value: unknown, source: boolean, editing = false) {
  const body = object(value, source ? ["name", "kind", "active"] : ["name", "active"]);
  const data: { name?: string; normalizedName?: string; kind?: IncomeKind; active?: boolean } = {};
  if (!editing || Object.hasOwn(body, "name")) {
    data.name = text(body.name, "Name", 100, true)!.normalize("NFKC").replace(/\s+/g, " ");
    if (data.name.length > 100)
      throw new FinanceValidationError("Name must not exceed 100 characters.");
    data.normalizedName = data.name.toLocaleLowerCase("en-CA");
  }
  if (source && (!editing || Object.hasOwn(body, "kind"))) {
    if (typeof body.kind !== "string" || !Object.hasOwn(INCOME_KINDS, body.kind))
      throw new FinanceValidationError("Choose a valid income source type.");
    data.kind = body.kind as IncomeKind;
  }
  if (Object.hasOwn(body, "active")) {
    if (typeof body.active !== "boolean")
      throw new FinanceValidationError("Active status must be true or false.");
    data.active = body.active;
  } else if (!editing) data.active = true;
  if (!Object.keys(data).length) throw new FinanceValidationError("No changes were provided.");
  return data;
}
function amountFromUnits(value: bigint) {
  const absolute = (value < BigInt(0) ? -value : value).toString().padStart(5, "0");
  return `${value < BigInt(0) ? "-" : ""}${absolute.slice(0, -4)}.${absolute.slice(-4)}`;
}
export function incomeAmounts(gross: string | null, deductions: { amount: string }[], net: string) {
  const units = (amount: string) => BigInt(nonnegativeAmount(amount).replace(".", ""));
  const total = deductions.reduce((sum, item) => sum + units(item.amount), BigInt(0));
  return {
    deductionsTotal: amountFromUnits(total),
    difference:
      gross === null || gross === "" ? null : amountFromUnits(units(gross) - total - units(net)),
  };
}
export function incomeInput(value: unknown, editing = false): IncomeInput {
  const body = object(value, [
    "sourceId",
    "description",
    "date",
    "periodStart",
    "periodEnd",
    "accountId",
    "currency",
    "grossAmount",
    "netAmount",
    "deductions",
    "notes",
    "transactionAction",
    "transactionId",
    "acknowledgeMismatch",
    "syncMovement",
    editing ? "expectedUpdatedAt" : "requestKey",
  ]);
  if (typeof body.currency !== "string" || !CURRENCIES.includes(body.currency))
    throw new FinanceValidationError("Choose a supported currency.");
  const periodStart =
    body.periodStart == null || body.periodStart === ""
      ? null
      : calendarDate(body.periodStart, "Pay period start");
  const periodEnd =
    body.periodEnd == null || body.periodEnd === ""
      ? null
      : calendarDate(body.periodEnd, "Pay period end");
  if (!!periodStart !== !!periodEnd || (periodStart && periodEnd && periodStart > periodEnd))
    throw new FinanceValidationError("Provide both pay period dates, with start on or before end.");
  if (!Array.isArray(body.deductions) || body.deductions.length > 30)
    throw new FinanceValidationError("Use up to 30 deduction lines.");
  const deductions = body.deductions
    .map((line) => {
      const item = object(line, ["typeId", "amount"]);
      return { typeId: id(item.typeId), amount: nonnegativeAmount(item.amount) };
    })
    .sort((a, b) => a.typeId - b.typeId);
  if (new Set(deductions.map((line) => line.typeId)).size !== deductions.length)
    throw new FinanceValidationError(
      "Each deduction type can appear only once. Add another type for a separate deduction.",
    );
  const transactionAction = body.transactionAction ?? "CREATE";
  if (transactionAction !== "LINK" && transactionAction !== "CREATE")
    throw new FinanceValidationError("Income must be linked to a deposit for its net amount.");
  if (transactionAction !== "LINK" && body.transactionId != null)
    throw new FinanceValidationError("Only linking uses an existing deposit ID.");
  if (body.accountId == null) throw new FinanceValidationError("Choose a deposit account.");
  const accountId = id(body.accountId);
  const netAmount = nonnegativeAmount(body.netAmount);
  if (netAmount === "0.0000")
    throw new FinanceValidationError("Net income must be greater than zero to create a deposit.");
  if (
    editing
      ? typeof body.expectedUpdatedAt !== "string" ||
        !Number.isFinite(Date.parse(body.expectedUpdatedAt))
      : typeof body.requestKey !== "string" || !UUID_PATTERN.test(body.requestKey)
  )
    throw new FinanceValidationError("Reload the income form before saving.");
  if (body.acknowledgeMismatch !== undefined && typeof body.acknowledgeMismatch !== "boolean")
    throw new FinanceValidationError("Amount confirmation must be true or false.");
  if (body.syncMovement !== undefined && typeof body.syncMovement !== "boolean")
    throw new FinanceValidationError("Invalid financial-record save option.");
  return {
    sourceId: id(body.sourceId),
    description: text(body.description, "Description", 300, true)!,
    date: calendarDate(body.date, "Pay date"),
    periodStart,
    periodEnd,
    accountId,
    categoryId: null,
    currency: body.currency,
    grossAmount:
      body.grossAmount == null || body.grossAmount === ""
        ? null
        : nonnegativeAmount(body.grossAmount),
    netAmount,
    deductions,
    notes: text(body.notes, "Notes", 2000),
    transactionAction,
    transactionId: transactionAction === "LINK" ? id(body.transactionId) : null,
    requestKey: editing ? null : (body.requestKey as string).toLowerCase(),
    expectedUpdatedAt: editing ? (body.expectedUpdatedAt as string) : null,
    acknowledgeMismatch: body.acknowledgeMismatch === true,
    syncMovement: body.syncMovement === true,
  };
}
