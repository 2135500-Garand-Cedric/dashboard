import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: fetch today's practice records
export async function GET() {
  try {
    // 1️⃣ Get start & end of today
    const now = new Date();

    // Get Toronto time as string
    const torontoNow = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Toronto" })
    );

    // Start of Toronto day
    const startOfDayToronto = new Date(torontoNow);
    startOfDayToronto.setHours(0, 0, 0, 0);

    // End of Toronto day
    const endOfDayToronto = new Date(torontoNow);
    endOfDayToronto.setHours(23, 59, 59, 999);

    // Convert back to UTC
    const startOfDay = new Date(startOfDayToronto.toISOString());
    const endOfDay = new Date(endOfDayToronto.toISOString());


    // 2️⃣ Fetch only today's practices
    const practices = await prisma.practice.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
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
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
