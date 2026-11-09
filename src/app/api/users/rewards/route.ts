import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return NextResponse.json({ error: "Task rewards are applied automatically when the task status is saved. Reload the page before changing task status." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
