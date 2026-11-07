import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { incomeInput } from "@/lib/finance/income";
import { receiptFormData } from "@/lib/finance/receipt-files";
import { listIncome, saveIncome, incomeError } from "@/lib/finance/income-server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await listIncome(new URL(request.url).searchParams), { headers: financeHeaders }); }
  catch (error) { return incomeError(error, "load income records"); }
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const form = await receiptFormData(request, "Income");
    const result = await saveIncome(incomeInput(form.details), form.file);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: financeHeaders });
  } catch (error) { return incomeError(error, "save the income record"); }
}
