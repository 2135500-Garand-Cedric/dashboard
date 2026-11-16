import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeId } from "@/lib/finance/validation";
import { financeHeaders } from "@/lib/finance/server";
import { expenseInput } from "@/lib/finance/expenses";
import { receiptFormData } from "@/lib/finance/receipt-files";
import { getReceipt, saveReceipt, receiptError } from "@/lib/finance/receipt-server";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id),
      form = await receiptFormData(request, "Expense");
    return NextResponse.json(await saveReceipt(expenseInput(form.details, true), form.file, id), {
      headers: financeHeaders,
    });
  } catch (error) {
    return receiptError(error, "update the expense");
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    return NextResponse.json(
      { receipt: await getReceipt(financeId((await context.params).id)) },
      { headers: financeHeaders },
    );
  } catch (error) {
    return receiptError(error, "load expense details");
  }
}
