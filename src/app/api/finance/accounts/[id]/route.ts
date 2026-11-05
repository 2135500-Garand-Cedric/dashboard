import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accountInput, financeId, FinanceValidationError } from "@/lib/finance/validation";
import { FINANCE_USER_ID, financeError, financeHeaders, accountSelect } from "@/lib/finance/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id);
    const account = await prisma.financialAccount.findFirst({ where: { id, userId: FINANCE_USER_ID }, select: accountSelect });
    if (!account) throw new FinanceValidationError("Account not found.", 404);
    return NextResponse.json({ account }, { headers: financeHeaders });
  } catch (error) { return financeError(error, "load the account"); }
}

export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id);
    const data = accountInput(await request.json(), true);
    const account = await prisma.$transaction(async tx => {
      const current = await tx.financialAccount.findFirst({ where: { id, userId: FINANCE_USER_ID }, include: { _count: { select: { transactions: true, receipts: true, incomeRecords: true, imports: true } } } });
      if (!current) throw new FinanceValidationError("Account not found.", 404);
      if (data.currency && data.currency !== current.currency && Object.values(current._count).some(count => count > 0)) throw new FinanceValidationError("Currency cannot change once an account has financial records. Create a separate account for the new currency.", 409);
      return tx.financialAccount.update({ where: { id, userId: FINANCE_USER_ID }, data, select: accountSelect });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ account }, { headers: financeHeaders });
  } catch (error) { return financeError(error, "update the account"); }
}
