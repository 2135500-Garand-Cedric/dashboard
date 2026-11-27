import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { OWNER_GITHUB_ID, OWNER_DATABASE_USER_ID } from "@/lib/owner-identity.mjs";
import { appendAudit, auditSnapshot } from "@/lib/audit/writer.mjs";
import { JAPANESE_CAPABILITIES } from "./capabilities";
import { hashToken } from "./security";

export async function identityAudit(
  db: Prisma.TransactionClient,
  userId: number,
  actorId: number | null,
  action: string,
  summary: string,
  after?: Record<string, unknown>,
  reference?: { type: string; id: string | number },
) {
  return appendAudit(db, {
    userId,
    actorKind:
      actorId === null ? "ANONYMOUS" : actorId === OWNER_DATABASE_USER_ID ? "OWNER" : "USER",
    actorGithubId: actorId === OWNER_DATABASE_USER_ID ? OWNER_GITHUB_ID : undefined,
    actorUserId: actorId,
    category: "AUTH",
    entityType: reference?.type ?? "settings",
    entityId: String(reference?.id ?? userId),
    entityReference: reference ? `${reference.type} #${reference.id}` : `Account #${userId}`,
    action,
    summary,
    after: auditSnapshot(after),
  });
}
export async function authorizeIdentity(input: {
  provider: string;
  subject: string;
  email: string | null;
  verified: boolean;
  name: string | null;
  invite?: string;
  link?: string;
  currentSession?: string;
}) {
  if (
    !["google", "github"].includes(input.provider) ||
    !input.subject ||
    input.subject.length > 200
  )
    return false;
  return prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(94740, 1)`;
      const existing = await db.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: input.provider,
            providerAccountId: input.subject,
          },
        },
        include: { user: true },
      });
      const session = input.currentSession
        ? await db.authSession.findFirst({
            where: {
              tokenHash: hashToken(input.currentSession),
              expires: { gt: new Date() },
              user: { active: true },
            },
          })
        : null;
      if (existing) {
        if (!existing.user.active || (session && session.userId !== existing.userId)) return false;
        await db.user.update({
          where: { id: existing.userId },
          data: { lastSignedInAt: new Date() },
        });
        if (session)
          await db.authSession.update({
            where: { id: session.id },
            data: { authenticatedAt: new Date() },
          });
        return true;
      }
      if (session) {
        const intent = input.link
          ? await db.authLinkIntent.findFirst({
              where: {
                tokenHash: hashToken(input.link),
                userId: session.userId,
                sessionId: session.id,
                provider: input.provider,
                expires: { gt: new Date() },
              },
            })
          : null;
        if (!intent || Date.now() - session.authenticatedAt.getTime() > 10 * 60000) return false;
        await db.authAccount.create({
          data: {
            userId: session.userId,
            provider: input.provider,
            providerAccountId: input.subject,
          },
        });
        await db.authLinkIntent.delete({ where: { tokenHash: intent.tokenHash } });
        await identityAudit(
          db,
          session.userId,
          session.userId,
          "account.linked",
          "Sign-in method linked",
          { type: input.provider },
        );
        return true;
      }
      // Bootstrap is mapped by migration, never by email or first sign-up.
      if (input.provider === "github" && input.subject === OWNER_GITHUB_ID) return false;
      const invitation = input.invite
        ? await db.userInvitation.findFirst({
            where: {
              tokenHash: hashToken(input.invite),
              usedAt: null,
              revokedAt: null,
              expires: { gt: new Date() },
            },
          })
        : null;
      if (!invitation) return false;
      // Email collision requires an explicit account link, never automatic merging.
      const email = input.verified && input.email ? input.email.toLowerCase() : null;
      if (email && (await db.user.findUnique({ where: { email } }))) return false;
      const user = await db.user.create({
        data: {
          email,
          emailVerified: email ? new Date() : null,
          name: input.name?.slice(0, 100),
          role: "MEMBER",
          lastSignedInAt: new Date(),
          permissions: { create: JAPANESE_CAPABILITIES.map((capability) => ({ capability })) },
        },
      });
      await db.authAccount.create({
        data: { userId: user.id, provider: input.provider, providerAccountId: input.subject },
      });
      await db.userInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date(), usedById: user.id },
      });
      await identityAudit(db, user.id, user.id, "account.created", "Invited account created", {
        type: input.provider,
      });
      return true;
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}
