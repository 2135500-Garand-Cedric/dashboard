import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ActivityVocabStatus } from "@/generated/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { english, japanese, hiragana, categoryId } = body;

    // TODO: Replace with session/userId logic
    const userId = 1;

    if (!english || !japanese || !hiragana || !categoryId) {
      return NextResponse.json(
        { success: false, error: "All fields are required" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Insert new vocabulary
      const vocab = await tx.vocabulary.create({
        data: {
          english,
          japanese,
          hiragana,
          categoryId,
          userId,
        },
      });

      // 2️⃣ Insert a row in activity_vocab for each activity
      const activities = await tx.activity.findMany({ select: { id: true } });
      const activityVocabData = activities.map((a) => ({
        activityId: a.id,
        vocabId: vocab.id,
        status: ActivityVocabStatus.WEAK,
      }));

      await tx.activityVocab.createMany({
        data: activityVocabData,
      });

      return vocab;
    });

    return NextResponse.json({ success: true, vocabulary: result });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error },
      { status: 500 }
    );
  }
}
