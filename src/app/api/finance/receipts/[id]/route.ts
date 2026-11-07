import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import { receiptInput } from "@/lib/finance/receipts";
import { receiptFormData } from "@/lib/finance/receipt-files";
import { getReceipt, saveReceipt, deleteReceipt, receiptError } from "@/lib/finance/receipt-server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json({ receipt: await getReceipt(financeId((await context.params).id)) }, { headers: financeHeaders }); }
  catch (error) { return receiptError(error, "load the receipt"); }
}
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id), form = await receiptFormData(request);
    return NextResponse.json(await saveReceipt(receiptInput(form.details, true), form.file, id), { headers: financeHeaders });
  } catch (error) { return receiptError(error, "update the receipt"); }
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    await deleteReceipt(financeId((await context.params).id), false, request.headers.get("If-Match"));
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) { return receiptError(error, "delete the receipt"); }
}
