import fs from "node:fs";
import ts from "typescript";
export function loadTaskFoundation(validation) {
  function load(relative, dependencies = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
    new Function("exports", "require", code)(exports, name => dependencies[name]); return exports;
  }
  const types = load("../../src/lib/work-management/types.ts");
  const fields = load("../../src/lib/work-management/task-foundation.ts", { "./validation": validation, "./types": types });
  return { "./types": types, "./task-foundation": fields };
}
