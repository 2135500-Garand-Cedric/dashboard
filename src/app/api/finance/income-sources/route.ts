import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders, financeError } from "@/lib/finance/server";
import { incomeConfigInput } from "@/lib/finance/income";
import { listIncomeConfig, saveIncomeConfig } from "@/lib/finance/income-settings-server";

export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await listIncomeConfig(true), { headers: financeHeaders }); }
  catch (error) { return financeError(error, "load income settings"); }
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await saveIncomeConfig(true, incomeConfigInput(await request.json(), true)), { status: 201, headers: financeHeaders }); }
  catch (error) { return financeError(error, "create the income setting"); }
}
