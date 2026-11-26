import { FinanceValidationError } from "./validation";
import { calendarDate } from "./transactions";
import { moneyUnits, moneyText } from "./reporting";

export type BalanceCheckpoint = { date: string; amount: string; ledgerAmount: string };
export function accountBalance(
  movements: { date: string; amount: string; excludedAmount: string }[],
  checkpoints: BalanceCheckpoint[],
  today: string,
) {
  const checkpoint =
    checkpoints
      .filter((row) => row.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  let amount = checkpoint
    ? moneyUnits(checkpoint.amount) - moneyUnits(checkpoint.ledgerAmount)
    : BigInt(0);
  for (const row of movements) {
    if (row.date > today) continue;
    const original = moneyUnits(row.amount),
      excluded = moneyUnits(row.excludedAmount);
    if (excluded < BigInt(0) || excluded > (original < BigInt(0) ? -original : original))
      throw new Error("Invalid balance exclusion.");
    amount += original < BigInt(0) ? original + excluded : original - excluded;
  }
  return { amount: moneyText(amount), checkpoint };
}
export function balanceInput(value: unknown, today: string) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FinanceValidationError("Enter a balance and closing date.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["date", "amount", "expectedRevision"].includes(key)))
    throw new FinanceValidationError("Unsupported balance fields.");
  const date = calendarDate(body.date, "Closing date");
  if (date > today) throw new FinanceValidationError("The closing date cannot be in the future.");
  if (
    typeof body.amount !== "string" ||
    !/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(body.amount.trim())
  )
    throw new FinanceValidationError("Enter a balance with at most two decimal places.");
  if (
    !Number.isSafeInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 0 ||
    Number(body.expectedRevision) > 2147483647
  )
    throw new FinanceValidationError("Reload the account before setting its balance.");
  return { date, amount: body.amount.trim(), expectedRevision: Number(body.expectedRevision) };
}
export type AccountBalance = {
  id: number;
  name: string;
  type: string;
  currency: string;
  active: boolean;
  amount: string;
  revision: number;
  asOf: string;
  checkpoint: BalanceCheckpoint | null;
};
