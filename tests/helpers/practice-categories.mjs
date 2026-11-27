import fs from "node:fs";
import ts from "typescript";
const result = {};
const code = ts.transpileModule(
  fs.readFileSync(
    new URL("../../src/lib/japanese/practice-categories.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
new Function("exports", code)(result);
export const practiceCategorySelection = result.practiceCategorySelection;
export const VERB_DICTIONARY_CATEGORY = result.VERB_DICTIONARY_CATEGORY;
