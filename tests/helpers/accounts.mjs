import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as context from "../../src/lib/accounts/context.mjs";
import * as writer from "../../src/lib/audit/writer.mjs";
import * as identity from "../../src/lib/owner-identity.mjs";
export function accountModules(db, overrides = {}) {
  const root = fileURLToPath(new URL("../../", import.meta.url)),
    cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const result = {};
    cache.set(file, result);
    const native = createRequire(file);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("exports", "require", code)(result, (name) => {
      if (name in overrides) return overrides[name];
      if (
        name === "@/lib/prisma" ||
        path.resolve(path.dirname(file), name) == path.resolve(root, "src/lib/prisma")
      )
        return { prisma: db };
      if (name.endsWith("/accounts/context.mjs") || name === "./context.mjs") return context;
      if (name.endsWith("/audit/writer.mjs") || name === "./writer.mjs") return writer;
      if (name.endsWith("/owner-identity.mjs")) return identity;
      if (name === "@/generated/prisma")
        return native(path.join(root, "src/generated/prisma/index.js"));
      if (name.startsWith("@/"))
        return load(`src/${name.slice(2)}${path.extname(name) ? "" : ".ts"}`);
      if (name.startsWith("."))
        return load(path.resolve(path.dirname(file), `${name}${path.extname(name) ? "" : ".ts"}`));
      return native(name);
    });
    return result;
  }
  return { load, context };
}
