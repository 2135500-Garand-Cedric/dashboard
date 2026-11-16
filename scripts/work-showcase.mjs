// Opt-in examples for a dedicated empty test database, never restored user data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { loadWorkServices } from "./helpers/work-services.mjs";
import { seedWorkExamples } from "./work-example-data.mjs";

const dataset = "work-phase10-showcase-v1";
const key = (name) => {
  const hex = createHash("sha256").update(`${dataset}:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};
export function assertShowcaseEnvironment() {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
  assert.equal(process.env.ALLOW_WORK_EXAMPLES, "1");
  const url = new URL(process.env.DATABASE_URL || "file:missing");
  assert.equal(url.hostname, "work-db");
  assert.equal(url.pathname, "/work_examples", "Use only the dedicated empty examples database.");
}
function syntheticPdf() {
  const drawing = "0.1 0.4 0.8 rg 20 20 160 80 re f\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}endstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(text);
  text += "xref\n0 5\n0000000000 65535 f \n";
  for (const offset of offsets) text += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(`${text}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
export async function workShowcase(db, action = "seed") {
  assertShowcaseEnvironment();
  assert.ok(["seed", "archive"].includes(action));
  const api = loadWorkServices(db);
  const receipt = (name) =>
    db.workMutationReceipt.findUnique({
      where: { userId_requestKey: { userId: 1, requestKey: key(name) } },
    });
  const step = async (name, operation) => {
    const previous = await receipt(name);
    return previous ? previous.result : operation({ requestKey: key(name) });
  };
  const complete = await receipt("complete");
  if (action === "archive") {
    assert.ok(complete, "Finish or resume seeding before archiving this dataset.");
    const manifest = complete.result;
    for (const id of manifest.taskIds) {
      const row = await api.server.getTodo(id);
      const created = await db.workMutationReceipt.findFirst({
        where: { userId: 1, operation: "todo:create", result: { path: ["id"], equals: id } },
      });
      assert.ok(
        created && /^\[(Example|Showcase)\]/.test(created.result.title),
        "Refusing a task without recorded example provenance.",
      );
      if (!row.archivedAt)
        await step(`archive:task:${id}`, (command) =>
          api.server.patchTodo(id, { archived: true }, { ...command, revision: row.revision }),
        );
    }
    for (const id of manifest.projectIds) {
      const state = await api.projects.projectTransition(id);
      if (!state.project.archivedAt)
        await step(`archive:project:${id}`, (command) =>
          api.projects.transitionProject(
            id,
            { action: "archive", token: state.token, allowUnfinished: true },
            { ...command, revision: state.project.revision },
          ),
        );
    }
    for (const id of manifest.eventIds) {
      const row = await api.server.getEvent(id);
      if (!row.superseded && !row.completed)
        await step(`archive:event:${id}`, (command) =>
          api.server.patchEvent(id, { completed: true }, { ...command, revision: row.revision }),
        );
    }
    return { ...manifest, archived: true };
  }
  if (complete) return { ...complete.result, reused: true };
  const user = await db.user.findUnique({ where: { id: 1 } });
  assert.ok(
    !user || user.email === "work-showcase@invalid.test",
    "Never seed a real owner database.",
  );
  if (!(await receipt("start"))) {
    for (const model of [
      "todo",
      "event",
      "workProject",
      "workContact",
      "financialAccount",
      "vocabulary",
    ]) {
      assert.equal(
        await db[model].count(),
        0,
        "Start with an empty, separately migrated examples database.",
      );
    }
    assert.ok((await db.user.count()) <= 1);
  }
  if (!user)
    await db.user.create({
      data: {
        id: 1,
        email: "work-showcase@invalid.test",
        name: "Synthetic owner",
        totalXp: 0,
        coins: 0,
      },
    });
  const start = await step("start", (command) =>
    api.server.mutation("showcase:start", { dataset }, command, async () => ({
      startedAt: new Date().toISOString(),
    })),
  );
  for (const name of ["Work", "School", "Personal"]) {
    await db.activityType.upsert({
      where: { name },
      update: {},
      create: { name, color: "#3b82f6" },
    });
  }
  const examples = await seedWorkExamples(db, new Date(start.startedAt));
  const taskIds = [...examples.taskIds],
    eventIds = [...examples.eventIds];
  const activityTypes = await db.activityType.findMany();
  const projectIds = [];
  for (const [name, activityTypeName] of [
    ["Laptop rollout", "Work"],
    ["Course preparation", "School"],
  ]) {
    const project = await step(`project:${name}`, (command) =>
      api.projects.createProject(
        {
          name: `[Showcase] ${name}`,
          objective: "Synthetic project; stages are separate from task statuses.",
          activityTypeId: activityTypes.find((row) => row.name === activityTypeName).id,
        },
        command,
      ),
    );
    projectIds.push(project.id);
  }
  const all = await Promise.all(taskIds.map((id) => api.server.getTodo(id)));
  const laptop = all.find((row) => row.title === "[Example] Prepare an employee laptop");
  const study = all.find((row) => row.title === "[Example] Prepare for midterm");
  const patch = async (name, id, body) =>
    step(name, async (command) =>
      api.server.patchTodo(id, body, {
        ...command,
        revision: (await api.server.getTodo(id)).revision,
      }),
    );
  for (const [index, row] of [laptop, study].entries()) {
    const project = await api.projects.getProject(projectIds[index]);
    await step(`membership:${row.id}`, async (command) =>
      api.projects.taskMembership(
        row.id,
        { projectId: project.id, stageId: project.stages[1].id },
        { ...command, revision: (await api.server.getTodo(row.id)).revision },
      ),
    );
  }
  await step("cross-project-related", async (command) =>
    api.relationships.relationshipCommand(
      laptop.id,
      { kind: "related", targetId: study.id },
      { ...command, revision: (await api.server.getTodo(laptop.id)).revision },
    ),
  );
  const planning = await api.myWork.myWork(new URLSearchParams());
  const today = planning.date;
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  await step("overdue-deadline", async (command) =>
    api.dates.taskDateCommand(
      laptop.id,
      { action: "deadline", date: { kind: "DATE", date: yesterday.toISOString().slice(0, 10) } },
      { ...command, revision: (await api.server.getTodo(laptop.id)).revision },
    ),
  );
  const waiting = all.find((row) => row.title === "[Example] Follow replacement printer delivery");
  await step("due-followup", async (command) => {
    const current = await db.workFollowUp.findFirstOrThrow({
      where: { todoId: waiting.id, status: "ACTIVE" },
    });
    return api.dates.taskDateCommand(
      waiting.id,
      {
        action: "followup-snooze",
        id: current.id,
        date: { kind: "DATE", date: today },
        reason: "Synthetic next vendor check, separate from deadline.",
      },
      { ...command, revision: (await api.server.getTodo(waiting.id)).revision },
    );
  });
  await step("focus", async (command) =>
    api.myWork.setFocus(
      laptop.id,
      { date: today, active: true },
      { ...command, revision: (await api.server.getTodo(laptop.id)).revision },
    ),
  );
  for (const parent of [laptop.id, { projectId: projectIds[0] }]) {
    const name = typeof parent === "number" ? "task" : "project";
    const note = await step(`note:${name}`, (command) =>
      api.supporting.createNote(
        parent,
        {
          body: "Synthetic progress note before testing.",
          documentationUrls: ["https://example.com/runbook"],
        },
        command,
      ),
    );
    await step(`note:${name}:edit`, (command) =>
      api.supporting.patchNote(
        parent,
        note.id,
        {
          body: "Synthetic progress note after testing; inspect its retained earlier version.",
          documentationUrls: ["https://example.com/runbook"],
        },
        { ...command, revision: note.revision },
      ),
    );
    const pdf = name === "project";
    const buffer = pdf
      ? syntheticPdf()
      : await sharp({
          create: { width: 240, height: 120, channels: 3, background: "#2563eb" },
        })
          .png()
          .toBuffer();
    await step(`file:${name}`, (command) =>
      api.supporting.uploadAttachment(
        parent,
        {
          buffer,
          originalName: `synthetic-${name}.${pdf ? "pdf" : "png"}`,
          extension: pdf ? "pdf" : "png",
          mimeType: pdf ? "application/pdf" : "image/png",
          contentHash: createHash("sha256").update(buffer).digest("hex"),
        },
        command,
      ),
    );
  }
  await step("project-milestone", async (command) =>
    api.projects.projectMilestoneCommand(
      projectIds[0],
      { action: "create", label: "Synthetic pilot review", date: { kind: "DATE", date: today } },
      { ...command, revision: (await api.projects.getProject(projectIds[0])).revision },
    ),
  );
  const converted = await step("conversion-task", (command) =>
    api.server.createTodo(
      {
        title: "[Showcase] Submit a converted assignment",

        activityTypeId: activityTypes.find((row) => row.name === "School").id,
      },
      command,
    ),
  );
  taskIds.push(converted.id);
  const source = await step("conversion-source", (command) =>
    api.server.createEvent(
      {
        title: "[Showcase] Legacy assignment placeholder",
        date: new Date(start.startedAt).toISOString(),
      },
      command,
    ),
  );
  eventIds.push(source.id);
  await step("conversion-confirm", async (command) => {
    const body = {
      mode: "PLACEHOLDER",
      taskId: converted.id,
      changeDeadline: true,
      deadline: { kind: "DATE", date: today },
    };
    const preview = await api.calendar.previewConversion(source.id, body);
    return api.calendar.confirmConversion(
      source.id,
      { ...body, previewToken: preview.token },
      { ...command, revision: preview.event.revision },
    );
  });
  await step("today-session", (command) =>
    api.server.createEvent(
      {
        title: "[Showcase] Today's reserved work",
        kind: "WORK_SESSION",
        timing: {
          kind: "TIMED",
          start: { kind: "TIME", local: `${today}T15:00`, timeZone: planning.timeZone },
          end: { kind: "TIME", local: `${today}T16:00`, timeZone: planning.timeZone },
        },
        links: [{ todoId: laptop.id, role: "SESSION_TARGET" }],
      },
      command,
    ),
  ).then((row) => eventIds.push(row.id));
  const archived = await step("archive-task", (command) =>
    api.server.createTodo(
      {
        title: "[Showcase] Archived history",
      },
      command,
    ),
  );
  taskIds.push(archived.id);
  await patch("archive-example", archived.id, { archived: true });
  return step("complete", (command) =>
    api.server.mutation("showcase:complete", { dataset }, command, async () => ({
      dataset,
      startedAt: start.startedAt,
      taskIds,
      eventIds,
      projectIds,
      reused: false,
    })),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PrismaClient } = await import("../src/generated/prisma/index.js");
  const db = new PrismaClient({ log: [] });
  try {
    assert.equal(process.argv.length, 3);
    const result = await workShowcase(db, process.argv[2]);
    console.log(
      JSON.stringify({
        dataset,
        reused: result.reused,
        archived: result.archived || false,
        tasks: result.taskIds.length,
        events: result.eventIds.length,
        projects: result.projectIds.length,
      }),
    );
  } catch {
    console.error(
      "Showcase failed. Use only work_examples, inspect its schema/storage, and rerun to resume. No private values were logged.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
