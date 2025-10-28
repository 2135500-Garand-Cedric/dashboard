import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/japanese-practice/vocabulary/[id]
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const vocabId = Number(params.id);
    if (isNaN(vocabId)) {
      return NextResponse.json({ success: false, error: "Invalid vocabulary ID" }, { status: 400 });
    }

    const userId = 1; // Replace with session logic

    const vocab = await prisma.vocabulary.findUnique({
      where: { id: vocabId },
      include: { category: true, activityVocab: true },
    });

    if (!vocab) {
      return NextResponse.json({ success: false, error: "Vocabulary not found" }, { status: 404 });
    }

    const statusMap: Record<string, number> = { WEAK: 1, GOOD: 2, PERFECT: 3 };
    const reverseStatus: Record<number, string> = { 1: "WEAK", 2: "GOOD", 3: "PERFECT" };

    const worstVal = Math.min(...(vocab.activityVocab.map((av) => statusMap[av.status]) || [1]));
    const worstStatus = reverseStatus[worstVal];

    const activityCount = await prisma.activity.count();
    const sum = vocab.activityVocab.reduce((acc, av) => {
      if (av.status === "PERFECT") return acc + 1;
      if (av.status === "GOOD") return acc + 0.5;
      return acc;
    }, 0);

    const percentage = ((sum / activityCount) * 100).toFixed(2);

    const result = {
      id: vocab.id,
      english: vocab.english,
      japanese: vocab.japanese,
      hiragana: vocab.hiragana,
      categoryId: vocab.category?.id,
      worst_status: worstStatus,
      percentage,
      starred: vocab.starred,
    };

    return NextResponse.json({ success: true, vocabulary: result });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/japanese-practice/vocabulary/[id]
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const vocabId = Number(params.id);
    if (isNaN(vocabId)) {
      return NextResponse.json({ success: false, error: "Invalid vocabulary ID" }, { status: 400 });
    }

    const body = await req.json();

    const { english, japanese, hiragana, categoryId, starred } = body;
    if (!english || !japanese || !hiragana || !categoryId) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const updatedVocab = await prisma.vocabulary.update({
      where: { id: vocabId },
      data: {
        english,
        japanese,
        hiragana,
        starred,
        category: { connect: { id: categoryId } },
      },
    });

    return NextResponse.json({ success: true, vocabulary: updatedVocab });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/japanese-practice/vocabulary/[id]
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const vocabId = Number(params.id);
    if (isNaN(vocabId)) {
      return NextResponse.json({ success: false, error: "Invalid vocabulary ID" }, { status: 400 });
    }

    await prisma.vocabulary.delete({ where: { id: vocabId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
