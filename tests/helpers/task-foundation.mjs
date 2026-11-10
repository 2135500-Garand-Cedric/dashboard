import fs from "node:fs";
import * as crypto from "node:crypto";
import ts from "typescript";
export function loadTaskFoundation(validation) {
  function load(relative, dependencies = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
    new Function("exports", "require", code)(exports, name => dependencies[name]); return exports;
  }
  const types = load("../../src/lib/work-management/types.ts");
  const fields = load("../../src/lib/work-management/task-foundation.ts", { "./validation": validation, "./types": types });
  const query = load("../../src/lib/work-management/query.ts", { "./validation": validation, "./types": types });
  const policy = { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" };
  const activity = load("../../src/lib/work-management/activity-server.ts", { "@/lib/owner-policy": policy, "./types": types });
  const graph = load("../../src/lib/work-management/graph.ts", { "node:crypto": crypto, "@/lib/owner-policy": policy, "./activity-server": activity, "./validation": validation, "./types": types });
  return { "./types": types, "./task-foundation": fields, "./query": query, "./activity-server": activity, "./graph": graph };
}
