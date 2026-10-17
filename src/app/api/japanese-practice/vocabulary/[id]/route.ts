// GET /api/japanese-practice/vocabulary/[id]
// Fetches a specific vocabulary entry with verb forms and activity status
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";
import { conjugateVerb } from "@/lib/japanese/conjugation";
import { calculateActivityStats } from "@/lib/japanese/utils"; // import the util
import { getKnownKanji, isKanjiWritingEligible, getApplicableActivityIds } from "@/lib/japanese/kanji-writing";
import { ActivityVocabStatus, type Prisma } from "@/generated/prisma";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const vocabId = Number(id);
    if (isNaN(vocabId)) {
      return NextResponse.json(
        { success: false, error: "Invalid vocabulary ID" },
        { status: 400 }
      );
    }

    const userId = 1; // TODO: replace with session logic

    // fetch total activities once
    const activities = await prisma.activity.findMany({ select: { id: true } });
    const activityIds = activities.map((activity) => activity.id);

    const vocab = await prisma.vocabulary.findUnique({
      where: { id: vocabId },
      include: {
        category: true,
        activityVocab: true,
        verbForms: {
          include: {
            formType: true,
            activityVocab: true, // make sure VerbForm has relation to ActivityVocab
          },
        },
      },
    });

    if (!vocab) {
      return NextResponse.json(
        { success: false, error: "Vocabulary not found" },
        { status: 404 }
      );
    }

    const kanjiVocabulary = await prisma.vocabulary.findMany({
      where: { userId, category: { name: { equals: "kanji", mode: "insensitive" } } },
      include: { category: true },
    });
    const knownKanji = getKnownKanji(kanjiVocabulary);
    const { worstStatus, percentage } = calculateActivityStats(
      vocab.activityVocab,
      getApplicableActivityIds(activityIds, isKanjiWritingEligible(vocab.japanese, knownKanji)),
    );

    // Calculate stats for verb forms if category is Verb
    let verbFormsResult: { id: number; formType: string; form: string; reading: string; worst_status: string; percentage: string }[] = [];
    if (vocab.category?.name.toLowerCase() === "verb") {
      verbFormsResult = vocab.verbForms.map((vf) => {
        const { worstStatus: worst_status, percentage: percentage } = calculateActivityStats(
          vf.activityVocab,
          getApplicableActivityIds(activityIds, false, true)
        );

        return {
          id: vf.id,
          formType: vf.formType.name,
          form: vf.form,
          reading: vf.reading,
          worst_status,
          percentage,
        };
      });
    }

    const result = {
      id: vocab.id,
      english: vocab.english,
      japanese: vocab.japanese,
      hiragana: vocab.hiragana,
      categoryId: vocab.category?.id,
      worst_status: worstStatus,
      percentage,
      starred: vocab.starred,
      verbType: vocab.verbType,
      verbForms: verbFormsResult,
    };

    return NextResponse.json({ success: true, vocabulary: result });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}


// PATCH /api/japanese-practice/vocabulary/[id]
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const vocabId = Number(id);

    if (isNaN(vocabId)) {
      return NextResponse.json(
        { success: false, error: "Invalid vocabulary ID" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { english, japanese, hiragana, categoryId, starred, verbType } = body;

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Get existing vocab
      const existing = await tx.vocabulary.findUnique({
        where: { id: vocabId },
      });

      if (!existing) {
        throw new Error("Vocabulary not found");
      }

      // 2️⃣ Detect changes
      const changes = {
        english: english !== undefined && english !== existing.english,
        japanese: japanese !== undefined && japanese !== existing.japanese,
        hiragana: hiragana !== undefined && hiragana !== existing.hiragana,
        categoryId: categoryId !== undefined && categoryId !== existing.categoryId,
        starred: starred !== undefined && starred !== existing.starred,
        verbType: verbType !== undefined && verbType !== existing.verbType,
      };

      const hasChanges = Object.values(changes).some(Boolean);

      // 🚀 3️⃣ If NOTHING changed → skip everything
      if (!hasChanges) {
        return existing;
      }

      // 4️⃣ Build update object ONLY with changed fields
      const data: Prisma.VocabularyUpdateInput = {};
      if (changes.english) data.english = english;
      if (changes.japanese) data.japanese = japanese;
      if (changes.hiragana) data.hiragana = hiragana;
      if (changes.starred) data.starred = starred;
      if (changes.categoryId) data.category = { connect: { id: categoryId } };
      if (changes.verbType) data.verbType = verbType;

      // 5️⃣ Update vocab ONLY if needed
      const updatedVocab = await tx.vocabulary.update({
        where: { id: vocabId },
        data,
      });

      // 6️⃣ Determine if we need to regenerate verb forms
      const isVerb =
        (categoryId ?? existing.categoryId) === 1 &&
        (verbType ?? existing.verbType);

      const baseChanged =
        changes.japanese ||
        changes.hiragana ||
        changes.verbType;

      if (isVerb && baseChanged) {
        const base = japanese ?? existing.japanese;
        const reading = hiragana ?? existing.hiragana;
        const type = verbType ?? existing.verbType;

        if (!base || !reading || !type) {
          await recordJapaneseProgress(tx);
          return updatedVocab;
        }

        // 7️⃣ Generate new forms
        const forms = conjugateVerb(base, reading, type);

        // 8️⃣ Get form types
        const formTypes = await tx.verbFormType.findMany();
        const formTypeMap: Record<string, number> = {};
        formTypes.forEach((ft) => {
          formTypeMap[ft.name] = ft.id;
        });

        // 9️⃣ Delete old forms (cascade deletes activityVocab)
        await tx.verbForm.deleteMany({
          where: { baseVocabId: vocabId },
        });

        // 🔟 Insert new forms
        await tx.verbForm.createMany({
          data: Object.entries(forms).map(([name, value]) => ({
            baseVocabId: vocabId,
            formTypeId: formTypeMap[name],
            form: value.form,
            reading: value.reading,
          })),
        });

        // 1️⃣1️⃣ Fetch created verb forms
        const createdVerbForms = await tx.verbForm.findMany({
          where: { baseVocabId: vocabId },
          select: { id: true },
        });

        // 1️⃣2️⃣ Fetch activities
        const activities = await tx.activity.findMany({
          select: { id: true },
        });

        // 1️⃣3️⃣ Create ActivityVocab links
        await tx.activityVocab.createMany({
          data: activities.flatMap((a) =>
            createdVerbForms.map((vf) => ({
              activityId: a.id,
              verbFormId: vf.id,
              status: ActivityVocabStatus.WEAK,
            }))
          ),
        });
      }

      await recordJapaneseProgress(tx);
      return updatedVocab;
    });

    return NextResponse.json({ success: true, vocabulary: result });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/japanese-practice/vocabulary/[id]
export async function DELETE(
  req: Request, 
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const vocabId = Number(id);
    if (isNaN(vocabId)) {
      return NextResponse.json({ success: false, error: "Invalid vocabulary ID" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.vocabulary.delete({ where: { id: vocabId } });
      await recordJapaneseProgress(tx);
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" }, { status: 500 });
  }
}
