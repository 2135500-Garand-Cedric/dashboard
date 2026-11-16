import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { expenseInput } from "@/lib/finance/expenses";
import { receiptFormData } from "@/lib/finance/receipt-files";
import { saveReceipt, receiptError } from "@/lib/finance/receipt-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const form = await receiptFormData(request, "Expense");
    const result = await saveReceipt(expenseInput(form.details), form.file);
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: financeHeaders,
    });
  } catch (error) {
    return receiptError(error, "save the expense");
  }
}
