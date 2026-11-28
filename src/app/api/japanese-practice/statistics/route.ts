import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  torontoDateKey,
  shiftDateKey,
  torontoMidnight,
} from "@/lib/japanese/dates";
import { japaneseRequestError } from "@/lib/japanese/request-error";
import {
  vocabularyProgress,
  readJapaneseVocabulary,
} from "@/lib/japanese/vocabulary-progress";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";
import {
  buildJapaneseStatistics,
  statisticsStartDate,
} from "@/lib/japanese/statistics";

export async function GET(request: Request) {
  const accessError = await requirePermission(
    "japanese.statistics.read",
    request,
  );
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    const period = new URL(request.url).searchParams.get("period") || "month";
    if (period !== "month" && period !== "year") {
      return NextResponse.json(
        { error: "Choose month or year." },
        { status: 400 },
      );
    }
    const startedAt = Date.now();
    try {
      const userId = currentUserId();
      const now = new Date();
      const today = torontoDateKey(now);
      const data = await prisma.$transaction(
        async (tx) => {
          const [practices, vocabulary, activities, snapshots] =
            await Promise.all([
              tx.practice.findMany({
                select: {
                  date: true,
                  activityId: true,
                  perfectCount: true,
                  goodCount: true,
                  weakCount: true,
                  wordCount: true,
                },
                where: {
                  userId,
                  date: {
                    gte: torontoMidnight(statisticsStartDate(now, period)),
                    lt: torontoMidnight(shiftDateKey(today, 1)),
                  },
                },
              }),
              readJapaneseVocabulary(tx, userId),
              tx.activity.findMany({ select: { id: true } }),
              tx.japaneseProgressSnapshot.findMany({
                where: { userId, day: { lte: today } },
                orderBy: { day: "asc" },
              }),
            ]);
          const progress = vocabularyProgress(
            vocabulary,
            activities.map((activity) => activity.id),
          );
          const snapshot = await recordJapaneseProgress(tx, userId, now, {
            average: progress.length
              ? progress.reduce((sum, word) => sum + word.percentage, 0) /
                progress.length
              : 0,
            vocabularyCount: vocabulary.length,
          });
          return buildJapaneseStatistics(
            now,
            practices,
            vocabulary,
            progress,
            [...snapshots.filter((item) => item.day !== today), snapshot],
            period,
          );
        },
        { isolationLevel: "RepeatableRead", timeout: 20000, maxWait: 10000 },
      );
      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const failure = japaneseRequestError(error, "statistics", startedAt);
      return NextResponse.json(
        { error: failure.error, code: failure.code },
        { status: failure.status, headers: { "Cache-Control": "no-store" } },
      );
    }
  });
}
