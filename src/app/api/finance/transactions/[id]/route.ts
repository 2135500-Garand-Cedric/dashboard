import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import { transactionInput } from "@/lib/finance/transactions";
import { getTransaction, saveTransaction, deleteTransaction, transactionError } from "@/lib/finance/transaction-server";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const transaction = await getTransaction(financeId((await context.params).id));
    return NextResponse.json({ transaction }, { headers: financeHeaders });
  } catch (error) { return transactionError(error, "load the transaction"); }
}

export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id);
    const result = await saveTransaction(transactionInput(await request.json(), true), id);
    return NextResponse.json(result, { headers: financeHeaders });
  } catch (error) { return transactionError(error, "update the transaction"); }
}

export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    await deleteTransaction(financeId((await context.params).id));
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) { return transactionError(error, "delete the transaction"); }
}
