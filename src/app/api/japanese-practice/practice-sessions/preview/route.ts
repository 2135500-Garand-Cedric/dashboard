import { japaneseRequestError } from "@/lib/japanese/request-error";
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
    const startedAt = Date.now();
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
      const failure =
        error instanceof PracticeSessionError
          ? null
          : japaneseRequestError(error, "preview practice", startedAt);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof PracticeSessionError
              ? error.message
              : failure!.error,
          ...(failure ? { code: failure.code } : {}),
        },
        {
          status:
            error instanceof PracticeSessionError
              ? error.status
              : failure!.status,
        },
      );
    }
  });
}
