import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const accessError = await requirePermission("japanese.vocabulary.read");
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    const activities = await prisma.activity.findMany({
      select: { id: true, activity: true },
      orderBy: { id: "asc" },
    });
    return NextResponse.json(activities);
  });
}
