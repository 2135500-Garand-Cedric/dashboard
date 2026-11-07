import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { transactionError } from "@/lib/finance/transaction-server";
import { reportFilters } from "@/lib/finance/reporting";
import { financeReport } from "@/lib/finance/reporting-server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await financeReport(reportFilters(new URL(request.url).searchParams)), { headers: financeHeaders }); }
  catch (error) { return transactionError(error, "load financial reports"); }
}
