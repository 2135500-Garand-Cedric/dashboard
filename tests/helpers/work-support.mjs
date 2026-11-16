import { timeZoneTestDependency } from "./time-zone.mjs";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import sharp from "sharp";
import { loadTaskFoundation } from "./task-foundation.mjs";
const require = createRequire(import.meta.url);
export function loadWorkModule(file, deps = {}) {
  const exports = {},
    code = ts.transpileModule(
      fs.readFileSync(new URL(file, new URL("../../", import.meta.url)), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2017,
          esModuleInterop: true,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText;
  new Function("exports", "require", code)(exports, (name) =>
    Object.hasOwn(deps, name) ? deps[name] : (timeZoneTestDependency(name) ?? require(name)),
  );
  return exports;
}
export function supportModules(db) {
  const validation = loadWorkModule("src/lib/work-management/validation.ts", {
    "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
  });
  const primitives = loadWorkModule("src/lib/documents/private-files.ts"),
    files = loadWorkModule("src/lib/work-management/files.ts", {
      "@/lib/documents/private-files": primitives,
      "./validation": validation,
    });
  const deps = {
    ...loadTaskFoundation(validation),
    "./validation": validation,
    "@/lib/prisma": { prisma: db },
    "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" },
    "@/lib/event-dates": loadWorkModule("src/lib/event-dates.ts"),
  };
  const server = loadWorkModule("src/lib/work-management/server.ts", deps),
    noteInput = loadWorkModule("src/lib/work-management/note-input.ts", {
      "./validation": validation,
    });
  const supportingDeps = {
    ...deps,
    "./server": server,
    "./files": files,
    "./note-input": noteInput,
  };
  return {
    validation,
    primitives,
    files,
    server,
    supporting: loadWorkModule("src/lib/work-management/supporting.ts", supportingDeps),
    supportingDeps,
    noteInput,
  };
}
export const samplePng = await sharp({
  create: { width: 2, height: 2, channels: 3, background: "white" },
})
  .png()
  .toBuffer();
export function samplePdf() {
  const parts = ["%PDF-1.4\n"],
    offsets = [0];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });
  const start = Buffer.byteLength(parts.join(""));
  parts.push(
    `xref\n0 5\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`,
  );
  return Buffer.from(parts.join(""));
}
