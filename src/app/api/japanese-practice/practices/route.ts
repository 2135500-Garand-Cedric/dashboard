import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { torontoDayRange } from "@/lib/japanese/dates";

// GET: fetch today's practice records
export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;

  try {
    const { start, end } = torontoDayRange();

    // 2️⃣ Fetch only today's practices
    const practices = await prisma.practice.findMany({
      where: {
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
    console.error(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to load practices" },
      { status: 500 }
    );
  }
}
