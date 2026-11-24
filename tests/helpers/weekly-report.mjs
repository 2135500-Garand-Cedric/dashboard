import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function weeklyModules(db, overrides = {}) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const native = createRequire(file);
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    new Function("exports", "require", compiled)(exports, (name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === "@/lib/prisma") return { prisma: db };
      if (name === "@/generated/prisma")
        return native(path.join(root, "src/generated/prisma/index.js"));
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`));
      return native(name);
    });
    return exports;
  }
  return {
    load,
    period: load("src/lib/weekly-report/period.ts"),
    zone: load("src/lib/time-zone-context.ts"),
    work: load("src/lib/weekly-report/work.ts"),
    learning: load("src/lib/weekly-report/learning.ts"),
    server: load("src/lib/weekly-report/server.ts"),
  };
}
