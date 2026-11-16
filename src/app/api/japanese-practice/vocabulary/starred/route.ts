import { withUserTimeZone } from "@/lib/user-settings";
import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      // Count vocabulary where starred = true
      const count = await prisma.vocabulary.count({
        where: { starred: true },
      });

      return NextResponse.json({ success: true, count });
    } catch (err) {
      console.error("Failed to get starred count:", err);
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Unable to load starred count.",
        },
        { status: 500 },
      );
    }
  });
}
