import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKnownKanji, isKanjiWritingEligible } from "@/lib/japanese/kanji-writing";
import { vocabularyProgress } from "@/lib/japanese/vocabulary-progress";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";

// Get all the vocabulary for a user
export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;

  const userId = "1"; // Replace with actual user session ID

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
    id: v.id, english: v.english, japanese: v.japanese, hiragana: v.hiragana,
    category_name: v.category?.name, starred: v.starred,
    worst_status: progress[index].worstStatus,
    percentage: progress[index].percentage.toFixed(2),
  }));

  return NextResponse.json(result);
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
  const accessError = await requireOwner(req);
  if (accessError) return accessError;

  try {
    const data: UpdateRequestBody = await req.json();

    if (!Array.isArray(data.updates) || !data.updates.length) {
      return NextResponse.json(
        { success: false, error: "Invalid data" },
        { status: 400 }
      );
    }

    const activityId = data.activity;

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
          where: { id: item.activityVocabId },
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
            data: { lastPracticed: new Date() },
          });
        } else if (updated.verbForm) {
          await tx.vocabulary.update({
            where: { id: updated.verbForm.baseVocab.id },
            data: { lastPracticed: new Date() },
          });
        }

        // 3. Count stats
        counts.wordCount += 1;
        if (item.status === "PERFECT") counts.perfectCount += 1;
        else if (item.status === "GOOD") counts.goodCount += 1;
        else counts.weakCount += 1;
      }

      // 4. Create practice summary
      await tx.practice.create({
        data: {
          activityId: Number(activityId),
          wordCount: counts.wordCount,
          perfectCount: counts.perfectCount,
          goodCount: counts.goodCount,
          weakCount: counts.weakCount,
        },
      });
      await recordJapaneseProgress(tx);
    });

    return NextResponse.json({
      success: true,
      message: "Statuses updated successfully",
    });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}


// Get the words for a practice session
export async function POST(req: Request) {
  const accessError = await requireOwner(req);
  if (accessError) return accessError;

  try {
    const body = await req.json();
    const userId = 1; // TODO: Replace with session logic (NextAuth/JWT)
    const categories: number[] = body.categories || [];
    const nbWords: number = body.nbWords || 10;
    const activityId: number = body.activity || 1;
    const starredOnly: boolean = body.starredOnly || false;

    let eligibleIds: number[] | undefined;
    if (activityId === 5) {
      const vocabulary = await prisma.vocabulary.findMany({
        where: { userId }, include: { category: true },
      });
      const knownKanji = getKnownKanji(vocabulary);
      eligibleIds = vocabulary.filter((word) =>
        (!categories.length || (word.categoryId !== null && categories.includes(word.categoryId))) &&
        (!starredOnly || word.starred) &&
        isKanjiWritingEligible(word.japanese, knownKanji)
      ).map((word) => word.id);
      // Older vocabulary may lack a writing link; add only missing records.
      if (eligibleIds.length) await prisma.activityVocab.createMany({
        data: eligibleIds.map((vocabId) => ({ activityId, vocabId, status: "WEAK" })),
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
              ...(categories.length ? { categoryId: { in: categories } } : {}),
              ...(starredOnly ? { starred: true } : {}),
            },
          },
          {
            verbForm: {
              baseVocab: {
                userId,
                ...(categories.length ? { categoryId: { in: categories } } : {}),
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
      read_hiragana: boolean;
      category_name: string | null;
      status: "WEAK" | "GOOD" | "PERFECT";
      formType?: string;
    };

    const words: PracticeWord[] = activityVocabs.map((av) => {
      if (av.verbForm) {
        return {
          id: av.id,
          english: av.verbForm.baseVocab.english + " (" + av.verbForm.formType.name + ")",
          japanese: av.verbForm.form,
          hiragana: av.verbForm.reading,
          read_hiragana: av.verbForm.baseVocab.readHiragana,
          category_name: av.verbForm.baseVocab.category?.name || null,
          status: av.status,
        };
      } else if (av.vocab) {
        let english = av.vocab.english;
        if (av.vocab.category?.name.toLowerCase() === "verb") {
          english += " (dictionary form)";
        }
        return {
          id: av.id,
          english: english,
          japanese: av.vocab.japanese || "",
          hiragana: av.vocab.hiragana || null,
          read_hiragana: av.vocab.readHiragana,
          category_name: av.vocab.category?.name || null,
          status: av.status,
        };
      } else {
        return null;
      }
    }).filter(Boolean) as PracticeWord[];

    // Separate by status
    const statusOrder: ("WEAK" | "GOOD" | "PERFECT")[] = ["WEAK", "GOOD", "PERFECT"];
    const wordsByStatus: Record<string, PracticeWord[]> = {
      WEAK: [],
      GOOD: [],
      PERFECT: [],
    };

    for (const w of words) wordsByStatus[w.status].push(w);

    // Shuffle each status array (Fisher-Yates)
    const shuffle = <T>(array: T[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    };
    statusOrder.forEach((status) => shuffle(wordsByStatus[status]));

    // Select up to nbWords: take from WEAK first, then GOOD, then PERFECT
    const selectedWords: PracticeWord[] = [];
    for (const status of statusOrder) {
      for (const w of wordsByStatus[status]) {
        if (selectedWords.length < nbWords) selectedWords.push(w);
        else break;
      }
    }

    return NextResponse.json({ success: true, words: selectedWords });
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" }, { status: 500 });
  }
}
