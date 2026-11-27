import { auditedCommand } from "@/lib/audit/command";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { readUserSettings } from "@/lib/user-settings";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await readUserSettings(), { headers });
  } catch {
    return NextResponse.json(
      { error: "Unable to load settings. Try again." },
      { status: 503, headers },
    );
  }
}
export async function PATCH(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  let timeZone: string;
  try {
    const body = await request.json();
    if (
      !body ||
      Object.keys(body).some((key) => key !== "timeZone") ||
      typeof body.timeZone !== "string" ||
      body.timeZone.length > 100
    )
      throw new Error();
    timeZone = new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return NextResponse.json({ error: "Choose a valid timezone." }, { status: 400, headers });
  }
  try {
    await prisma.$transaction(
      (db) =>
        auditedCommand(
          db,
          {
            model: "user",
            category: "SETTINGS",
            entityType: "settings",
            label: "Timezone",
            id: OWNER_DATABASE_USER_ID,
          },
          async () => db.user.update({ where: { id: OWNER_DATABASE_USER_ID }, data: { timeZone } }),
        ),
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({ timeZone }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Unable to save settings. Try again." },
      { status: 503, headers },
    );
  }
}
