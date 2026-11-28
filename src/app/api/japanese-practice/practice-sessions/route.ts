import { japaneseRequestError } from "@/lib/japanese/request-error";

import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parsePracticeSession,
  savePracticeSession,
  PracticeSessionError,
} from "@/lib/japanese/practice-sessions";
import { torontoMidnight, shiftDateKey } from "@/lib/japanese/dates";
import type { PracticeSessionSummary } from "@/lib/japanese/practice-session-types";

export async function POST(request: Request) {
  const accessError = await requirePermission("japanese.practice", request);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    const startedAt = Date.now();
    try {
      const input = parsePracticeSession(await request.json());
      const review = await savePracticeSession(input, currentUserId());
      return NextResponse.json({ success: true, review });
    } catch (error) {
      const failure =
        error instanceof PracticeSessionError
          ? null
          : japaneseRequestError(error, "save practice", startedAt);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof PracticeSessionError
              ? error.message
              : failure!.error,
          ...(failure ? { code: failure.code } : {}),
        },
        {
          status:
            error instanceof PracticeSessionError
              ? error.status
              : failure!.status,
        },
      );
    }
  });
}

export async function GET(request: Request) {
  const accessError = await requirePermission("japanese.history.read", request);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    const params = new URL(request.url).searchParams;
    const date = params.get("date") || "";
    const kind = params.get("kind") || "vocab";
    const range = params.get("range") || "day";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
      new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date ||
      !["day", "month"].includes(range) ||
      !["vocab", "kanji"].includes(kind)
    ) {
      return NextResponse.json(
        { error: "Choose a valid date and practice type." },
        { status: 400 },
      );
    }
    try {
      const start = range === "month" ? `${date.slice(0, 7)}-01` : date;
      const nextMonth = new Date(`${start}T12:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const end =
        range === "month"
          ? nextMonth.toISOString().slice(0, 10)
          : shiftDateKey(date, 1);
      const practices = await prisma.practice.findMany({
        where: {
          userId: currentUserId(),
          activityId: kind === "kanji" ? 5 : { not: 5 },
          date: { gte: torontoMidnight(start), lt: torontoMidnight(end) },
        },
        select: {
          id: true,
          activityId: true,
          activityName: true,
          activity: { select: { activity: true } },
          date: true,
          startedAt: true,
          completedAt: true,
          durationSeconds: true,
          wordCount: true,
          weakCount: true,
          goodCount: true,
          perfectCount: true,
          averageBefore: true,
          averageAfter: true,
          sessionKey: true,
          xpEarned: true,
          goldEarned: true,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
      const sessions: PracticeSessionSummary[] = practices.map((practice) => ({
        id: practice.id,
        activityId: practice.activityId,
        activityName: practice.activityName ?? practice.activity.activity,
        date: practice.date.toISOString(),
        startedAt: practice.startedAt?.toISOString() ?? null,
        completedAt: practice.completedAt?.toISOString() ?? null,
        durationSeconds: practice.durationSeconds,
        wordCount: practice.wordCount,
        weakCount: practice.weakCount,
        goodCount: practice.goodCount,
        perfectCount: practice.perfectCount,
        averageBefore: practice.averageBefore,
        averageAfter: practice.averageAfter,
        xpEarned: practice.xpEarned,
        goldEarned: practice.goldEarned,
        hasDetails: practice.sessionKey !== null,
      }));
      return NextResponse.json(
        { sessions },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      console.error("Unable to load practice history");
      return NextResponse.json(
        { error: "Unable to load practice history. Please try again." },
        { status: 500 },
      );
    }
  });
}
