import { prisma } from "@/lib/prisma";
import { FINANCE_USER_ID } from "./server";
import { FinanceValidationError } from "./validation";
import { incomeSourceSelect, deductionTypeSelect } from "./income-server";
import type { incomeConfigInput } from "./income";

export async function listIncomeConfig(source: boolean) {
  const where = { userId: FINANCE_USER_ID },
    orderBy = [{ active: "desc" as const }, { name: "asc" as const }];
  return source
    ? {
        sourceTypes: await prisma.financialIncomeSourceType.findMany({
          where,
          orderBy,
          select: { id: true, name: true, active: true, legacyKind: true },
        }),
        sources: await prisma.financialIncomeSource.findMany({
          where,
          select: incomeSourceSelect,
          orderBy,
        }),
      }
    : {
        types: await prisma.financialDeductionType.findMany({
          where,
          select: deductionTypeSelect,
          orderBy,
        }),
      };
}
export async function getIncomeConfig(source: boolean, id: number) {
  const where = { id, userId: FINANCE_USER_ID };
  const item = source
    ? await prisma.financialIncomeSource.findFirst({ where, select: incomeSourceSelect })
    : await prisma.financialDeductionType.findFirst({ where, select: deductionTypeSelect });
  if (!item) throw new FinanceValidationError("Income setting not found.", 404);
  return source ? { source: item } : { type: item };
}
export async function saveIncomeConfig(
  source: boolean,
  data: ReturnType<typeof incomeConfigInput>,
  id?: number,
) {
  return prisma.$transaction(
    async (db) => {
      if (source) {
        const current =
          id === undefined
            ? null
            : await db.financialIncomeSource.findFirst({ where: { id, userId: FINANCE_USER_ID } });
        if (id !== undefined && !current)
          throw new FinanceValidationError("Income source not found.", 404);
        const selectedType =
          data.typeId !== undefined || data.kind !== undefined
            ? await db.financialIncomeSourceType.findFirst({
                where: {
                  userId: FINANCE_USER_ID,
                  ...(data.typeId !== undefined ? { id: data.typeId } : { legacyKind: data.kind }),
                },
              })
            : null;
        if (
          (data.typeId !== undefined || data.kind !== undefined || id === undefined) &&
          !selectedType
        )
          throw new FinanceValidationError("Choose an income source type belonging to you.");
        if (selectedType && !selectedType.active && current?.typeId !== selectedType.id)
          throw new FinanceValidationError("Choose an active income source type.");
        const sourceData = {
          name: data.name,
          normalizedName: data.normalizedName,
          active: data.active,
          ...(selectedType
            ? { typeId: selectedType.id, kind: selectedType.legacyKind ?? ("OTHER" as const) }
            : {}),
        };
        const saved =
          id === undefined
            ? await db.financialIncomeSource.create({
                data: {
                  userId: FINANCE_USER_ID,
                  name: data.name!,
                  normalizedName: data.normalizedName!,
                  kind: selectedType?.legacyKind ?? "OTHER",
                  typeId: selectedType!.id,
                  active: data.active,
                },
                select: incomeSourceSelect,
              })
            : await db.financialIncomeSource.update({
                where: { id, userId: FINANCE_USER_ID },
                data: sourceData,
                select: incomeSourceSelect,
              });
        return { source: saved };
      }
      const typeData = {
        name: data.name,
        normalizedName: data.normalizedName,
        active: data.active,
      };
      const saved =
        id === undefined
          ? await db.financialDeductionType.create({
              data: {
                userId: FINANCE_USER_ID,
                name: data.name!,
                normalizedName: data.normalizedName!,
                active: data.active,
              },
              select: deductionTypeSelect,
            })
          : await db.financialDeductionType.update({
              where: { id, userId: FINANCE_USER_ID },
              data: typeData,
              select: deductionTypeSelect,
            });
      return { type: saved };
    },
    { isolationLevel: "Serializable" },
  );
}
