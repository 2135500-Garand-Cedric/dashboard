import { requireOwner } from "@/lib/require-owner";
import { prisma } from "@/lib/prisma";
import { smallJson, newToken, hashToken } from "@/lib/accounts/security";
import { validPermissions } from "@/lib/accounts/capabilities";
import { identityAudit } from "@/lib/accounts/identity";
import { publishStarter } from "@/lib/accounts/onboarding";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const [users, invitations, pack] = await Promise.all([
    prisma.user.findMany({
      take: 100,
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        lastSignedInAt: true,
        initialization: { select: { choice: true, completedAt: true } },
        permissions: { select: { capability: true } },
        authAccounts: { select: { provider: true } },
      },
    }),
    prisma.userInvitation.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        expires: true,
        usedAt: true,
        revokedAt: true,
        usedById: true,
      },
    }),
    prisma.vocabularyPackVersion.findFirst({
      orderBy: { id: "desc" },
      select: { id: true, wordCount: true, createdAt: true },
    }),
  ]);
  return Response.json({ users, invitations, pack }, { headers });
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const body = await smallJson(request);
    const result = await prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(94740, 1)`;
        if (body.action === "invite") {
          if (typeof body.label !== "string" || !body.label.trim() || body.label.length > 100)
            throw new Error("Enter an invitation label.");
          if (
            (await db.userInvitation.count({
              where: { usedAt: null, revokedAt: null, expires: { gt: new Date() } },
            })) >= 50
          )
            throw new Error("Revoke unused invitations first (maximum 50 active invitations).");
          const token = newToken();
          const invitation = await db.userInvitation.create({
            data: {
              label: body.label.trim(),
              tokenHash: hashToken(token),
              expires: new Date(Date.now() + 7 * 86400000),
            },
          });
          await identityAudit(
            db,
            1,
            1,
            "invitation.created",
            "Single-use invitation created",
            undefined,
            { type: "invitation", id: invitation.id },
          );
          const url = new URL("/invite", process.env.NEXTAUTH_URL || request.url);
          url.hash = `token=${token}`;
          return { url: url.href };
        }
        if (body.action === "revoke-invite") {
          if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id))
            throw new Error("Choose an invitation.");
          await db.userInvitation.update({
            where: { id: body.id },
            data: { revokedAt: new Date() },
          });
          await identityAudit(db, 1, 1, "invitation.revoked", "Invitation revoked", undefined, {
            type: "invitation",
            id: body.id,
          });
          return {};
        }
        if (body.action === "publish") {
          const pack = await publishStarter(db);
          await identityAudit(
            db,
            1,
            1,
            "vocabulary.pack_published",
            "Starter vocabulary published",
            { count: pack.wordCount },
          );
          return { pack: { id: pack.id, wordCount: pack.wordCount } };
        }
        if (!Number.isInteger(body.userId) || body.userId <= 1)
          throw new Error("Choose a member account. Owner access cannot be changed here.");
        const user = await db.user.findFirst({ where: { id: body.userId, role: "MEMBER" } });
        if (!user) throw new Error("Member not found.");
        if (body.action === "update") {
          const permissions = validPermissions(body.permissions);
          if (typeof body.active !== "boolean") throw new Error("Choose active or suspended.");
          await db.user.update({ where: { id: user.id }, data: { active: body.active } });
          await db.userPermission.deleteMany({ where: { userId: user.id } });
          await db.userPermission.createMany({
            data: permissions.map((capability) => ({ userId: user.id, capability })),
          });
          await identityAudit(
            db,
            user.id,
            1,
            "member.permissions_changed",
            "Member access updated",
            { active: body.active, type: permissions.join(",") },
          );
        } else if (body.action !== "revoke-sessions")
          throw new Error("Choose a management action.");
        if (body.action === "revoke-sessions" || !body.active) {
          await db.pushSubscription.updateMany({
            where: { userId: user.id },
            data: { active: false },
          });
          await db.pushDelivery.updateMany({
            where: { subscription: { userId: user.id }, status: "PENDING" },
            data: { status: "SKIPPED", errorCode: "DISABLED", leaseUntil: null },
          });
          await db.authSession.deleteMany({ where: { userId: user.id } });
          await db.authLinkIntent.deleteMany({ where: { userId: user.id } });
          if (body.action === "revoke-sessions")
            await identityAudit(
              db,
              user.id,
              1,
              "member.sessions_revoked",
              "Member sessions revoked",
            );
        }
        return {};
      },
      { timeout: 20000 },
    );
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && !("code" in error)
            ? error.message
            : "Unable to save account management changes.",
      },
      { status: 400, headers },
    );
  }
}
