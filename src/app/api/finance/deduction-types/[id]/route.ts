import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders, financeError } from "@/lib/finance/server";
import { incomeConfigInput } from "@/lib/finance/income";
import { financeId } from "@/lib/finance/validation";
import { getIncomeConfig, saveIncomeConfig } from "@/lib/finance/income-settings-server";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await getIncomeConfig(false, financeId((await context.params).id)), { headers: financeHeaders }); }
  catch (error) { return financeError(error, "load the income setting"); }
}
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await saveIncomeConfig(false, incomeConfigInput(await request.json(), false, true), financeId((await context.params).id)), { headers: financeHeaders }); }
  catch (error) { return financeError(error, "update the income setting"); }
}
