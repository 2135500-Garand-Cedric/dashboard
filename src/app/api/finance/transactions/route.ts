import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { transactionInput } from "@/lib/finance/transactions";
import { listTransactions, saveTransaction, transactionError } from "@/lib/finance/transaction-server";

export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    return NextResponse.json(await listTransactions(new URL(request.url).searchParams), { headers: financeHeaders });
  } catch (error) { return transactionError(error, "load transactions"); }
}

export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const result = await saveTransaction(transactionInput(await request.json()));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: financeHeaders });
  } catch (error) { return transactionError(error, "save the transaction"); }
}
