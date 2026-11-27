import { auditedCommand } from "@/lib/audit/command";
import { requireOwner } from "@/lib/require-owner";
import { prisma } from "@/lib/prisma";
import { incomeConfigInput } from "@/lib/finance/income";
import { FINANCE_USER_ID, financeError, financeHeaders } from "@/lib/finance/server";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const types = await prisma.financialIncomeSourceType.findMany({
      where: { userId: FINANCE_USER_ID },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    });
    return Response.json({ types }, { headers: financeHeaders });
  } catch (error) {
    return financeError(error, "load income source types");
  }
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const data = incomeConfigInput(await request.json(), false);
    const type = await prisma.$transaction(
      (db) =>
        auditedCommand(
          db,
          {
            model: "financialIncomeSourceType",
            category: "FINANCE",
            entityType: "income-type",
            label: "Income source type",
          },
          async () =>
            db.financialIncomeSourceType.create({
              data: {
                userId: FINANCE_USER_ID,
                name: data.name!,
                normalizedName: data.normalizedName!,
                active: data.active,
              },
              select: { id: true, name: true, active: true },
            }),
        ),
      { isolationLevel: "Serializable" },
    );
    return Response.json({ type }, { status: 201, headers: financeHeaders });
  } catch (error) {
    return financeError(error, "create the income source type");
  }
}
