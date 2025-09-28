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
    const worstVal = Math.min(...v.activityVocab.map((av) => statusMap[av.status]));
    const worstStatus = reverseStatus[worstVal];

    const sum = v.activityVocab.reduce((acc, av) => {
      if (av.status === "PERFECT") return acc + 1;
      if (av.status === "GOOD") return acc + 0.5;
      return acc;
    }, 0);

    const percentage = ((sum / activityCount) * 100).toFixed(2);

    return {
      english: v.english,
      japanese: v.japanese,
      hiragana: v.hiragana,
      category_name: v.category?.name,
      worst_status: worstStatus,
      percentage,
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
        }
      }
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

    if (!categories.length) {
      return NextResponse.json({ success: false, error: "You must choose at least one category." }, { status: 400 });
    }

    // Fetch vocabulary for this activity and categories, ordered by status
    const words = await prisma.vocabulary.findMany({
      where: {
        userId,
        categoryId: { in: categories },
        activityVocab: { some: { activityId } },
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
            _count: "asc", // This is a workaround for ordering; we'll sort manually next
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
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
      .slice(0, nbWords);

    return NextResponse.json({ success: true, words: sortedWords });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
