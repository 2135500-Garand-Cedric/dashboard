import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accountInput } from "@/lib/finance/validation";
import { FINANCE_USER_ID, financeError, financeHeaders, accountSelect } from "@/lib/finance/server";

export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const accounts = await prisma.financialAccount.findMany({ where: { userId: FINANCE_USER_ID }, select: accountSelect, orderBy: [{ active: "desc" }, { name: "asc" }] });
    return NextResponse.json({ accounts }, { headers: financeHeaders });
  } catch (error) { return financeError(error, "load accounts"); }
}

export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const data = accountInput(await request.json());
    const account = await prisma.financialAccount.create({ data: { userId: FINANCE_USER_ID, name: data.name!, normalizedName: data.normalizedName!, type: data.type!, currency: data.currency!, maskedIdentifier: data.maskedIdentifier, active: data.active }, select: accountSelect });
    return NextResponse.json({ account }, { status: 201, headers: financeHeaders });
  } catch (error) { return financeError(error, "create the account"); }
}
