// GET /api/activity/progress
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const userId = 1;

  try {
    // 🔠 Get known kanji (your logic)
    const knownKanjiVocab = await prisma.vocabulary.findMany({
      where: {
        userId,
        category: {
          name: "Kanji",
        },
      },
      select: {
        japanese: true,
      },
    });

    const knownKanjiSet = new Set(
      knownKanjiVocab.flatMap((v) =>
        v.japanese ? [...v.japanese] : []
      )
    );

    const isHiragana = (char: string) =>
      char >= "\u3040" && char <= "\u309F";

    const isKatakana = (char: string) =>
      char >= "\u30A0" && char <= "\u30FF";

    // 🧠 Get ALL activities with their vocab
    const activities = await prisma.activity.findMany({
      include: {
        activityVocab: {
          include: {
            vocab: true,
            verbForm: {
              include: {
                baseVocab: true,
              },
            },
          },
        },
      },
    });

    const scoreMap: Record<string, number> = {
      PERFECT: 1,
      GOOD: 0.5,
      WEAK: 0,
    };

    let globalScore = 0;
    let globalCount = 0;

    const result = activities.map((activity) => {
      let items = activity.activityVocab;

      // 🔥 Special rule for activity 5
      if (activity.id === 5) {
        items = items.filter((item) => {
          const text =
            item.vocab?.japanese ||
            item.verbForm?.form ||
            item.verbForm?.baseVocab?.japanese;

          if (!text) return false;

          let hasKnownKanji = false;

          for (const char of text) {
            if (knownKanjiSet.has(char)) {
              hasKnownKanji = true;
            } else if (!isHiragana(char) && !isKatakana(char)) {
              return false;
            }
          }

          return hasKnownKanji;
        });
      }

      if (items.length === 0) {
        return {
          activityId: activity.id,
          percentage: 0,
        };
      }

      let totalScore = 0;

      for (const item of items) {
        const score = scoreMap[item.status] ?? 0;

        totalScore += score;
        globalScore += score;
        globalCount++;
      }


      const percentage = ((totalScore / items.length) * 100).toFixed(2);

      return {
        activity: activity.activity,
        percentage: percentage,
      };
    });

    const overallPercentage = ((globalScore / globalCount) * 100).toFixed(2);


    return NextResponse.json({ success: true, stats: result, overallPercentage });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch activity progress" },
      { status: 500 }
    );
  }
}
