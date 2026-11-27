import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { recordAudit } from "./server";

// Failure reporting is outside the rolled-back business transaction. Never copy
// the exception message, input body or database diagnostic into the history.
export async function recordSaveFailure(category: string, entityType: string, error: unknown) {
  try {
    await prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(94730, ${owner}::integer)`;
        const count = await db.auditEvent.count({
          where: {
            userId: owner,
            category,
            outcome: "FAILED",
            occurredAt: { gte: new Date(Date.now() - 3600000) },
          },
        });
        if (count >= 20) return;
        const status =
          error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
        const code =
          status === 409 ? "conflict" : status >= 400 && status < 500 ? "rejected" : "failed";
        await recordAudit(db, {
          category,
          entityType,
          action: `save.${code}`,
          outcome: "FAILED",
          summary:
            code === "conflict"
              ? "Save conflict; no change committed"
              : code === "rejected"
                ? "Save rejected; no change committed"
                : "Save failed; no change committed",
        });
      },
      { timeout: 2500, maxWait: 1000 },
    );
  } catch {
    console.error("Audit: failed-save history unavailable.");
  }
}
