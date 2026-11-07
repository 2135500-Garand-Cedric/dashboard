import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import { transactionError } from "@/lib/finance/transaction-server";
import { getStatement, updateStatement, deleteStatement } from "@/lib/finance/statement-server";
import { statementJson } from "@/lib/finance/statement-files";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json({ batch: await getStatement(financeId((await context.params).id)) }, { headers: financeHeaders }); }
  catch (error) { return transactionError(error, "load the statement import"); }
}
export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json({ batch: await updateStatement(financeId((await context.params).id), await statementJson(request)) }, { headers: financeHeaders }); }
  catch (error) { return transactionError(error, "save statement review"); }
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    await deleteStatement(financeId((await context.params).id), Number(request.headers.get("If-Match")));
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) { return transactionError(error, "delete the draft import"); }
}
