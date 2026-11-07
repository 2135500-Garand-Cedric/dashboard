import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { transactionError } from "@/lib/finance/transaction-server";
import { listReconciliation, decideMatch } from "@/lib/finance/reconciliation-server";
import { matchInput } from "@/lib/finance/reconciliation";
import { statementJson } from "@/lib/finance/statement-files";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await listReconciliation(new URL(request.url).searchParams), { headers: financeHeaders }); }
  catch (error) { return transactionError(error, "load reconciliation records"); }
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await decideMatch(matchInput(await statementJson(request))), { headers: financeHeaders }); }
  catch (error) { return transactionError(error, "save the reconciliation decision"); }
}
