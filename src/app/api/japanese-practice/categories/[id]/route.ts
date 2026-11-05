import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";

// ✅ PATCH /api/categories/[id] — Update category name
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const accessError = await requireOwner(req);
  if (accessError) return accessError;

  try {
    const { id } = await context.params;
    const categoryId = Number(id);
    const { name } = await req.json();

    if (isNaN(categoryId)) {
      return NextResponse.json(
        { success: false, error: "Invalid category ID" },
        { status: 400 }
      );
    }

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Category name is required" },
        { status: 400 }
      );
    }

    const updatedCategory = await prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id: categoryId },
        data: { name: name.trim() },
      });
      await recordJapaneseProgress(tx);
      return category;
    });

    return NextResponse.json({ success: true, category: updatedCategory });
  } catch (error: unknown) {
    console.error("PATCH /api/categories/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to update category" },
      { status: 500 }
    );
  }
}

// ✅ DELETE /api/categories/[id] — Delete category only if no vocab is linked
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const accessError = await requireOwner(req);
  if (accessError) return accessError;

  try {
    const { id } = await context.params;
    const categoryId = Number(id);

    if (isNaN(categoryId)) {
      return NextResponse.json(
        { success: false, error: "Invalid category ID" },
        { status: 400 }
      );
    }

    // 🔍 Check if any vocabulary is linked to this category
    const linkedVocabCount = await prisma.vocabulary.count({
      where: { categoryId },
    });

    if (linkedVocabCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete category: ${linkedVocabCount} vocabulary item(s) are linked to it.`,
        },
        { status: 400 }
      );
    }

    // 🗑 Delete category
    await prisma.category.delete({
      where: { id: categoryId },
    });

    return NextResponse.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/categories/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to update category" },
      { status: 500 }
    );
  }
}
