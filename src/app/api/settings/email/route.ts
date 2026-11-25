import { requireOwner } from "@/lib/require-owner";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { emailConfiguration } from "@/lib/email/resend.mjs";
import {
  readEmailPreferences,
  saveEmailPreferences,
  EmailSettingsError,
} from "@/lib/email/preferences.mjs";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
function result(settings: { enabled: boolean; recipient: string; revision: number }) {
  let configured = false;
  try {
    configured = !!emailConfiguration(process.env, {
      enabled: true,
      recipient: "check@example.com",
    });
  } catch {
    // Configuration health never exposes credentials or provider responses.
  }
  return Response.json({ ...settings, configured }, { headers });
}
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof EmailSettingsError
          ? error.message
          : error instanceof SyntaxError
            ? "Enter valid email settings."
            : "Unable to load or save email settings. Try again.",
    },
    {
      status:
        error instanceof EmailSettingsError
          ? error.status
          : error instanceof SyntaxError
            ? 400
            : 503,
      headers,
    },
  );
}
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return result(await readEmailPreferences(prisma, OWNER_DATABASE_USER_ID));
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return result(await saveEmailPreferences(prisma, OWNER_DATABASE_USER_ID, await request.json()));
  } catch (error) {
    return failure(error);
  }
}
