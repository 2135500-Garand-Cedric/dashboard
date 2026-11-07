import { prisma } from "@/lib/prisma";
import { FINANCE_USER_ID } from "./server";
import { FinanceValidationError } from "./validation";
import { incomeSourceSelect, deductionTypeSelect } from "./income-server";
import type { incomeConfigInput } from "./income";

export async function listIncomeConfig(source: boolean) {
  const where = { userId: FINANCE_USER_ID }, orderBy = [{ active: "desc" as const }, { name: "asc" as const }];
  return source ? { sources: await prisma.financialIncomeSource.findMany({ where, select: incomeSourceSelect, orderBy }) } : { types: await prisma.financialDeductionType.findMany({ where, select: deductionTypeSelect, orderBy }) };
}
export async function getIncomeConfig(source: boolean, id: number) {
  const where = { id, userId: FINANCE_USER_ID };
  const item = source ? await prisma.financialIncomeSource.findFirst({ where, select: incomeSourceSelect }) : await prisma.financialDeductionType.findFirst({ where, select: deductionTypeSelect });
  if (!item) throw new FinanceValidationError("Income setting not found.", 404);
  return source ? { source: item } : { type: item };
}
export async function saveIncomeConfig(source: boolean, data: ReturnType<typeof incomeConfigInput>, id?: number) {
  return prisma.$transaction(async db => {
    if (source) {
      if (id !== undefined) {
        const current = await db.financialIncomeSource.findFirst({ where: { id, userId: FINANCE_USER_ID }, include: { _count: { select: { records: true } } } });
        if (!current) throw new FinanceValidationError("Income source not found.", 404);
        if (data.kind && data.kind !== current.kind && current._count.records > 0) throw new FinanceValidationError("This source has income history. Create a new source to use a different income type.", 409);
      }
      const saved = id === undefined ? await db.financialIncomeSource.create({ data: { userId: FINANCE_USER_ID, name: data.name!, normalizedName: data.normalizedName!, kind: data.kind!, active: data.active }, select: incomeSourceSelect }) : await db.financialIncomeSource.update({ where: { id, userId: FINANCE_USER_ID }, data, select: incomeSourceSelect });
      return { source: saved };
    }
    const typeData = { name: data.name, normalizedName: data.normalizedName, active: data.active };
    const saved = id === undefined ? await db.financialDeductionType.create({ data: { userId: FINANCE_USER_ID, name: data.name!, normalizedName: data.normalizedName!, active: data.active }, select: deductionTypeSelect }) : await db.financialDeductionType.update({ where: { id, userId: FINANCE_USER_ID }, data: typeData, select: deductionTypeSelect });
    return { type: saved };
  }, { isolationLevel: "Serializable" });
}
