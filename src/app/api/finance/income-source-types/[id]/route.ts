import { requireOwner } from "@/lib/require-owner";
import { prisma } from "@/lib/prisma";
import { incomeConfigInput } from "@/lib/finance/income";
import { financeId } from "@/lib/finance/validation";
import { FINANCE_USER_ID, financeError, financeHeaders } from "@/lib/finance/server";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const id = financeId((await context.params).id),
      data = incomeConfigInput(await request.json(), false, true);
    const type = await prisma.financialIncomeSourceType.update({
      where: { id, userId: FINANCE_USER_ID },
      data: { name: data.name, normalizedName: data.normalizedName, active: data.active },
      select: { id: true, name: true, active: true },
    });
    return Response.json({ type }, { headers: financeHeaders });
  } catch (error) {
    return financeError(error, "update the income source type");
  }
}
