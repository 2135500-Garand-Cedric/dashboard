export const ACCOUNT_TYPES = {
  CHEQUING: "Chequing", SAVINGS: "Savings", CREDIT_CARD: "Credit card", CASH: "Cash", OTHER: "Other",
} as const;
export const CATEGORY_TYPES = { EXPENSE: "Expense", INCOME: "Income" } as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;
export type CategoryType = keyof typeof CATEGORY_TYPES;
export const CURRENCIES = Intl.supportedValuesOf("currency");
const currencies = new Set(CURRENCIES);

export class FinanceValidationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FinanceValidationError("A JSON object is required.");
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new FinanceValidationError("The request contains unsupported fields.");
  return value as Record<string, unknown>;
}

function name(value: unknown) {
  if (typeof value !== "string") throw new FinanceValidationError("Enter a name.");
  const result = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!result || result.length > 100) throw new FinanceValidationError("Name must contain between 1 and 100 characters.");
  return { name: result, normalizedName: result.toLocaleLowerCase("en-CA") };
}

function active(value: unknown) {
  if (typeof value !== "boolean") throw new FinanceValidationError("Active status must be true or false.");
  return value;
}

export function financeId(value: string) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) throw new FinanceValidationError("Invalid record identifier.");
  return Number(value);
}

export function accountInput(value: unknown, partial = false) {
  const body = object(value, ["name", "type", "currency", "maskedIdentifier", "active"]);
  if (partial && !Object.keys(body).length) throw new FinanceValidationError("No account changes were provided.");
  const result: { name?: string; normalizedName?: string; type?: AccountType; currency?: string; maskedIdentifier?: string | null; active?: boolean } = {};
  if (!partial || "name" in body) Object.assign(result, name(body.name));
  if (!partial || "type" in body) {
    if (typeof body.type !== "string" || !Object.hasOwn(ACCOUNT_TYPES, body.type)) throw new FinanceValidationError("Choose a valid account type.");
    result.type = body.type as AccountType;
  }
  if (!partial || "currency" in body) {
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    if (!currencies.has(currency)) throw new FinanceValidationError("Choose a supported three-letter currency code.");
    result.currency = currency;
  }
  if (!partial || "maskedIdentifier" in body) {
    if (body.maskedIdentifier != null && typeof body.maskedIdentifier !== "string") throw new FinanceValidationError("Enter a masked identifier or leave it empty.");
    const identifier = typeof body.maskedIdentifier === "string" ? body.maskedIdentifier.trim() : "";
    if (identifier && (identifier.length > 32 || !/^(?:[*•xX][*•xX -]*)?[A-Za-z0-9]{1,4}$/.test(identifier))) throw new FinanceValidationError("Use only the last four characters, optionally preceded by masking symbols (for example, **** 1234). Full account or card numbers are not accepted.");
    result.maskedIdentifier = identifier || null;
  }
  if ("active" in body) result.active = active(body.active);
  else if (!partial) result.active = true;
  return result;
}

export function categoryInput(value: unknown, partial = false) {
  const body = object(value, ["name", "type", "active"]);
  if (partial && !Object.keys(body).length) throw new FinanceValidationError("No category changes were provided.");
  const result: { name?: string; normalizedName?: string; type?: CategoryType; active?: boolean } = {};
  if (!partial || "name" in body) Object.assign(result, name(body.name));
  if (!partial || "type" in body) {
    if (typeof body.type !== "string" || !Object.hasOwn(CATEGORY_TYPES, body.type)) throw new FinanceValidationError("Choose Income or Expense.");
    result.type = body.type as CategoryType;
  }
  if ("active" in body) result.active = active(body.active);
  else if (!partial) result.active = true;
  return result;
}

export interface FinanceAccount {
  id: number; name: string; type: AccountType; currency: string; maskedIdentifier: string | null; active: boolean;
}
export interface FinanceCategory {
  id: number; name: string; type: CategoryType; active: boolean;
}
