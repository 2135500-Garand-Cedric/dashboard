import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return NextResponse.json(
    {
      error:
        "Task rewards have been retired. Completing or reopening a task does not change XP or coins.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
