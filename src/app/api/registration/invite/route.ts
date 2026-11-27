import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  hashToken,
  inviteCookie,
  cookieOptions,
  requestBudget,
  sameOrigin,
  smallJson,
} from "@/lib/accounts/security";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Cross-site request denied." }, { status: 403 });
  try {
    const body = await smallJson(request);
    if (typeof body.token !== "string" || !/^[\w-]{43}$/.test(body.token))
      throw new Error("Invitation is invalid or expired.");
    const accepted = await prisma.$transaction(async (db) => {
      await requestBudget(db, "invitation");
      return db.userInvitation.findFirst({
        where: {
          tokenHash: hashToken(body.token),
          usedAt: null,
          revokedAt: null,
          expires: { gt: new Date() },
        },
        select: { id: true },
      });
    });
    if (!accepted) throw new Error("Invitation is invalid or expired.");
    (await cookies()).set(inviteCookie, body.token, cookieOptions);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error:
          "Invitation is invalid, expired, or temporarily unavailable. Ask the person who invited you.",
      },
      { status: 400 },
    );
  }
}
