import { validateReadings, VocabularyReadingError } from "@/lib/japanese/readings";
import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { torontoDayRange } from "@/lib/japanese/dates";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";
import { ActivityVocabStatus } from "@/generated/prisma";
import { conjugateVerb, VerbConjugationError } from "@/lib/japanese/conjugation";

// POST /api/japanese-practice/vocabulary/add
export async function POST(req: Request) {
  const accessError = await requireOwner(req);
  if (accessError) return accessError;

  try {
    const body = await req.json();
    const { english, japanese, categoryId, starred, verbType } = body;
    let { hiragana } = body;

    const userId = 1;

    if (!english || !japanese || !(hiragana || body.readings) || !categoryId) {
      return NextResponse.json(
        { success: false, error: "All fields are required" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id: categoryId } });
      const readings = validateReadings(body.readings, hiragana, category?.name.trim().toLowerCase() === "kanji");
      hiragana = readings[0];
      // 1️⃣ Create base vocab (dictionary form)
      const vocab = await tx.vocabulary.create({
        data: {
          english,
          japanese,
          hiragana,
          readings,
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

      await recordJapaneseProgress(tx, userId);
      return vocab;
    });

    return NextResponse.json({ success: true, vocabulary: result });
  } catch (error: unknown) {
    if (error instanceof VerbConjugationError || error instanceof VocabularyReadingError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error(error);
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "P2002") {
      return NextResponse.json(
        { success: false, error: "A vocabulary entry with the same English meaning and hiragana reading already exists. Edit the existing entry or use a different meaning or reading." },
        { status: 409 }
      );
    }
    if (code === "P2003") {
      return NextResponse.json(
        { success: false, error: "The selected category no longer exists. Refresh the page and choose an available category." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error && error.message ? error.message : "Unable to add vocabulary. Please try again." },
      { status: 500 }
    );
  }
}

// GET: number of vocabulary added today
export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;

  try {
    const userId = 1; // TODO: replace with session logic

    const { start, end } = torontoDayRange();

    // 2️⃣ Count vocab added today
    const count = await prisma.vocabulary.count({
      where: {
        userId,
        addedDate: {
          gte: start,
          lt: end,
        },
      },
    });

    return NextResponse.json({
      success: true,
      count,
    });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to load vocabulary" },
      { status: 500 }
    );
  }
}
