import { randomUUID } from "node:crypto";
import { EmailError, sendEmail } from "./resend.mjs";
import { Prisma } from "../../generated/prisma/index.js";
import { withEmailPermission } from "./preferences.mjs";

const RETRY_WINDOW = 20 * 3600000; // Stay below Resend's 24-hour idempotency lifetime.

export async function enqueueEmail(db, userId, { kind, key, payload }, now = new Date()) {
  if (!/^[a-z][a-z0-9-]{0,49}$/.test(kind) || !/^[\w:/.-]{1,150}$/.test(key))
    throw new EmailError("EMAIL_JOB_INVALID");
  await db.emailDelivery.createMany({
    skipDuplicates: true,
    data: { userId, kind, dedupeKey: key, payload, nextAttemptAt: now, createdAt: now },
  });
  return db.emailDelivery.findUniqueOrThrow({
    where: { userId_dedupeKey: { userId, dedupeKey: key } },
  });
}

// Reusable queue, independent of report templates. Prepare is a server-owned
// template registry; it must return an immutable Resend message without secrets.
export async function deliverEmails(
  db,
  {
    userId,
    config,
    prepare,
    now = new Date(),
    send = sendEmail,
    allowed = (job) => !!job,
    env = process.env,
  },
) {
  const jobs = await db.emailDelivery.findMany({
    where: {
      userId,
      status: "PENDING",
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 1,
  });
  let sent = 0,
    failed = 0;
  for (const job of jobs) {
    const token = randomUUID();
    const claimed = await db.emailDelivery.updateMany({
      where: {
        id: job.id,
        userId,
        status: "PENDING",
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        claimToken: token,
        leaseUntil: new Date(now.getTime() + 5 * 60000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    const owned = { id: job.id, userId, status: "PENDING", claimToken: token };
    if (!allowed(job)) {
      await db.emailDelivery.updateMany({
        where: owned,
        data: {
          status: "FAILED",
          errorCode: "EMAIL_TEMPLATE_DISABLED",
          leaseUntil: null,
          claimToken: null,
        },
      });
      failed++;
      continue;
    }
    if (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= RETRY_WINDOW) {
      await db.emailDelivery.updateMany({
        where: owned,
        data: {
          status: "UNKNOWN",
          errorCode: "DELIVERY_UNCERTAIN",
          leaseUntil: null,
          claimToken: null,
        },
      });
      failed++;
      continue;
    }
    let attempted = false;
    try {
      const message = job.message || (await prepare(job, config));
      // Persist the exact PDF/body before any network call. Retries must not
      // regenerate changed totals, random PDF IDs, or a different sender/recipient.
      const ready = await db.emailDelivery.updateMany({
        where: owned,
        data: {
          message,
          firstAttemptAt: job.firstAttemptAt || now,
        },
      });
      if (!ready.count) continue;
      attempted = true;
      await withEmailPermission(
        db,
        userId,
        message,
        async (tx, currentConfig) => {
          const stillOwned = await tx.emailDelivery.count({ where: owned });
          if (!stillOwned) throw new EmailError("EMAIL_PERMISSION_CHANGED");
          const accepted = await send(message, {
            config: currentConfig,
            key: `dashboard/${job.id}`,
          });
          await tx.emailDelivery.updateMany({
            where: owned,
            data: {
              status: "SENT",
              providerId: accepted.id,
              sentAt: now,
              errorCode: null,
              leaseUntil: null,
              claimToken: null,
            },
          });
        },
        env,
      );
      sent++;
    } catch (error) {
      const retryable = !(error instanceof EmailError) || error.retryable;
      const terminal = !retryable || job.attempts + 1 >= 8;
      await db.emailDelivery.updateMany({
        where: owned,
        data: {
          status: terminal
            ? retryable && (attempted || job.firstAttemptAt)
              ? "UNKNOWN"
              : "FAILED"
            : "PENDING",
          errorCode: error instanceof EmailError ? error.code : "EMAIL_PREPARATION_FAILED",
          leaseUntil: null,
          claimToken: null,
          nextAttemptAt: new Date(
            now.getTime() +
              Math.max(
                error instanceof EmailError ? error.retryAfter : 0,
                Math.min(900, 30 * 2 ** job.attempts),
              ) *
                1000,
          ),
        },
      });
      failed++;
    }
  }
  // Keep compact deduplication/history rows; remove old prepared PDF/message data.
  await db.emailDelivery.updateMany({
    where: {
      userId,
      status: { not: "PENDING" },
      updatedAt: { lt: new Date(now.getTime() - 30 * 86400000) },
      message: { not: Prisma.DbNull },
    },
    data: { message: Prisma.DbNull },
  });
  return { sent, failed };
}
