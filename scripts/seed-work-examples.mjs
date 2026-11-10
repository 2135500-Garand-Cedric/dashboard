import { PrismaClient } from "../src/generated/prisma/index.js";
import { seedWorkExamples } from "./work-example-data.mjs";
if (process.env.NODE_ENV !== "development" || process.env.ALLOW_WORK_EXAMPLES !== "1")
  throw new Error(
    "Run explicitly in development with ALLOW_WORK_EXAMPLES=1. Never run on production.",
  );
const db = new PrismaClient({ log: [] });
try {
  const result = await seedWorkExamples(db);
  console.log(
    JSON.stringify({
      reused: result.reused,
      period: result.period,
      tasks: result.taskIds.length,
      events: result.eventIds.length,
      updatedVerifiedSamples: result.editedEventIds.length,
      convertedVerifiedSamples: result.convertedEventIds.length,
    }),
  );
} catch {
  console.error(
    "Work examples failed. No private content was logged. Check the development schema and rerun to resume safely.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
