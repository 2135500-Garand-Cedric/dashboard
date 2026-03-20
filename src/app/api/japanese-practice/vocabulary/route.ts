import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Get all the vocabulary for a user
export async function GET() {
  const userId = "1"; // Replace with actual user session ID

  // Get total activities count for percentage calculation
  const activityCount = await prisma.activity.count();

  // Fetch all vocabulary for the user with category and activity info
  const vocab = await prisma.vocabulary.findMany({
    where: { userId: Number(userId) },
    include: {
      category: true,
      activityVocab: true,
    },
    orderBy: { english: "asc" },
  });

  // Map status enums for calculation
  const statusMap: Record<string, number> = { WEAK: 1, GOOD: 2, PERFECT: 3 };
  const reverseStatus: Record<number, string> = { 1: "WEAK", 2: "GOOD", 3: "PERFECT" };

  // Transform results
  const result = vocab.map((v) => {
    let numActivities = activityCount;

    let filteredActivityVocab = v.activityVocab;

    if (v.category?.name !== 'Kanji') {
      numActivities -= 1; // exclude kanji writing activity from total count
      filteredActivityVocab = filteredActivityVocab.filter(av => av.activityId !== 5);
    }
    
    const worstVal = Math.min(...filteredActivityVocab.map((av) => statusMap[av.status]));
    const worstStatus = reverseStatus[worstVal];

    const sum = filteredActivityVocab.reduce((acc, av) => {
      if (av.status === "PERFECT") return acc + 1;
      if (av.status === "GOOD") return acc + 0.5;
      return acc;
    }, 0);

    const percentage = ((sum / numActivities) * 100).toFixed(2);

    return {
      id: v.id,
      english: v.english,
      japanese: v.japanese,
      hiragana: v.hiragana,
      category_name: v.category?.name,
      worst_status: worstStatus,
      percentage,
      starred: v.starred,
    };
  });

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
  try {
    const data: UpdateRequestBody = await req.json();

    if (!Array.isArray(data.updates) || !data.updates.length) {
      return NextResponse.json(
        { success: false, error: "Invalid data" },
        { status: 400 }
      );
    }

    const userId = 1;
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
    });

    return NextResponse.json({
      success: true,
      message: "Statuses updated successfully",
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


// Get the words for a practice session
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = 1; // TODO: Replace with session logic (NextAuth/JWT)
    const categories: number[] = body.categories || [];
    const nbWords: number = body.nbWords || 10;
    const activityId: number = body.activity || 1;
    const starredOnly: boolean = body.starredOnly || false;

    if (!categories.length) {
      return NextResponse.json(
        { success: false, error: "You must choose at least one category." },
        { status: 400 }
      );
    }

    // Fetch all ActivityVocab entries for this user/activity, including both Vocabulary and VerbForm
    const activityVocabs = await prisma.activityVocab.findMany({
      where: {
        activityId,
        OR: [
          {
            vocab: {
              userId,
              categoryId: { in: categories },
              ...(starredOnly ? { starred: true } : {}),
            },
          },
          {
            verbForm: {
              baseVocab: {
                userId,
                categoryId: { in: categories },
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
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
