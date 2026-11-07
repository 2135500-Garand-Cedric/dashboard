import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { receiptInput } from "@/lib/finance/receipts";
import { receiptFormData } from "@/lib/finance/receipt-files";
import { listReceipts, saveReceipt, receiptError } from "@/lib/finance/receipt-server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await listReceipts(new URL(request.url).searchParams), { headers: financeHeaders }); }
  catch (error) { return receiptError(error, "load receipts"); }
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const form = await receiptFormData(request);
    const result = await saveReceipt(receiptInput(form.details), form.file);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: financeHeaders });
  } catch (error) { return receiptError(error, "save the receipt"); }
}
