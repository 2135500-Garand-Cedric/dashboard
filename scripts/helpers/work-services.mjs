// Development maintenance only: execute the same TypeScript commands as the API.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
export function loadWorkServices(db) {
  const root = fileURLToPath(new URL("../../", import.meta.url)),
    cache = new Map();
  function load(filename) {
    const file = path.resolve(root, filename);
    if (file === path.join(root, "src/lib/prisma.ts")) return { prisma: db };
    if (cache.has(file)) return cache.get(file).exports;
    const unit = { exports: {} };
    cache.set(file, unit);
    const native = createRequire(file);
    const require = (name) => {
      if (name === "@/lib/prisma") return { prisma: db };
      if (name.startsWith("@/generated/prisma"))
        return native(path.join(root, "src/generated/prisma/index.js"));
      if (name.startsWith("@/"))
        return load(`src/${name.slice(2)}${path.extname(name) ? "" : ".ts"}`);
      if (name.startsWith("."))
        return load(path.resolve(path.dirname(file), `${name}${path.extname(name) ? "" : ".ts"}`));
      return native(name);
    };
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("exports", "require", code)(unit.exports, require);
    return unit.exports;
  }
  return {
    knowledgeImages: load("src/lib/knowledge/images.ts"),
    knowledgeTemplates: load("src/lib/knowledge/templates.ts"),
    knowledgeFolders: load("src/lib/knowledge/folders.ts"),
    knowledge: load("src/lib/knowledge/server.ts"),
    knowledgeExport: load("src/lib/knowledge/export.ts"),
    recurrence: load("src/lib/work-management/recurrence-server.ts"),
    holidays: load("src/lib/holidays.ts"),
    holidaySelections: load("src/lib/holiday-server.ts"),
    birthdays: load("src/lib/birthday-server.ts"),
    occasions: load("src/lib/calendar-occasion-server.ts"),
    settings: load("src/lib/user-settings.ts"),
    timeZone: load("src/lib/time-zone-context.ts"),
    japaneseDates: load("src/lib/japanese/dates.ts"),
    format: load("src/lib/work-management/date-format.ts"),
    config: load("src/lib/app-time-zone.ts"),
    server: load("src/lib/work-management/server.ts"),
    myWork: load("src/lib/work-management/my-work-server.ts"),
    projects: load("src/lib/work-management/project-server.ts"),
    calendar: load("src/lib/work-management/calendar-server.ts"),
    dates: load("src/lib/work-management/date-server.ts"),
    relationships: load("src/lib/work-management/relationships.ts"),
    supporting: load("src/lib/work-management/supporting.ts"),
    taskDetails: load("src/lib/work-management/task-details.ts"),
  };
}
