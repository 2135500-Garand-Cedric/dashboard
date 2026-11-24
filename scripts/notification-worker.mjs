import { PrismaClient } from "../src/generated/prisma/index.js";
import { pushConfiguration } from "../src/lib/notifications/rules.mjs";
import { runReminderPass } from "../src/lib/notifications/engine.mjs";

import { ensureOccurrences } from "../src/lib/recurrence/engine.mjs";

let lastGeneration = 0;
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
    if (!stopping)
      await new Promise((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, 30000);
      });
  }
} finally {
  await db.$disconnect();
}
