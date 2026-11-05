import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoryInput } from "@/lib/finance/validation";
import { FINANCE_USER_ID, financeError, financeHeaders, categorySelect } from "@/lib/finance/server";

export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const categories = await prisma.financeCategory.findMany({ where: { userId: FINANCE_USER_ID }, select: categorySelect, orderBy: [{ type: "asc" }, { active: "desc" }, { name: "asc" }] });
    return NextResponse.json({ categories }, { headers: financeHeaders });
  } catch (error) { return financeError(error, "load categories"); }
}

export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const data = categoryInput(await request.json());
    const category = await prisma.financeCategory.create({ data: { userId: FINANCE_USER_ID, name: data.name!, normalizedName: data.normalizedName!, type: data.type!, active: data.active }, select: categorySelect });
    return NextResponse.json({ category }, { status: 201, headers: financeHeaders });
  } catch (error) { return financeError(error, "create the category"); }
}
