import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ActivityVocabStatus } from "@/generated/prisma";
import { conjugateVerb } from "@/lib/japanese/conjugation";

// POST /api/japanese-practice/vocabulary/add
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { english, japanese, hiragana, categoryId, starred, verbType } = body;

    const userId = 1;

    if (!english || !japanese || !hiragana || !categoryId) {
      return NextResponse.json(
        { success: false, error: "All fields are required" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Create base vocab (dictionary form)
      const vocab = await tx.vocabulary.create({
        data: {
          english,
          japanese,
          hiragana,
          categoryId,
          userId,
          starred,
          verbType,
        },
      });

      // 2️⃣ ActivityVocab init
      const activities = await tx.activity.findMany({ select: { id: true } });
      await tx.activityVocab.createMany({
        data: activities.map((a) => ({
          activityId: a.id,
          vocabId: vocab.id,
          status: ActivityVocabStatus.WEAK,
        })),
      });

      // 3️⃣ If verb → generate forms
      if (categoryId === 1 && verbType) {
        const forms = conjugateVerb(japanese, hiragana, verbType);

        // get form types from DB
        const formTypes = await tx.verbFormType.findMany();

        const formTypeMap: Record<string, number> = {};
        formTypes.forEach((ft) => {
          formTypeMap[ft.name] = ft.id;
        });

        // Create the verb forms
        await tx.verbForm.createMany({
          data: Object.entries(forms).map(([name, value]) => ({
            baseVocabId: vocab.id,
            formTypeId: formTypeMap[name],
            form: value.form,
            reading: value.reading,
          })),
        });

        // Fetch the created verb forms to get their IDs
        const verbForms = await tx.verbForm.findMany({
          where: { baseVocabId: vocab.id },
          select: { id: true },
        });

        // Link each verb form to all activities in activityVocab
        const activities = await tx.activity.findMany({ select: { id: true } });

        await tx.activityVocab.createMany({
          data: activities.flatMap((a) =>
            verbForms.map((vf) => ({
              activityId: a.id,
              verbFormId: vf.id,
              status: ActivityVocabStatus.WEAK,
            }))
          ),
        });
      }

      return vocab;
    });

    return NextResponse.json({ success: true, vocabulary: result });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
