import type { TransactionType } from "./transactions";

export function activityHref(id: number | string, type: TransactionType | string): string {
  if (type === "INCOME") return `/finance/income/deposits/${id}`;
  if (type === "EXPENSE" || type === "REFUND") return `/finance/expenses/${id}`;
  if (type === "TRANSFER") return `/finance/transfers/${id}`;
  return `/finance/transactions/${id}`;
}
