import { auditedCommand } from "@/lib/audit/command";
import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJapaneseProgress } from "@/lib/japanese/progress-history";

class DefaultCategoryError extends Error {}

// ✅ PATCH /api/categories/[id] — Update category name
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requirePermission("japanese.vocabulary.manage", req);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const { id } = await context.params;
      const categoryId = Number(id);
      const { name } = await req.json();

      if (isNaN(categoryId)) {
        return NextResponse.json({ success: false, error: "Invalid category ID" }, { status: 400 });
      }

      if (!name || name.trim() === "") {
        return NextResponse.json(
          { success: false, error: "Category name is required" },
          { status: 400 },
        );
      }

      const updatedCategory = await prisma.$transaction(async (tx) => {
        return auditedCommand(
          tx,
          {
            model: "category",
            category: "JAPANESE",
            entityType: "vocab-category",
            label: "Vocabulary category",
            id: categoryId,
          },
          async () => {
            const existing = await tx.category.findFirst({
              where: { id: categoryId, userId: currentUserId() },
            });
            if (!existing) throw new Error("Category not found.");
            if (existing.isDefault)
              throw new DefaultCategoryError("Default categories cannot be edited.");
            const category = await tx.category.update({
              where: { id: categoryId, userId: currentUserId() },
              data: { name: name.trim(), normalizedName: name.trim().toLowerCase() },
            });
            await recordJapaneseProgress(tx, currentUserId());
            return category;
          },
        );
      });

      return NextResponse.json({ success: true, category: updatedCategory });
    } catch (error: unknown) {
      console.error("PATCH /api/categories/[id] error:");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error && !("code" in error)
              ? error.message
              : "Unable to update category",
        },
        { status: error instanceof DefaultCategoryError ? 403 : 500 },
      );
    }
  });
}

// ✅ DELETE /api/categories/[id] — Delete category only if no vocab is linked
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requirePermission("japanese.vocabulary.manage", req);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const { id } = await context.params;
      const categoryId = Number(id);

      if (isNaN(categoryId)) {
        return NextResponse.json({ success: false, error: "Invalid category ID" }, { status: 400 });
      }

      // 🔍 Check if any vocabulary is linked to this category
      const linkedVocabCount = await prisma.vocabulary.count({
        where: { categoryId, userId: currentUserId() },
      });

      if (linkedVocabCount > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot delete category: ${linkedVocabCount} vocabulary item(s) are linked to it.`,
          },
          { status: 400 },
        );
      }

      // 🗑 Delete category
      await prisma.$transaction(
        (db) =>
          auditedCommand(
            db,
            {
              model: "category",
              category: "JAPANESE",
              entityType: "vocab-category",
              label: "Vocabulary category",
              id: categoryId,
            },
            async () => {
              const category = await db.category.findFirst({
                where: { id: categoryId, userId: currentUserId() },
              });
              if (!category) throw new Error("Category not found.");
              if (category.isDefault)
                throw new DefaultCategoryError("Default categories cannot be deleted.");
              return db.category.delete({ where: { id: categoryId, userId: currentUserId() } });
            },
          ),
        { isolationLevel: "Serializable" },
      );

      return NextResponse.json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error: unknown) {
      console.error("DELETE /api/categories/[id] error:");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error && !("code" in error)
              ? error.message
              : "Unable to update category",
        },
        { status: error instanceof DefaultCategoryError ? 403 : 500 },
      );
    }
  });
}
