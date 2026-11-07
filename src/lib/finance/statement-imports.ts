import { CURRENCIES, FinanceValidationError, financeId, type FinanceAccount } from "./validation";
import { TRANSACTION_TYPES, type TransactionType } from "./transactions";
import { DATE_FORMATS, statementAmount, statementDate, type CsvParsing, type DateFormat } from "./statement-csv";

export const IMPORT_ACTIONS = { REVIEW: "Needs review", CREATE: "Create new transaction", MATCH: "Link existing transaction", SKIP: "Skip row" } as const;
export type ImportAction = keyof typeof IMPORT_ACTIONS;
export interface ImportMapping {
  dateColumn: number; descriptionColumn: number; amountColumn: number | null; debitColumn: number | null; creditColumn: number | null;
  currencyColumn: number | null; typeColumn: number | null; referenceColumn: number | null; counterpartyColumn: number | null; notesColumn: number | null; categoryColumn: number | null;
  amountMode: "SIGNED" | "DEBIT_CREDIT"; signConvention: "INFLOW_POSITIVE" | "OUTFLOW_POSITIVE"; debitDirection: "OUTFLOW" | "INFLOW";
  dateFormat: DateFormat; decimal: "." | ","; outflowType: TransactionType | "REVIEW"; inflowType: TransactionType | "REVIEW";
  expenseCategoryId: number | null; incomeCategoryId: number | null; typeRules: { value: string; type: TransactionType }[]; confirmed: boolean;
}
export interface ImportReview {
  date: string; description: string; amount: string; currency: string; type: TransactionType | null; categoryId: number | null;
  counterparty: string; notes: string; reference: string; otherAccountId: number | null; otherAmount: string; matchId: number | null; allowDuplicate: boolean;
}
export interface ImportCandidate { id: number; date: string; description: string; amount: string; currency: string; type: TransactionType; source: string; confidence: "SOURCE_ID" | "EXACT" | "POSSIBLE"; otherAccount: string | null; }
export interface ImportRow { id: number; rowNumber: number; original: { cells: string[]; line: number }; review: ImportReview | null; action: ImportAction; transactionId: number | null; errors: string[]; warnings: string[]; candidates: ImportCandidate[]; duplicateOf: number | null; }
export interface ImportBatch {
  id: number; account: FinanceAccount; status: "DRAFT" | "COMPLETED"; revision: number; originalName: string | null; byteSize: number | null;
  createdAt: string; completedAt: string | null; headers: string[]; parsing: CsvParsing & { detectedDelimiter?: string; detectedEncoding?: string } | null;
  mapping: ImportMapping | null; rows: ImportRow[]; documentAvailable: boolean;
}
export interface ImportSummary { id: number; account: FinanceAccount; status: "DRAFT" | "COMPLETED"; originalName: string | null; createdAt: string; completedAt: string | null; counts: Record<ImportAction, number>; }
export function strictObject(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new FinanceValidationError("The statement request contains unsupported fields.");
  return value as Record<string, unknown>;
}
export function statementId(value: unknown) { if (typeof value !== "number") throw new FinanceValidationError("Choose a valid record."); return financeId(String(value)); }
function optionalId(value: unknown) { return value == null ? null : statementId(value); }
export function importUploadInput(value: unknown) {
  const body = strictObject(value, ["accountId", "delimiter", "encoding", "headerRow"]);
  if (!["AUTO", ",", ";", "\t", "|"].includes(String(body.delimiter))) throw new FinanceValidationError("Choose a supported CSV separator.");
  if (!["AUTO", "UTF-8", "WINDOWS-1252"].includes(String(body.encoding))) throw new FinanceValidationError("Choose a supported file encoding.");
  if (!Number.isInteger(body.headerRow) || Number(body.headerRow) < 1 || Number(body.headerRow) > 20) throw new FinanceValidationError("Header row must be between 1 and 20.");
  return { accountId: statementId(body.accountId), parsing: { delimiter: body.delimiter, encoding: body.encoding, headerRow: body.headerRow } as CsvParsing };
}
export function mappingInput(value: unknown, width: number): ImportMapping {
  const fields = ["dateColumn", "descriptionColumn", "amountColumn", "debitColumn", "creditColumn", "currencyColumn", "typeColumn", "referenceColumn", "counterpartyColumn", "notesColumn", "categoryColumn", "amountMode", "signConvention", "debitDirection", "dateFormat", "decimal", "outflowType", "inflowType", "expenseCategoryId", "incomeCategoryId", "typeRules", "confirmed"];
  const body = strictObject(value, fields);
  const column = (key: string, required = false) => {
    const index = body[key]; if (index == null && !required) return null;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= width) throw new FinanceValidationError(`Choose a valid ${key.replace("Column", " column")}.`);
    return index;
  };
  if (body.amountMode !== "SIGNED" && body.amountMode !== "DEBIT_CREDIT") throw new FinanceValidationError("Choose signed amounts or debit/credit columns.");
  if (!["INFLOW_POSITIVE", "OUTFLOW_POSITIVE"].includes(String(body.signConvention)) || !["OUTFLOW", "INFLOW"].includes(String(body.debitDirection))) throw new FinanceValidationError("Confirm the statement's amount direction convention.");
  if (body.confirmed !== true) throw new FinanceValidationError("Confirm how this statement's amounts affect the selected account before previewing.");
  if (typeof body.dateFormat !== "string" || !Object.hasOwn(DATE_FORMATS, body.dateFormat)) throw new FinanceValidationError("Choose an explicit date format.");
  if (body.decimal !== "." && body.decimal !== ",") throw new FinanceValidationError("Choose dot or comma decimals.");
  if (!["REVIEW", "EXPENSE", "TRANSFER", "ADJUSTMENT"].includes(String(body.outflowType)) || !["REVIEW", "INCOME", "REFUND", "TRANSFER", "ADJUSTMENT"].includes(String(body.inflowType))) throw new FinanceValidationError("Choose valid suggested types for money leaving/entering the account.");
  if (!Array.isArray(body.typeRules) || body.typeRules.length > 30) throw new FinanceValidationError("Use at most 30 CSV type mappings.");
  const typeRules = body.typeRules.map(value => {
    const item = strictObject(value, ["value", "type"]);
    if (typeof item.value !== "string" || !item.value.trim() || item.value.length > 100 || typeof item.type !== "string" || !Object.hasOwn(TRANSACTION_TYPES, item.type)) throw new FinanceValidationError("Each CSV type mapping needs a value and transaction type.");
    return { value: item.value.trim(), type: item.type as TransactionType };
  });
  if (new Set(typeRules.map(rule => normalizedText(rule.value))).size !== typeRules.length) throw new FinanceValidationError("CSV type mappings must use distinct values.");
  const result: ImportMapping = { dateColumn: column("dateColumn", true)!, descriptionColumn: column("descriptionColumn", true)!, amountColumn: column("amountColumn", body.amountMode === "SIGNED"), debitColumn: column("debitColumn", body.amountMode === "DEBIT_CREDIT"), creditColumn: column("creditColumn", body.amountMode === "DEBIT_CREDIT"), currencyColumn: column("currencyColumn"), typeColumn: column("typeColumn"), referenceColumn: column("referenceColumn"), counterpartyColumn: column("counterpartyColumn"), notesColumn: column("notesColumn"), categoryColumn: column("categoryColumn"), amountMode: body.amountMode, signConvention: body.signConvention as ImportMapping["signConvention"], debitDirection: body.debitDirection as ImportMapping["debitDirection"], dateFormat: body.dateFormat as DateFormat, decimal: body.decimal, outflowType: body.outflowType as ImportMapping["outflowType"], inflowType: body.inflowType as ImportMapping["inflowType"], expenseCategoryId: optionalId(body.expenseCategoryId), incomeCategoryId: optionalId(body.incomeCategoryId), typeRules, confirmed: true };
  if (result.amountMode === "DEBIT_CREDIT" && result.debitColumn === result.creditColumn) throw new FinanceValidationError("Debit and credit must use different columns.");
  return result;
}
export function normalizedText(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-CA"); }
export function reviewInput(value: unknown): ImportReview {
  const body = strictObject(value, ["date", "description", "amount", "currency", "type", "categoryId", "counterparty", "notes", "reference", "otherAccountId", "otherAmount", "matchId", "allowDuplicate"]);
  const text = (key: string, max: number) => { if (typeof body[key] !== "string" || body[key].length > max || body[key].includes("\0")) throw new FinanceValidationError(`Invalid ${key} field.`); return body[key].trim(); };
  if (body.type !== null && (typeof body.type !== "string" || !Object.hasOwn(TRANSACTION_TYPES, body.type))) throw new FinanceValidationError("Choose a valid transaction type.");
  if (typeof body.allowDuplicate !== "boolean") throw new FinanceValidationError("Duplicate confirmation must be true or false.");
  return { date: text("date", 100), description: text("description", 10000), amount: text("amount", 100), currency: text("currency", 20).toUpperCase(), type: body.type as TransactionType | null, categoryId: optionalId(body.categoryId), counterparty: text("counterparty", 10000), notes: text("notes", 10000), reference: text("reference", 10000), otherAccountId: optionalId(body.otherAccountId), otherAmount: text("otherAmount", 100), matchId: optionalId(body.matchId), allowDuplicate: body.allowDuplicate };
}
export function mappedReview(cells: string[], mapping: ImportMapping, currency: string): ImportReview {
  const cell = (index: number | null) => index === null ? "" : (cells[index] ?? "").trim();
  const rowCurrency = cell(mapping.currencyColumn).toUpperCase() || currency;
  let amount = cell(mapping.amountColumn);
  try {
    if (mapping.amountMode === "SIGNED") {
      amount = statementAmount(amount, mapping.decimal, rowCurrency);
      if (mapping.signConvention === "OUTFLOW_POSITIVE" && amount !== "0.0000") amount = amount.startsWith("-") ? amount.slice(1) : `-${amount}`;
    } else {
      const debit = cell(mapping.debitColumn) ? statementAmount(cell(mapping.debitColumn), mapping.decimal, rowCurrency).replace(/^-/, "") : "0.0000";
      const credit = cell(mapping.creditColumn) ? statementAmount(cell(mapping.creditColumn), mapping.decimal, rowCurrency).replace(/^-/, "") : "0.0000";
      if (debit !== "0.0000" && credit !== "0.0000") amount = "Both debit and credit are non-zero";
      else if (debit === "0.0000" && credit === "0.0000") amount = "0.0000";
      else { const outflow = debit !== "0.0000" ? mapping.debitDirection === "OUTFLOW" : mapping.debitDirection === "INFLOW"; amount = `${outflow ? "-" : ""}${debit !== "0.0000" ? debit : credit}`; }
    }
  } catch { amount = mapping.amountMode === "SIGNED" ? `Invalid amount: ${cell(mapping.amountColumn)}` : "Invalid debit/credit amount"; }
  let date = cell(mapping.dateColumn);
  try { date = statementDate(date, mapping.dateFormat); } catch { /* Keep the source value visible for correction. */ }
  const rawType = cell(mapping.typeColumn), rule = mapping.typeRules.find(rule => normalizedText(rule.value) === normalizedText(rawType));
  const suggestedType = rawType ? rule?.type ?? "REVIEW" : amount.startsWith("-") ? mapping.outflowType : mapping.inflowType;
  const type = suggestedType === "REVIEW" ? null : suggestedType;
  return { date: date.slice(0, 100), description: cell(mapping.descriptionColumn), amount: amount.slice(0, 100), currency: rowCurrency.slice(0, 20), type, categoryId: type === "INCOME" ? mapping.incomeCategoryId : type === "EXPENSE" || type === "REFUND" ? mapping.expenseCategoryId : null, counterparty: cell(mapping.counterpartyColumn), notes: cell(mapping.notesColumn), reference: cell(mapping.referenceColumn), otherAccountId: null, otherAmount: "", matchId: null, allowDuplicate: false };
}
export function validCurrency(value: string) { return CURRENCIES.includes(value); }
