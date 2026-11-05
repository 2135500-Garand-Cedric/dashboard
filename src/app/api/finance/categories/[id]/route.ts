import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoryInput, financeId, FinanceValidationError } from "@/lib/finance/validation";
import { FINANCE_USER_ID, financeError, financeHeaders, categorySelect } from "@/lib/finance/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id);
    const category = await prisma.financeCategory.findFirst({ where: { id, userId: FINANCE_USER_ID }, select: categorySelect });
    if (!category) throw new FinanceValidationError("Category not found.", 404);
    return NextResponse.json({ category }, { headers: financeHeaders });
  } catch (error) { return financeError(error, "load the category"); }
}

export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id);
    const data = categoryInput(await request.json(), true);
    const category = await prisma.$transaction(async tx => {
      const current = await tx.financeCategory.findFirst({ where: { id, userId: FINANCE_USER_ID }, include: { _count: { select: { transactions: true, receipts: true, incomeRecords: true } } } });
      if (!current) throw new FinanceValidationError("Category not found.", 404);
      if (data.type && data.type !== current.type && Object.values(current._count).some(count => count > 0)) throw new FinanceValidationError("This category has financial records. Its Income/Expense type cannot change; create a new category instead.", 409);
      return tx.financeCategory.update({ where: { id, userId: FINANCE_USER_ID }, data, select: categorySelect });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ category }, { headers: financeHeaders });
  } catch (error) { return financeError(error, "update the category"); }
}

export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const id = financeId((await context.params).id);
    await prisma.financeCategory.delete({ where: { id, userId: FINANCE_USER_ID } });
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) { return financeError(error, "delete the category"); }
}
