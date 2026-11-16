import fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import * as crypto from "node:crypto";
import ts from "typescript";
export function loadTaskFoundation(validation) {
  function load(relative, dependencies = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    new Function("exports", "require", code)(exports, (name) => dependencies[name]);
    return exports;
  }
  const types = load("../../src/lib/work-management/types.ts");
  const fields = load("../../src/lib/work-management/task-foundation.ts", {
    "./validation": validation,
    "./types": types,
  });
  const zone = load("../../src/lib/app-time-zone.ts");
  const format = load("../../src/lib/work-management/date-format.ts");
  const dates = load("../../src/lib/work-management/dates.ts", {
    "./validation": validation,
    "./date-format": format,
  });
  const query = load("../../src/lib/work-management/query.ts", {
    "./validation": validation,
    "./types": types,
    "./dates": dates,
    "./planning-rules": load("../../src/lib/work-management/planning-rules.ts", {
      "./dates": dates,
    }),
    "@/lib/app-time-zone": zone,
    "@/lib/time-zone-context": { getAppTimeZone: () => zone.APP_TIME_ZONE },
  });
  const policy = { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" };
  const activity = load("../../src/lib/work-management/activity-server.ts", {
    "@/lib/owner-policy": policy,
    "./types": types,
  });
  const graph = load("../../src/lib/work-management/graph.ts", {
    "node:crypto": crypto,
    "@/lib/owner-policy": policy,
    "./activity-server": activity,
    "./validation": validation,
    "./types": types,
  });
  const lifecycle = load("../../src/lib/work-management/date-lifecycle.ts", {
    "./activity-server": activity,
  });
  const legacyDates = load("../../src/lib/event-dates.ts");
  const core = load("../../src/lib/work-management/event-core.ts", {
    "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" },
    "@/lib/app-time-zone": zone,
    "@/lib/time-zone-context": { getAppTimeZone: () => zone.APP_TIME_ZONE },
    "./activity-server": activity,
    "./graph": graph,
    "./dates": dates,
    "./validation": validation,
    "@/lib/event-dates": legacyDates,
  });
  const projectCore = load("../../src/lib/work-management/project-core.ts", {
    "@/lib/owner-policy": policy,
    "./validation": validation,
  });
  return {
    "./read-snapshot": load("../../src/lib/work-management/read-snapshot.ts", {
      "node:async_hooks": { AsyncLocalStorage },
    }),
    "./project-core": projectCore,
    "./event-core": core,
    "./dates": dates,
    "@/lib/app-time-zone": zone,
    "@/lib/time-zone-context": { getAppTimeZone: () => zone.APP_TIME_ZONE },
    "./date-lifecycle": lifecycle,
    "./types": types,
    "./task-foundation": fields,
    "./query": query,
    "./activity-server": activity,
    "./graph": graph,
  };
}
