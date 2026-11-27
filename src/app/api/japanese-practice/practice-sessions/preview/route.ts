import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildPracticeReview,
  parsePracticeSession,
  PracticeSessionError,
} from "@/lib/japanese/practice-sessions";

export async function POST(request: Request) {
  const accessError = await requirePermission("japanese.practice", request);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const input = parsePracticeSession(await request.json());
      const review = await prisma.$transaction(
        (tx) => buildPracticeReview(tx, input, currentUserId()),
        {
          isolationLevel: "RepeatableRead",
          timeout: 20000,
        },
      );
      return NextResponse.json(
        { success: true, review },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      console.error("Unable to preview practice");
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof PracticeSessionError
              ? error.message
              : "Unable to prepare the practice overview. Please try again.",
        },
        { status: error instanceof PracticeSessionError ? error.status : 500 },
      );
    }
  });
}
