import { pruneAudit } from "../src/lib/audit/writer.mjs";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { pushConfiguration } from "../src/lib/notifications/rules.mjs";
import { runReminderPass } from "../src/lib/notifications/engine.mjs";
import { runEmailWorkerPass } from "../src/lib/email/worker.mjs";

import { ensureOccurrences } from "../src/lib/recurrence/engine.mjs";

let lastGeneration = 0;
let lastEmailPass = 0;
let lastAuditRetention = 0;
const db = new PrismaClient({ log: [] });
let stopping = false,
  wake,
  timer;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    clearTimeout(timer);
    wake?.();
  });
const config = pushConfiguration();
console.log(
  config
    ? "[notifications] Reminder worker started."
    : "[notifications] Inbox worker started; push delivery is disabled.",
);
try {
  while (!stopping) {
    try {
      if (Date.now() - lastGeneration > 3600000) {
        await ensureOccurrences(db);
        lastGeneration = Date.now();
      }
      const result = await runReminderPass(db, { config });
      if (result.sent)
        console.log(`[notifications] ${result.sent} reminders accepted by push services.`);
    } catch {
      // Never log endpoints, encryption keys, titles, payloads or raw DB errors.
      await db.notificationSettings
        .updateMany({ where: { userId: 1 }, data: { workerError: "WORKER_ERROR" } })
        .catch(() => {});
      console.error(
        "[notifications] Worker pass failed. Check database availability and migrations.",
      );
    }
    if (!stopping && Date.now() - lastEmailPass >= 60000) {
      lastEmailPass = Date.now();
      const mail = await runEmailWorkerPass();
      if (mail.sent) console.log(`[email] ${mail.sent} messages accepted by the email provider.`);
      if (mail.error)
        console.error(
          "[email] Delivery unavailable. Check email configuration and delivery status.",
        );
    }
    if (!stopping && Date.now() - lastAuditRetention >= 3600000) {
      try {
        await pruneAudit(db);
        lastAuditRetention = Date.now();
      } catch {
        console.error("Audit: retention unavailable.");
      }
    }
    if (!stopping)
      await new Promise((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, 30000);
      });
  }
} finally {
  await db.$disconnect();
}
