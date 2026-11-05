import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnownKanji, isKanjiWritingEligible } from "@/lib/japanese/kanji-writing";

export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;

  const userId = 1;
  try {
    const [activities, vocabulary] = await Promise.all([
      prisma.activity.findMany(),
      prisma.vocabulary.findMany({
        where: { userId },
        include: { category: true, activityVocab: true, verbForms: { include: { activityVocab: true } } },
      }),
    ]);
    const knownKanji = getKnownKanji(vocabulary);
    const scores: Record<string, number> = { PERFECT: 1, GOOD: 0.5, WEAK: 0 };
    let globalScore = 0;
    let globalCount = 0;
    const stats = activities.map((activity) => {
      const values: number[] = [];
      for (const word of vocabulary) {
        if (activity.id === 5 && !isKanjiWritingEligible(word.japanese, knownKanji)) continue;
        values.push(scores[word.activityVocab.find((link) => link.activityId === activity.id)?.status || "WEAK"] ?? 0);
        if (activity.id !== 5) {
          for (const form of word.verbForms) {
            values.push(scores[form.activityVocab.find((link) => link.activityId === activity.id)?.status || "WEAK"] ?? 0);
          }
        }
      }
      const sum = values.reduce((total, score) => total + score, 0);
      globalScore += sum;
      globalCount += values.length;
      return { activityId: activity.id, activity: activity.activity, percentage: (values.length ? sum / values.length * 100 : 0).toFixed(2) };
    });
    const overallPercentage = (globalCount ? globalScore / globalCount * 100 : 0).toFixed(2);
    return NextResponse.json({ success: true, stats, overallPercentage });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch activity progress" }, { status: 500 });
  }
}
