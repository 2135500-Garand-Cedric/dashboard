import fs from "node:fs";
import ts from "typescript";
const result = {};
const code = ts.transpileModule(
  fs.readFileSync(new URL("../../src/lib/japanese/category-kind.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
new Function("exports", code)(result);
export const categoryKind = result.categoryKind;
