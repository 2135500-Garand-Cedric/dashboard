import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const activities = await prisma.activity.findMany({
    select: { id: true, activity: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(activities);
}
