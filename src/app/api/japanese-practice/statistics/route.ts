import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { torontoDateKey, shiftDateKey, torontoMidnight } from "@/lib/japanese/dates";
import { vocabularyProgress } from "@/lib/japanese/vocabulary-progress";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";
import { buildJapaneseStatistics, statisticsStartDate } from "@/lib/japanese/statistics";

export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;

  const period = new URL(request.url).searchParams.get("period") || "month";
  if (period !== "month" && period !== "year") {
    return NextResponse.json({ error: "Choose month or year." }, { status: 400 });
  }
  try {
    const userId = 1;
    const now = new Date();
    const today = torontoDateKey(now);
    const data = await prisma.$transaction(async (tx) => {
      await recordJapaneseProgress(tx, userId, now);
      const [practices, vocabulary, activities, snapshots] = await Promise.all([
        tx.practice.findMany({ where: { date: { gte: torontoMidnight(statisticsStartDate(now, period)), lt: torontoMidnight(shiftDateKey(today, 1)) } } }),
        tx.vocabulary.findMany({ where: { userId }, include: { category: true, activityVocab: true, verbForms: { include: { activityVocab: true } } } }),
        tx.activity.findMany({ select: { id: true } }),
        tx.japaneseProgressSnapshot.findMany({ where: { userId, day: { lte: today } }, orderBy: { day: "asc" } }),
      ]);
      return buildJapaneseStatistics(now, practices, vocabulary, vocabularyProgress(vocabulary, activities.map((activity) => activity.id)), snapshots, period);
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load Japanese statistics", error);
    return NextResponse.json({ error: "Unable to load Japanese statistics. Please try again." }, { status: 500 });
  }
}
