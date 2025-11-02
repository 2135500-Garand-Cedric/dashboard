import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Count vocabulary where starred = true
    const count = await prisma.vocabulary.count({
      where: { starred: true },
    });

    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error("Failed to get starred count:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
