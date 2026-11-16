import { FinanceValidationError } from "./validation";
import { calendarDate, decimalAmount } from "./transactions";
import { mappedReview, type ImportMapping, type ImportReview } from "./statement-imports";
import type { ParsedStatement } from "./statement-csv";

export type StatementPeriod = { periodStart: string; periodEnd: string; matchingOnly: true };
export const FIXED_STATEMENT_MAPPING: ImportMapping = {
  dateColumn: 0,
  referenceColumn: 1,
  descriptionColumn: 2,
  amountColumn: 3,
  debitColumn: null,
  creditColumn: null,
  currencyColumn: null,
  typeColumn: null,
  counterpartyColumn: null,
  notesColumn: null,
  categoryColumn: null,
  amountMode: "SIGNED",
  signConvention: "INFLOW_POSITIVE",
  debitDirection: "OUTFLOW",
  dateFormat: "YYYY-MM-DD",
  decimal: ".",
  outflowType: "EXPENSE",
  inflowType: "INCOME",
  expenseCategoryId: null,
  incomeCategoryId: null,
  typeRules: [],
  confirmed: true,
};
export function fixedStatementPeriod(
  input: { periodStart?: unknown; periodEnd?: unknown },
  parsed: ParsedStatement,
): StatementPeriod {
  const periodStart = calendarDate(input.periodStart, "Statement period start"),
    periodEnd = calendarDate(input.periodEnd, "Statement period end");
  if (periodStart > periodEnd)
    throw new FinanceValidationError("Statement period start must be on or before its end.");
  const headers = parsed.headers.map((header) => header.trim().toLowerCase().replace(/\s/g, ""));
  if (
    headers.length !== 4 ||
    headers.join("|") !== "date|ref#|description|amount" ||
    parsed.parsing.headerRow !== 1
  )
    throw new FinanceValidationError(
      "Use exactly these four columns, in order: date, ref #, description, amount.",
    );
  const references = new Set<string>();
  for (const row of parsed.rows) {
    const date = calendarDate(row.cells[0]?.trim(), `CSV line ${row.line} date`);
    if (date < periodStart || date > periodEnd)
      throw new FinanceValidationError(
        `CSV line ${row.line} is outside the selected statement period.`,
      );
    decimalAmount(row.cells[3]?.trim().replace(/^\+/, ""), true);
    if (!row.cells[2]?.trim() || row.cells[2].trim().length > 300)
      throw new FinanceValidationError(
        `CSV line ${row.line} needs a description of 1–300 characters.`,
      );
    const reference = row.cells[1]?.trim() ?? "";
    if (reference.length > 200)
      throw new FinanceValidationError(
        `CSV line ${row.line} reference must be at most 200 characters.`,
      );
    if (reference && references.has(reference))
      throw new FinanceValidationError(
        `Reference ${reference} occurs more than once. Check the statement for repeated rows.`,
      );
    if (reference) references.add(reference);
  }
  return { periodStart, periodEnd, matchingOnly: true };
}
export function fixedReview(cells: string[], currency: string): ImportReview {
  return mappedReview(cells, FIXED_STATEMENT_MAPPING, currency);
}
export function assertFixedReview(original: ImportReview, edited: ImportReview) {
  if (
    ["date", "description", "amount", "currency", "reference"].some(
      (key) => original[key as keyof ImportReview] !== edited[key as keyof ImportReview],
    )
  )
    throw new FinanceValidationError(
      "Statement date, reference, description and amount come from the CSV and cannot be changed during matching.",
    );
  const normalType = original.amount.startsWith("-") ? "EXPENSE" : "INCOME";
  if (
    edited.type !== normalType &&
    edited.type !== "TRANSFER" &&
    !(normalType === "INCOME" && edited.type === "REFUND")
  )
    throw new FinanceValidationError(
      `Choose ${normalType === "EXPENSE" ? "an expense" : "an income"} or a transfer for this row.`,
    );
  if (
    edited.categoryId !== null ||
    edited.otherAccountId !== null ||
    edited.otherAmount ||
    edited.allowDuplicate
  )
    throw new FinanceValidationError(
      "Statement imports only match existing records; they do not create financial activity.",
    );
}
