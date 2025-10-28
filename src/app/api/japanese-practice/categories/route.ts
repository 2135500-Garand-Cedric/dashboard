import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: { vocabulary: true }, // counts vocabulary linked to this category
        },
      },
      orderBy: { id: "asc" },
    });

    // Map result to include a more friendly property
    const result = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      vocabularyCount: cat._count.vocabulary,
    }));

    return NextResponse.json({ success: true, categories: result });
  } catch (error: any) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


// ✅ POST /api/categories — Create a new category
export async function POST(req: Request) {
  try {
    const { name } = await req.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Category name is required" },
        { status: 400 }
      );
    }

    const newCategory = await prisma.category.create({
      data: { name: name.trim() },
    });

    return NextResponse.json({ success: true, category: newCategory });
  } catch (error: any) {
    console.error("POST /api/categories error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
