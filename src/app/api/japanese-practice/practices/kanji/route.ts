import { withUserTimeZone } from "@/lib/user-settings";
import { requirePermission } from "@/lib/accounts/access";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const accessError = await requirePermission("japanese.practice");
  if (accessError) return accessError;
  return withUserTimeZone(async () => {
    try {
      // Path to the /public/kanji folder
      const kanjiDir = path.join(process.cwd(), "public/kanji");

      // Read all files in the folder
      const files = fs
        .readdirSync(kanjiDir)
        .filter((f) => f.endsWith(".gif")) // only GIFs
        .map((f) => f.replace(".gif", "")); // strip extension

      return NextResponse.json({ success: true, kanji: files });
    } catch (err) {
      console.error("Japanese operation failed.");
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error && !("code" in err) ? err.message : "Unable to load kanji.",
        },
        { status: 500 },
      );
    }
  });
}
