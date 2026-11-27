import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID, OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { appendAudit } from "./writer.mjs";
export async function auditAuthentication(action: "signed-in" | "signed-out" | "denied") {
  try {
    await prisma.$transaction(
      async (db) => {
        if (action === "denied") {
          await db.$executeRaw`SELECT pg_advisory_xact_lock(94729, ${OWNER_DATABASE_USER_ID}::integer)`;
          if (
            (await db.auditEvent.count({
              where: {
                userId: OWNER_DATABASE_USER_ID,
                category: "AUTH",
                outcome: "DENIED",
                occurredAt: { gte: new Date(Date.now() - 3600000) },
              },
            })) >= 20
          )
            return;
        }
        await appendAudit(db, {
          userId: OWNER_DATABASE_USER_ID,
          actorKind: action === "denied" ? "ANONYMOUS" : "OWNER",
          actorGithubId: OWNER_GITHUB_ID,
          category: "AUTH",
          entityType: "auth",
          action: `auth.${action}`,
          outcome: action === "denied" ? "DENIED" : "SUCCESS",
          summary:
            action === "denied"
              ? "GitHub sign-in denied"
              : action === "signed-in"
                ? "GitHub owner signed in"
                : "Owner signed out",
          entityReference: "GitHub authentication",
        });
      },
      { timeout: 2500, maxWait: 1000 },
    );
  } catch {
    // Authentication remains available during audit/database outages.
    console.error("Audit: authentication history unavailable.");
  }
}
