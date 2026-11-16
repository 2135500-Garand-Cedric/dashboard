import { calendarDate, decimalAmount } from "./transactions";
import { CURRENCIES } from "./validation";

export type StatementPrefill = {
  date?: string;
  description?: string;
  amount?: string;
  accountId?: string;
  currency?: string;
};

export function statementPrefill(
  params: Record<string, string | string[] | undefined>,
): StatementPrefill {
  const result: StatementPrefill = {};
  try {
    result.date = calendarDate(params.date);
  } catch {
    /* Use the form's default date. */
  }
  try {
    result.amount = decimalAmount(params.amount);
  } catch {
    /* Leave invalid amounts blank. */
  }
  if (typeof params.description === "string") result.description = params.description.slice(0, 300);
  if (
    typeof params.accountId === "string" &&
    /^[1-9]\d*$/.test(params.accountId) &&
    Number.isSafeInteger(Number(params.accountId))
  )
    result.accountId = params.accountId;
  if (typeof params.currency === "string" && CURRENCIES.includes(params.currency))
    result.currency = params.currency;
  return result;
}
