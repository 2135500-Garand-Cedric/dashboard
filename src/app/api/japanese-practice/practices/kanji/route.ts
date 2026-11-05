import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;

  try {
    // Path to the /public/kanji folder
    const kanjiDir = path.join(process.cwd(), "public/kanji");

    // Read all files in the folder
    const files = fs.readdirSync(kanjiDir)
      .filter((f) => f.endsWith(".gif"))       // only GIFs
      .map((f) => f.replace(".gif", ""));      // strip extension

    return NextResponse.json({ success: true, kanji: files });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
