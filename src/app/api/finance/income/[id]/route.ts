import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import { incomeInput } from "@/lib/finance/income";
import { receiptFormData } from "@/lib/finance/receipt-files";
import { getIncome, saveIncome, deleteIncome, incomeError } from "@/lib/finance/income-server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json({ record: await getIncome(financeId((await context.params).id)) }, { headers: financeHeaders }); }
  catch (error) { return incomeError(error, "load the income record"); }
}
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id), form = await receiptFormData(request, "Income");
    return NextResponse.json(await saveIncome(incomeInput(form.details, true), form.file, id), { headers: financeHeaders });
  } catch (error) { return incomeError(error, "update the income record"); }
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    await deleteIncome(financeId((await context.params).id), false, request.headers.get("If-Match"));
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) { return incomeError(error, "delete the income record"); }
}
