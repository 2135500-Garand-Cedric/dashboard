import type { FinanceTransaction } from "./transactions";
import type { FinanceReceipt } from "./receipts";
import type { FinanceIncome } from "./income";

// Text cells are spreadsheet-safe; amounts stay exact machine-readable decimals.
export type CsvCell = string | number | null | { decimal: string };
export function csv(rows: CsvCell[][]) {
  return "\uFEFF" + rows.map(row => row.map(value => {
    let text: string;
    if (value && typeof value === "object") {
      if (!/^-?\d+(?:\.\d{1,4})?$/.test(value.decimal)) throw new Error("Invalid export decimal.");
      text = value.decimal;
    } else {
      text = String(value ?? "");
      if (/^[\s\x00-\x1f\x7f]*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
const amount = (value: string) => ({ decimal: value });
const associations = (row: FinanceReceipt | FinanceIncome) => JSON.stringify(row.allocations?.length ? row.allocations.map(link => ({ transactionId: link.transactionId, amount: link.amount })) : row.transaction ? [{ transactionId: row.transaction.id, amount: "total" in row ? row.total : row.netAmount }] : []);
export function transactionCsv(rows: FinanceTransaction[]) {
  return csv([["ID", "Date", "Description", "Type", "Account ID", "Account", "Currency", "Original amount", "Counted amount", "Excluded duplicate amount", "Category", "Merchant/counterparty", "Source", "Notes", "Transfer ID", "Destination transaction ID", "Destination account", "Destination currency", "Destination counted amount"], ...rows.map(row => [row.id, row.date, row.description, row.type, row.account.id, row.account.name, row.currency, amount(row.amount), amount(row.ledgerAmount), amount(row.excludedAmount), row.category?.name ?? null, row.counterparty, row.source, row.notes, row.transfer?.id ?? null, row.transfer?.transactionId ?? null, row.transfer?.account.name ?? null, row.transfer?.currency ?? null, row.transfer ? amount(row.transfer.ledgerAmount) : null])]);
}
export function receiptCsv(rows: FinanceReceipt[]) {
  return csv([["ID", "Purchase date", "Merchant", "Account", "Category", "Currency", "Subtotal", "Tax", "Tip", "Total", "Notes", "Confirmed transaction allocations (JSON)", "Original filename", "Original document URL"], ...rows.map(row => [row.id, row.date, row.merchant, row.account?.name ?? null, row.category?.name ?? null, row.currency, amount(row.subtotal), amount(row.tax), amount(row.tip), amount(row.total), row.notes, associations(row), row.document?.originalName ?? null, row.document ? `/api/finance/receipts/${row.id}/document?download=1` : null])]);
}
export function incomeCsv(rows: FinanceIncome[]) {
  return csv([["ID", "Pay date", "Description", "Source", "Source type", "Account", "Category", "Currency", "Period start", "Period end", "Gross (blank if unknown)", "Net pay", "Deductions total", "Deductions (JSON)", "Notes", "Confirmed deposit allocations (JSON)", "Original filename", "Original document URL"], ...rows.map(row => [row.id, row.date, row.description, row.source?.name ?? null, row.source?.kind ?? null, row.account?.name ?? null, row.category?.name ?? null, row.currency, row.periodStart, row.periodEnd, row.grossAmount === null ? null : amount(row.grossAmount), amount(row.netAmount), amount(row.deductionsTotal), JSON.stringify(row.deductions), row.notes, associations(row), row.document?.originalName ?? null, row.document ? `/api/finance/income/${row.id}/document?download=1` : null])]);
}
