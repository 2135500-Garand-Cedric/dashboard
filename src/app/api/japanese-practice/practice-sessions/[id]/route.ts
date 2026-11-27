import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { currentUserId } from "@/lib/accounts/context.mjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePractice } from "@/lib/japanese/practice-sessions";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requirePermission("japanese.history.read", request);
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      const { id } = await context.params;
      if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))
        return NextResponse.json({ error: "Invalid practice session." }, { status: 400 });
      const practice = await prisma.practice.findFirst({
        where: { id: Number(id), userId: currentUserId() },
        include: { activity: true },
      });
      if (!practice)
        return NextResponse.json(
          { error: "This practice session was not found." },
          { status: 404 },
        );
      return NextResponse.json(
        { review: serializePractice(practice) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      console.error("Unable to load practice session");
      return NextResponse.json(
        { error: "Unable to load this practice session. Please try again." },
        { status: 500 },
      );
    }
  });
}
