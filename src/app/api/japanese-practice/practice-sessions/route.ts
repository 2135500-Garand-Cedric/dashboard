import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePracticeSession, savePracticeSession, PracticeSessionError } from "@/lib/japanese/practice-sessions";
import { torontoMidnight, shiftDateKey } from "@/lib/japanese/dates";
import type { PracticeSessionSummary } from "@/lib/japanese/practice-session-types";

export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const input = parsePracticeSession(await request.json());
    const review = await savePracticeSession(input);
    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error("Unable to save practice session", error);
    return NextResponse.json({ success: false, error: error instanceof PracticeSessionError ? error.message : "Unable to save this practice. Your results are still available; please try again." }, { status: error instanceof PracticeSessionError ? error.status : 500 });
  }
}

export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  const params = new URL(request.url).searchParams;
  const date = params.get("date") || "";
  const kind = params.get("kind") || "vocab";
  const range = params.get("range") || "day";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date || !["day", "month"].includes(range) || !["vocab", "kanji"].includes(kind)) {
    return NextResponse.json({ error: "Choose a valid date and practice type." }, { status: 400 });
  }
  try {
    const start = range === "month" ? `${date.slice(0, 7)}-01` : date;
    const nextMonth = new Date(`${start}T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const end = range === "month" ? nextMonth.toISOString().slice(0, 10) : shiftDateKey(date, 1);
    const practices = await prisma.practice.findMany({
      where: { userId: 1, activityId: kind === "kanji" ? 5 : { not: 5 }, date: { gte: torontoMidnight(start), lt: torontoMidnight(end) } },
      select: {
        id: true, activityId: true, activityName: true, activity: { select: { activity: true } }, date: true, startedAt: true, completedAt: true,
        durationSeconds: true, wordCount: true, weakCount: true, goodCount: true, perfectCount: true, averageBefore: true, averageAfter: true, sessionKey: true,
      }, orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    const sessions: PracticeSessionSummary[] = practices.map(practice => ({
      id: practice.id, activityId: practice.activityId, activityName: practice.activityName ?? practice.activity.activity,
      date: practice.date.toISOString(), startedAt: practice.startedAt?.toISOString() ?? null, completedAt: practice.completedAt?.toISOString() ?? null,
      durationSeconds: practice.durationSeconds, wordCount: practice.wordCount,
      weakCount: practice.weakCount, goodCount: practice.goodCount, perfectCount: practice.perfectCount,
      averageBefore: practice.averageBefore, averageAfter: practice.averageAfter, hasDetails: practice.sessionKey !== null,
    }));
    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load practice history", error);
    return NextResponse.json({ error: "Unable to load practice history. Please try again." }, { status: 500 });
  }
}
