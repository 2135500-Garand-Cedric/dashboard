import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { transactionError } from "@/lib/finance/transaction-server";
import { createStatement, listStatements } from "@/lib/finance/statement-server";
import { statementUpload } from "@/lib/finance/statement-files";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try { return NextResponse.json(await listStatements(new URL(request.url).searchParams), { headers: financeHeaders }); }
  catch (error) { return transactionError(error, "load statement imports"); }
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const form = await statementUpload(request);
    const result = await createStatement(form.input.accountId, form.parsed, form.file);
    return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: financeHeaders });
  } catch (error) { return transactionError(error, "upload the statement CSV"); }
}
