import { loadWorkModule } from "./work-support.mjs";

export function searchModules(db) {
  const validation = loadWorkModule("src/lib/finance/validation.ts");
  const transactions = loadWorkModule("src/lib/finance/transactions.ts", {
    "./validation": validation,
  });
  const workValidation = loadWorkModule("src/lib/work-management/validation.ts", {
    "next/server": { NextResponse: { json: (value, options) => Response.json(value, options) } },
  });
  const holidays = loadWorkModule("src/lib/holidays.ts", {
    "./work-management/validation": workValidation,
  });
  const annual = loadWorkModule("src/lib/calendar-annual.ts");
  const types = loadWorkModule("src/lib/search/types.ts");
  const deps = {
    "@/lib/prisma": { prisma: db },
    "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1 },
    "@/lib/time-zone-context": { getAppTimeZone: () => "UTC" },
    "@/lib/work-management/date-format": loadWorkModule("src/lib/work-management/date-format.ts"),
    "@/lib/finance/transactions": transactions,
    "@/lib/finance/activity-links": loadWorkModule("src/lib/finance/activity-links.ts"),
    "@/lib/holidays": holidays,
    "@/lib/calendar-annual": annual,
    "./types": types,
  };
  for (const name of ["shared", "work", "knowledge", "calendar", "finance", "people-vocabulary"])
    deps[`./adapters/${name}`] = loadWorkModule(`src/lib/search/adapters/${name}.ts`);
  return { types, deps, server: loadWorkModule("src/lib/search/server.ts", deps) };
}
