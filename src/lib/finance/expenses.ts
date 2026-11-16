import { receiptInput } from "./receipts";
import { FinanceValidationError } from "./validation";
export function expenseInput(value: unknown, editing = false) {
  const input = receiptInput(value, editing);
  if (input.transactionAction === "UNMATCHED")
    throw new FinanceValidationError("An expense must record a payment in an account.");
  if (input.total === "0.0000")
    throw new FinanceValidationError("Expense total must be greater than zero.");
  return input;
}
