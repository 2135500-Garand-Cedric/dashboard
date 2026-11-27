import { categoryKind } from "@/lib/japanese/category-kind";
import { auditedCommand } from "@/lib/audit/command";
import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const accessError = await requirePermission("japanese.vocabulary.read");
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const categories = await prisma.category.findMany({
        where: { userId: currentUserId() },
        select: {
          kind: true,
          isDefault: true,
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
        kind: cat.kind,
        isDefault: cat.isDefault,
        vocabularyCount: cat._count.vocabulary,
      }));

      return NextResponse.json({ success: true, categories: result });
    } catch (error) {
      console.error("GET /api/categories error:");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error && !("code" in error)
              ? error.message
              : "Unable to load categories.",
        },
        { status: 500 },
      );
    }
  });
}

// ✅ POST /api/categories — Create a new category
export async function POST(req: Request) {
  const accessError = await requirePermission("japanese.vocabulary.manage", req);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const { name } = await req.json();

      if (!name || name.trim() === "") {
        return NextResponse.json(
          { success: false, error: "Category name is required" },
          { status: 400 },
        );
      }

      const newCategory = await prisma.$transaction(
        (db) =>
          auditedCommand(
            db,
            {
              model: "category",
              category: "JAPANESE",
              entityType: "vocab-category",
              label: "Vocabulary category",
            },
            async () =>
              db.category.create({
                data: {
                  userId: currentUserId(),
                  name: name.trim(),
                  normalizedName: name.trim().toLowerCase(),
                  kind: categoryKind({ name }),
                },
              }),
          ),
        { isolationLevel: "Serializable" },
      );

      return NextResponse.json({ success: true, category: newCategory });
    } catch (error) {
      console.error("POST /api/categories error:");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error && !("code" in error)
              ? error.message
              : "Unable to save category.",
        },
        { status: 500 },
      );
    }
  });
}
