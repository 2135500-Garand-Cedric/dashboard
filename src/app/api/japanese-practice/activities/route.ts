import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;

  const activities = await prisma.activity.findMany({
    select: { id: true, activity: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(activities);
}
