import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const formNames = ["ba", "nakereba"];
const verbTypes = ["ru", "u", "suru", "kuru", "honorific"];

export async function backfill(prisma, conjugateVerb, { apply = false, log = console.log } = {}) {
  const verbs = await prisma.vocabulary.findMany({
    where: { OR: [{ verbType: { not: null } }, { category: { name: { equals: "verb", mode: "insensitive" } } }] },
    include: { verbForms: { include: { formType: true, activityVocab: true } } },
    orderBy: { id: "asc" },
  });
  const activities = await prisma.activity.findMany({ select: { id: true } });
  const summary = { scanned: verbs.length, affected: 0, forms: 0, practiceRecords: 0, skipped: 0 };
  const prepared = [];

  for (const verb of verbs) {
    const { japanese, hiragana, verbType } = verb;
    try {
      if (!verbTypes.includes(verbType)) throw new Error("missing or unsupported verb type");
      if (!japanese || !hiragana) throw new Error("missing Japanese spelling or reading");
      const ending = verbType === "suru" ? "する" : verbType === "kuru" ? "くる" : (verbType === "ru" || verbType === "honorific") ? "る" : null;
      if (ending && !hiragana.endsWith(ending)) throw new Error(`reading does not end in ${ending}`);
      const forms = conjugateVerb(japanese, hiragana, verbType);
      let missingForms = 0;
      let missingLinks = 0;
      for (const name of formNames) {
        if (!forms[name]) throw new Error(`conjugator did not produce ${name}`);
        const existing = verb.verbForms.find((form) => form.formType.name === name);
        if (!existing) missingForms += 1;
        missingLinks += activities.filter((activity) => !existing?.activityVocab.some((link) => link.activityId === activity.id)).length;
      }
      if (missingForms || missingLinks) {
        log(`Verb ${verb.id} (${japanese}): ${missingForms} missing forms, ${missingLinks} missing practice records`);
        prepared.push({ id: verb.id, forms });
        summary.affected += 1;
        summary.forms += missingForms;
        summary.practiceRecords += missingLinks;
      }
    } catch (error) {
      summary.skipped += 1;
      log(`SKIPPED verb ${verb.id} (${japanese || "no spelling"}): ${error.message}`);
    }
  }

  if (apply) {
    // Register the types even if this database has not run the data migration yet.
    const types = await Promise.all(formNames.map((name) => prisma.verbFormType.upsert({
      where: { name }, update: {},
      create: { name, description: name === "ba" ? "ば conditional form" : "なければ negative conditional form" },
    })));
    summary.forms = 0;
    summary.practiceRecords = 0;
    for (const verb of prepared) {
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.verbForm.createMany({
          data: types.map((type) => ({
            baseVocabId: verb.id, formTypeId: type.id,
            form: verb.forms[type.name].form, reading: verb.forms[type.name].reading,
          })),
          skipDuplicates: true,
        });
        const forms = await tx.verbForm.findMany({
          where: { baseVocabId: verb.id, formTypeId: { in: types.map((type) => type.id) } },
          select: { id: true },
        });
        const links = await tx.activityVocab.createMany({
          data: forms.flatMap((form) => activities.map((activity) => ({
            verbFormId: form.id, activityId: activity.id, status: "WEAK",
          }))),
          skipDuplicates: true,
        });
        return { forms: created.count, links: links.count };
      });
      summary.forms += result.forms;
      summary.practiceRecords += result.links;
    }
  }
  log(`${apply ? "APPLIED" : "DRY RUN"}: ${summary.scanned} verbs scanned, ${summary.affected} affected, ${summary.forms} forms ${apply ? "added" : "missing"}, ${summary.practiceRecords} practice records ${apply ? "added" : "missing"}, ${summary.skipped} skipped.`);
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) {
    throw new Error("Usage: npm run backfill:verb-conditionals -- [--dry-run | --apply]");
  }
  // Use the same TypeScript conjugator as the app, including future corrections.
  const { default: ts } = await import("typescript");
  const source = fs.readFileSync(new URL("../src/lib/japanese/conjugation.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const moduleExports = {};
  new Function("exports", compiled)(moduleExports);
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient();
  try {
    const result = await backfill(prisma, moduleExports.conjugateVerb, { apply: args.includes("--apply") });
    if (result.skipped) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
