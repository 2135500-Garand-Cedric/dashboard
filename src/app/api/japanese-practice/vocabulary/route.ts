import {
  practiceCategorySelection,
  VERB_DICTIONARY_CATEGORY,
} from "@/lib/japanese/practice-categories";
import { categoryKind } from "@/lib/japanese/category-kind";
import { auditRecordChange } from "@/lib/audit/server";
import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnownKanji, isKanjiWritingEligible } from "@/lib/japanese/kanji-writing";
import { vocabularyProgress } from "@/lib/japanese/vocabulary-progress";
import { selectPracticeWords } from "@/lib/japanese/practice-selection";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";

// Get all the vocabulary for a user
export async function GET() {
  const accessError = await requirePermission("japanese.vocabulary.read");
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    const userId = currentUserId();

    // Get total activities count for percentage calculation
    const activities = await prisma.activity.findMany({ select: { id: true } });
    const activityIds = activities.map((activity) => activity.id);

    // Fetch all vocabulary for the user with category and activity info
    const vocab = await prisma.vocabulary.findMany({
      where: { userId: Number(userId) },
      include: {
        category: true,
        activityVocab: true,
        verbForms: {
          include: {
            activityVocab: true,
          },
        },
      },
      orderBy: { english: "asc" },
    });

    const progress = vocabularyProgress(vocab, activityIds);
    const result = vocab.map((v, index) => ({
      id: v.id,
      english: v.english,
      japanese: v.japanese,
      hiragana: v.hiragana,
      readings: v.readings,
      category_name: v.category?.name,
      starred: v.starred,
      worst_status: progress[index].worstStatus,
      percentage: progress[index].percentage.toFixed(2),
    }));

    return NextResponse.json(result);
  });
}

type UpdateItem = {
  activityVocabId: number;
  status: "WEAK" | "GOOD" | "PERFECT";
};

type UpdateRequestBody = {
  activity: number;
  updates: UpdateItem[];
};

// Update the status of the vocabulary after a practice session
export async function PATCH(req: Request) {
  const accessError = await requirePermission("japanese.practice", req);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const data: UpdateRequestBody = await req.json();

      if (!Array.isArray(data.updates) || !data.updates.length) {
        return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
      }

      const activityId = data.activity;
      if (
        !Number.isInteger(activityId) ||
        activityId < 1 ||
        data.updates.length > 1000 ||
        data.updates.some(
          (item) =>
            !item ||
            !Number.isInteger(item.activityVocabId) ||
            item.activityVocabId < 1 ||
            !["WEAK", "GOOD", "PERFECT"].includes(item.status),
        ) ||
        new Set(data.updates.map((item) => item.activityVocabId)).size !== data.updates.length
      ) {
        return NextResponse.json(
          { success: false, error: "Choose valid words and ratings for this activity." },
          { status: 400 },
        );
      }
      const practicedAt = new Date();

      const counts = {
        wordCount: 0,
        perfectCount: 0,
        goodCount: 0,
        weakCount: 0,
      };

      await prisma.$transaction(async (tx) => {
        for (const item of data.updates) {
          // 1. Update status
          const updated = await tx.activityVocab.update({
            where: {
              id: item.activityVocabId,
              activityId,
              OR: [
                { vocab: { userId: currentUserId() } },
                { verbForm: { baseVocab: { userId: currentUserId() } } },
              ],
            },
            data: { status: item.status },
            include: {
              vocab: true,
              verbForm: {
                include: {
                  baseVocab: true,
                },
              },
            },
          });

          // 2. Update lastPracticed (handle vocab vs verbForm)
          if (updated.vocab) {
            await tx.vocabulary.update({
              where: { id: updated.vocab.id },
              data: { lastPracticed: practicedAt },
            });
          } else if (updated.verbForm) {
            await tx.vocabulary.update({
              where: { id: updated.verbForm.baseVocab.id },
              data: { lastPracticed: practicedAt },
            });
          }

          // 3. Count stats
          counts.wordCount += 1;
          if (item.status === "PERFECT") counts.perfectCount += 1;
          else if (item.status === "GOOD") counts.goodCount += 1;
          else counts.weakCount += 1;
        }

        await tx.activityVocab.updateMany({
          where: {
            userId: currentUserId(),
            activityId,
            id: { in: data.updates.map((item) => item.activityVocabId) },
            OR: [{ lastPracticed: null }, { lastPracticed: { lt: practicedAt } }],
          },
          data: { lastPracticed: practicedAt },
        });

        // 4. Create practice summary
        const practice = await tx.practice.create({
          data: {
            userId: currentUserId(),
            activityId: Number(activityId),
            wordCount: counts.wordCount,
            perfectCount: counts.perfectCount,
            goodCount: counts.goodCount,
            weakCount: counts.weakCount,
          },
        });
        await recordJapaneseProgress(tx, currentUserId());
        await auditRecordChange(
          tx,
          {
            category: "JAPANESE",
            action: "practice.saved",
            entityType: "practice",
            entityId: practice.id,
            entityReference: `Practice #${practice.id}`,
            summary: "Japanese practice saved",
            eventKey: `practice:${practice.id}`,
          },
          null,
          counts,
        );
      });

      return NextResponse.json({
        success: true,
        message: "Statuses updated successfully",
      });
    } catch (error: unknown) {
      console.error("Japanese operation failed.");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error && !("code" in error)
              ? error.message
              : "An unexpected error occurred",
        },
        { status: 500 },
      );
    }
  });
}

