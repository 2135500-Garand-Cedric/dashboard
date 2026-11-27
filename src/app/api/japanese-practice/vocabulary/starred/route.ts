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
      // Count vocabulary where starred = true
      const count = await prisma.vocabulary.count({
        where: { userId: currentUserId(), starred: true },
      });

      return NextResponse.json({ success: true, count });
    } catch (err) {
      console.error("Failed to get starred count:");
      return NextResponse.json(
        {
          success: false,
          error:
            err instanceof Error && !("code" in err)
              ? err.message
              : "Unable to load starred count.",
        },
        { status: 500 },
      );
    }
  });
}
