import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import { transactionError } from "@/lib/finance/transaction-server";
import { commitStatement } from "@/lib/finance/statement-server";
import { statementJson } from "@/lib/finance/statement-files";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await commitStatement(financeId((await context.params).id), await statementJson(request)), { headers: financeHeaders }); }
  catch (error) { return transactionError(error, "commit the statement import"); }
}
