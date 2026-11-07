import { requireOwner } from "@/lib/require-owner";
import { FinanceValidationError } from "@/lib/finance/validation";
import { financeHeaders } from "@/lib/finance/server";
import { listTransactions, transactionError } from "@/lib/finance/transaction-server";
import { listReceipts } from "@/lib/finance/receipt-server";
import { listIncome } from "@/lib/finance/income-server";
import { transactionCsv, receiptCsv, incomeCsv } from "@/lib/finance/csv-export";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const { kind } = await context.params, params = new URL(request.url).searchParams;
    params.delete("page");
    let output: string;
    if (kind === "transactions") output = transactionCsv((await listTransactions(params, true)).transactions);
    else if (kind === "receipts") output = receiptCsv((await listReceipts(params, true)).receipts);
    else if (kind === "income") output = incomeCsv((await listIncome(params, true)).records);
    else throw new FinanceValidationError("Choose transactions, receipts or income for export.", 404);
    if (Buffer.byteLength(output) > 20 * 1024 * 1024) throw new FinanceValidationError("Export is too large. Narrow the date range or filters.", 413);
    return new Response(output, { headers: { ...financeHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="finance-${kind}.csv"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return transactionError(error, "export financial records"); }
}