// Get the words for a practice session
export async function POST(req: Request) {
  const accessError = await requirePermission("japanese.practice", req);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const body = await req.json();
      const userId = currentUserId();
      const categories: number[] = body.categories || [];
      const nbWords: number = body.nbWords || 10;
      const activityId: number = body.activity || 1;
      const starredOnly: boolean = body.starredOnly || false;

      if (
        !Array.isArray(categories) ||
        categories.some(
          (id) => !Number.isInteger(id) || (id < 1 && id !== VERB_DICTIONARY_CATEGORY),
        )
      )
        return NextResponse.json(
          { success: false, error: "Choose valid practice categories." },
          { status: 400 },
        );
      const verb = categories.includes(VERB_DICTIONARY_CATEGORY)
        ? await prisma.category.findFirst({
            where: { userId, isDefault: true, kind: "VERB" },
            select: { id: true },
          })
        : null;
      if (categories.includes(VERB_DICTIONARY_CATEGORY) && !verb)
        return NextResponse.json(
          { success: false, error: "The default Verb category is unavailable." },
          { status: 400 },
        );
      const selection = practiceCategorySelection(categories, verb?.id ?? null);
      let eligibleIds: number[] | undefined;
      if (activityId === 5) {
        const vocabulary = await prisma.vocabulary.findMany({
          where: { userId },
          include: { category: true },
        });
        const knownKanji = getKnownKanji(vocabulary);
        eligibleIds = vocabulary
          .filter(
            (word) =>
              (!selection.filtered ||
                (word.categoryId !== null && selection.baseIds.includes(word.categoryId))) &&
              (!starredOnly || word.starred) &&
              isKanjiWritingEligible(word.japanese, knownKanji),
          )
          .map((word) => word.id);
        // Older vocabulary may lack a writing link; add only missing records.
        if (eligibleIds.length)
          await prisma.activityVocab.createMany({
            data: eligibleIds.map((vocabId) => ({
              userId: currentUserId(),
              activityId,
              vocabId,
              status: "WEAK",
            })),
            skipDuplicates: true,
          });
      }

      // Fetch all ActivityVocab entries for this user/activity, including both Vocabulary and VerbForm
      const activityVocabs = await prisma.activityVocab.findMany({
        where: {
          activityId,
          ...(eligibleIds ? { vocabId: { in: eligibleIds }, verbFormId: null } : {}),
          OR: [
            {
              vocab: {
                userId,
                ...(selection.filtered ? { categoryId: { in: selection.baseIds } } : {}),
                ...(starredOnly ? { starred: true } : {}),
              },
            },
            {
              verbForm: {
                baseVocab: {
                  userId,
                  ...(selection.filtered ? { categoryId: { in: selection.formIds } } : {}),
                  ...(starredOnly ? { starred: true } : {}),
                },
              },
            },
          ],
        },
        include: {
          vocab: {
            include: { category: true },
          },
          verbForm: {
            include: {
              baseVocab: {
                include: { category: true },
              },
              formType: true,
            },
          },
        },
      });

      // Transform each entry into a "practice word"
      type PracticeWord = {
        id: number;
        english: string;
        japanese: string;
        hiragana: string | null;
        readings: string[];
        read_hiragana: boolean;
        category_name: string | null;
        status: "WEAK" | "GOOD" | "PERFECT";
        lastPracticed: Date | null;
        formType?: string;
      };

      const words: PracticeWord[] = activityVocabs
        .map((av) => {
          if (av.verbForm) {
            return {
              id: av.id,
              english: av.verbForm.baseVocab.english + " (" + av.verbForm.formType.name + ")",
              japanese: av.verbForm.form,
              hiragana: av.verbForm.reading,
              readings: [av.verbForm.reading],
              read_hiragana: av.verbForm.baseVocab.readHiragana,
              category_name: av.verbForm.baseVocab.category?.name || null,
              status: av.status,
              lastPracticed: av.lastPracticed,
            };
          } else if (av.vocab) {
            let english = av.vocab.english;
            if (categoryKind(av.vocab.category) === "VERB") {
              english += " (dictionary form)";
            }
            return {
              id: av.id,
              english: english,
              japanese: av.vocab.japanese || "",
              hiragana: av.vocab.hiragana || null,
              readings: av.vocab.readings,
              read_hiragana: av.vocab.readHiragana,
              category_name: av.vocab.category?.name || null,
              status: av.status,
              lastPracticed: av.lastPracticed,
            };
          } else {
            return null;
          }
        })
        .filter(Boolean) as PracticeWord[];

      const selectedWords = selectPracticeWords(words, nbWords);

      return NextResponse.json({ success: true, words: selectedWords });
    } catch (error: unknown) {
      console.error("Japanese operation failed.");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error && !("code" in error)
              ? error.message
              : "An unexpected error occurred",
        },
        { status: 500 },
      );
    }
  });
}
