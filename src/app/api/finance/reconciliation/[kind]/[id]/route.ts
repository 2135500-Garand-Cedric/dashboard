import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { transactionError } from "@/lib/finance/transaction-server";
import { getReconciliation } from "@/lib/finance/reconciliation-server";
import { matchKind } from "@/lib/finance/reconciliation";
import { financeId } from "@/lib/finance/validation";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const params = await context.params;
    return NextResponse.json(await getReconciliation(matchKind(params.kind), financeId(params.id), new URL(request.url).searchParams), { headers: financeHeaders });
  } catch (error) { return transactionError(error, "load reconciliation matches"); }
}
