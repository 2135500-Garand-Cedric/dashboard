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
  vocabId: number;
  status: "WEAK" | "GOOD" | "PERFECT";
  activity: number;
};

// Update the status of the vocabulary after a practice session
export async function PATCH(req: Request) {
  try {
    const data: UpdateItem[] = await req.json();

    if (!Array.isArray(data) || !data.length) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }

    const userId = 1;

    const activityCounts: Record<number, { wordCount: number; perfectCount: number; goodCount: number; weakCount: number }> = {};

    const activityId = data[0].activity; // Assuming all items are for the same activity

    // Start transaction
    await prisma.$transaction(async (tx) => {
      for (const item of data) {
        if (item.vocabId && item.status && item.activity) {
          await tx.activityVocab.updateMany({
            where: {
              vocabId: item.vocabId,
              activityId: item.activity,
            },
            data: { status: item.status },
          });

          await tx.vocabulary.update({
            where: { id: item.vocabId },
            data: { lastPracticed: new Date() },
          });

          if (!activityCounts[item.activity]) {
            activityCounts[item.activity] = { wordCount: 0, perfectCount: 0, goodCount: 0, weakCount: 0 };
          }
          activityCounts[item.activity].wordCount += 1;
          if (item.status === "PERFECT") activityCounts[item.activity].perfectCount += 1;
          else if (item.status === "GOOD") activityCounts[item.activity].goodCount += 1;
          else activityCounts[item.activity].weakCount += 1;
        }
      }

      await tx.practice.create({
        data: {
          activityId: Number(activityId),
          wordCount: activityCounts[activityId].wordCount,
          perfectCount: activityCounts[activityId].perfectCount,
          goodCount: activityCounts[activityId].goodCount,
          weakCount: activityCounts[activityId].weakCount,
        },
      });
    });

    return NextResponse.json({ success: true, message: "Statuses updated successfully" });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


// Get the words for a practice session
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // TODO: Replace with session logic (NextAuth or JWT)
    const userId = 1; 

    const categories: number[] = body.categories || [];
    const nbWords: number = body.nbWords || 10;
    const activityId: number = body.activity || 1;
    const starredOnly: boolean = body.starredOnly || false;

    if (!categories.length) {
      return NextResponse.json({ success: false, error: "You must choose at least one category." }, { status: 400 });
    }

    // Fetch vocabulary for this activity and categories, ordered by status
    const words = await prisma.vocabulary.findMany({
      where: {
        userId,
        categoryId: { in: categories },
        activityVocab: { some: { activityId } },
        ...(starredOnly ? { starred: true } : {})
      },
      include: {
        category: true,
        activityVocab: {
          where: { activityId },
          select: { status: true },
        },
      },
      orderBy: [
        {
          activityVocab: {
            _count: "asc",
          },
        },
      ],
    });

    // Map to include only one activityVocab and sort by status
    const statusOrder: Record<string, number> = { WEAK: 1, GOOD: 2, PERFECT: 3 };
    const sortedWords = words
      .map((v) => ({
        id: v.id,
        english: v.english,
        japanese: v.japanese,
        hiragana: v.hiragana,
        category_name: v.category?.name,
        status: v.activityVocab[0]?.status || "WEAK",
        read_hiragana: v.readHiragana,
      }))
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    // Slice first nbWords
    const selectedWords = sortedWords.slice(0, nbWords);

    // Shuffle the selected words using Fisher-Yates
    for (let i = selectedWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selectedWords[i], selectedWords[j]] = [selectedWords[j], selectedWords[i]];
    }

    return NextResponse.json({ success: true, words: selectedWords });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
