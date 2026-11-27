import * as actorContext from "../../src/lib/accounts/context.mjs";
import fs from "node:fs";
import ts from "typescript";
import * as writer from "../../src/lib/audit/writer.mjs";
import * as dates from "../../src/lib/audit/dates.mjs";
import * as identity from "../../src/lib/owner-identity.mjs";

// Load actual audit code against the same injected database used by domain tests.
export function auditTestDependency(name, dependencies = {}) {
  if (["./owner-identity.mjs", "@/lib/owner-identity.mjs"].includes(name)) return identity;
  const match = /^(?:@\/lib\/audit\/|\.\/audit\/)([a-z-]+)$/.exec(name);
  if (!match) return undefined;
  const cache = { "./writer.mjs": writer, "./dates.mjs": dates };
  function load(key) {
    if (cache[key]) return cache[key];
    const file = key.replace(/^\.\//, "").replace(/\.ts$/, "");
    const exports = {};
    cache[key] = exports;
    const code = ts.transpileModule(
      fs.readFileSync(new URL(`../../src/lib/audit/${file}.ts`, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      },
    ).outputText;
    new Function("exports", "require", code)(exports, (dep) => {
      if (dep === "@/lib/accounts/context.mjs") return actorContext;
      if (dep === "@/lib/prisma") return dependencies[dep];
      if (dep === "@/lib/owner-policy") return identity;
      if (dep.startsWith("./")) return load(dep);
      throw new Error(`Unexpected audit dependency: ${dep}`);
    });
    return exports;
  }
  return load(`./${match[1]}`);
}
