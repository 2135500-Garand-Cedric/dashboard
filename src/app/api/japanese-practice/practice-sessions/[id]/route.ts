import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePractice } from "@/lib/japanese/practice-sessions";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const { id } = await context.params;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) return NextResponse.json({ error: "Invalid practice session." }, { status: 400 });
    const practice = await prisma.practice.findFirst({ where: { id: Number(id), userId: 1 }, include: { activity: true } });
    if (!practice) return NextResponse.json({ error: "This practice session was not found." }, { status: 404 });
    return NextResponse.json({ review: serializePractice(practice) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load practice session", error);
    return NextResponse.json({ error: "Unable to load this practice session. Please try again." }, { status: 500 });
  }
}
