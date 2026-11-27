import { getActor } from "@/lib/accounts/access";
import { prisma } from "@/lib/prisma";
import {
  sameOrigin,
  smallJson,
  linkCookie,
  newToken,
  hashToken,
  cookieOptions,
} from "@/lib/accounts/security";
import { cookies } from "next/headers";
import { identityAudit } from "@/lib/accounts/identity";
export async function GET() {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const [accounts, pack] = await Promise.all([
    prisma.authAccount.findMany({ where: { userId: actor.id }, select: { provider: true } }),
    prisma.vocabularyPackVersion.findFirst({
      orderBy: { id: "desc" },
      select: { id: true, wordCount: true },
    }),
  ]);
  return Response.json(
    {
      actor,
      accounts,
      pack,
      providers: [
        "github",
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? ["google"] : []),
      ],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "Cross-site request denied." }, { status: 403 });
  try {
    const body = await smallJson(request);
    if (body.action === "link") {
      if (
        !["google", "github"].includes(body.provider) ||
        (body.provider === "google" &&
          (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET))
      )
        throw new Error("Provider is unavailable.");
      const token = newToken();
      await prisma.$transaction(async (db) => {
        const session = await db.authSession.findFirst({
          where: {
            id: actor.sessionId,
            userId: actor.id,
            authenticatedAt: { gt: new Date(Date.now() - 10 * 60000) },
          },
        });
        if (!session) throw new Error("Sign out and sign in again before linking another method.");
        await db.authLinkIntent.deleteMany({ where: { userId: actor.id } });
        await db.authLinkIntent.create({
          data: {
            tokenHash: hashToken(token),
            userId: actor.id,
            sessionId: session.id,
            provider: body.provider,
            expires: new Date(Date.now() + 10 * 60000),
          },
        });
      });
      (await cookies()).set(linkCookie, token, { ...cookieOptions, maxAge: 600 });
    } else if (body.action === "unlink") {
      if (!["google", "github"].includes(body.provider))
        throw new Error("Choose a sign-in method.");
      await prisma.$transaction(async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(94740, 1)`;
        if ((await db.authAccount.count({ where: { userId: actor.id } })) <= 1)
          throw new Error("Keep at least one sign-in method.");
        if (actor.role === "OWNER" && body.provider === "github")
          throw new Error("Keep the owner's recovery sign-in method.");
        const session = await db.authSession.findFirst({
          where: {
            id: actor.sessionId,
            authenticatedAt: { gt: new Date(Date.now() - 10 * 60000) },
          },
        });
        if (!session)
          throw new Error("Sign out and sign in again before changing sign-in methods.");
        await db.authAccount.delete({
          where: { userId_provider: { userId: actor.id, provider: body.provider } },
        });
        await db.pushSubscription.updateMany({
          where: { userId: actor.id },
          data: { active: false },
        });
        await db.pushDelivery.updateMany({
          where: { subscription: { userId: actor.id }, status: "PENDING" },
          data: { status: "SKIPPED", errorCode: "DISABLED", leaseUntil: null },
        });
        await db.authLinkIntent.deleteMany({ where: { userId: actor.id } });
        await db.authSession.deleteMany({ where: { userId: actor.id } });
        await identityAudit(db, actor.id, actor.id, "account.unlinked", "Sign-in method unlinked", {
          type: body.provider,
        });
      });
    } else if (body.action === "profile") {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 100 ||
        typeof body.timeZone !== "string" ||
        body.timeZone.length > 100
      )
        throw new Error("Enter a name and valid timezone.");
      const timeZone = new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).resolvedOptions()
        .timeZone;
      await prisma.$transaction(async (db) => {
        await db.user.update({
          where: { id: actor.id },
          data: { name: body.name.trim(), timeZone },
        });
        await identityAudit(
          db,
          actor.id,
          actor.id,
          "account.profile_changed",
          "Account preferences changed",
          { timeZone },
        );
      });
    } else throw new Error("Choose an account action.");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && !("code" in error)
            ? error.message
            : "Unable to update your account.",
      },
      { status: 400 },
    );
  }
}
