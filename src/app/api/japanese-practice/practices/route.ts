import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { torontoDayRange } from "@/lib/japanese/dates";

// GET: fetch today's practice records
export async function GET() {
  const accessError = await requirePermission("japanese.statistics.read");
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const { start, end } = torontoDayRange();

      // 2️⃣ Fetch only today's practices
      const practices = await prisma.practice.findMany({
        where: {
          userId: currentUserId(),
          date: {
            gte: start,
            lt: end,
          },
        },
        include: {
          activity: true,
        },
        orderBy: { date: "desc" },
      });

      // 3️⃣ Transform result
      const result = practices.map((p) => ({
        id: p.id,
        activityId: p.activityId,
        date: p.date.toISOString(),
        wordCount: p.wordCount,
        perfectCount: p.perfectCount,
        goodCount: p.goodCount,
        weakCount: p.weakCount,
        activityName: p.activity?.activity || null,
      }));

      return NextResponse.json({ success: true, practices: result });
    } catch (error: unknown) {
      console.error("Japanese operation failed.");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error && !("code" in error)
              ? error.message
              : "Unable to load practices",
        },
        { status: 500 },
      );
    }
  });
}
