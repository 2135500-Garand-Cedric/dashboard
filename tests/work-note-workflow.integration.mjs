import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";

test(
  "notes atomically change status, project streams reuse task notes, and project targets are calendar markers",
  {
    skip: process.env.RUN_WORK_NOTE_WORKFLOW_DB_TEST !== "1",
  },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const { server, supporting, projects, calendar } = loadWorkServices(db);
    const prefix = `__note_workflow_${randomUUID()}`;
    const taskIds = [],
      projectIds = [],
      keys = [];
    const command = (revision) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(revision ? { revision } : {}) };
    };
    const createTask = async (data = {}) => {
      const row = await server.createTodo({ title: prefix, ...data }, command());
      taskIds.push(row.id);
      return row;
    };
    const timeline = (parent, filter = "notes", page = "1") =>
      supporting.taskTimeline(parent, new URLSearchParams({ filter, page }));
    let project, other, task, foreign;
    try {
      project = await projects.createProject(
        { name: `${prefix} project`, targetDate: "2027-06-15" },
        command(),
      );
      other = await projects.createProject({ name: `${prefix} other` }, command());
      projectIds.push(project.id, other.id);
      await projects.projectStageCommand(project.id, { name: "Build" }, command(project.revision));
      const stage = (await projects.getProject(project.id)).stages.find(
        (row) => row.name === "Build",
      );
      task = await createTask({ projectId: project.id, stageId: stage.id });
      assert.equal(task.stageId, stage.id);

      await t.test(
        "status and note save once, metadata survives edits, and project feed has a labeled reference",
        async () => {
          const body = {
            body: "Sent email; waiting for reply",
            taskStatus: "WAITING",
            taskRevision: task.revision,
          };
          const key = command();
          const first = await supporting.createNote(task.id, body, key);
          const retry = await supporting.createNote(task.id, body, key);
          assert.equal(retry.id, first.id);
          assert.equal((await server.getTodo(task.id)).status, "WAITING");
          assert.equal(await db.workNote.count({ where: { todoId: task.id } }), 1);
          assert.equal(first.occurredAt, null);
          assert.deepEqual(first.documentationUrls, []);
          const shared = (await timeline({ projectId: project.id })).notes.find(
            (note) => note.id === first.id,
          );
          assert.equal(shared.sourceTask.id, task.id);
          assert.equal(shared.sourceTask.title, task.title);
          assert.deepEqual(shared.statusChange, { before: "NEW", after: "WAITING" });
          await supporting.patchNote(
            task.id,
            first.id,
            { body: "Updated email note" },
            command(first.revision),
          );
          const updated = (await timeline({ projectId: project.id })).notes.find(
            (note) => note.id === first.id,
          );
          assert.equal(updated.body, "Updated email note");
          assert.deepEqual(updated.statusChange, { before: "NEW", after: "WAITING" });
          const all = await timeline({ projectId: project.id }, "all");
          assert.ok(all.activity.some((entry) => entry.noteRevision?.note.id === first.id));
          const direct = await supporting.createNote(
            { projectId: project.id },
            { body: "Project-wide update" },
            command(),
          );
          const feed = await timeline({ projectId: project.id });
          assert.equal(feed.total, 2);
          assert.equal(feed.notes.find((note) => note.id === direct.id).sourceTask, null);
        },
      );
      await t.test(
        "stale versions, blocked transitions and project status injection do not save notes",
        async () => {
          const before = await db.workNote.count();
          await assert.rejects(
            supporting.createNote(
              task.id,
              { body: "stale", taskStatus: "TODO", taskRevision: 1 },
              command(),
            ),
            (error) => error.status === 409,
          );
          const blocker = await createTask();
          const dependent = await createTask({ dependsOnId: blocker.id, projectId: project.id });
          await assert.rejects(
            supporting.createNote(
              dependent.id,
              { body: "blocked", taskStatus: "IN_PROGRESS", taskRevision: dependent.revision },
              command(),
            ),
            (error) => error.status === 409,
          );
          assert.equal((await server.getTodo(dependent.id)).status, "NEW");
          await assert.rejects(
            supporting.createNote(
              { projectId: project.id },
              { body: "invalid", taskStatus: "WAITING", taskRevision: 1 },
              command(),
            ),
            (error) => error.status === 400,
          );
          assert.equal(await db.workNote.count(), before);
        },
      );
      await t.test(
        "a late note failure also rolls back task status and audit changes",
        async () => {
          const before = await server.getTodo(task.id);
          const activityCount = await db.workActivity.count({ where: { todoId: task.id } });
          await db.$executeRawUnsafe(
            `CREATE FUNCTION workflow_reject_note() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.body = 'REJECT_WORKFLOW_NOTE' THEN RAISE EXCEPTION 'test note failure'; END IF; RETURN NEW; END $$`,
          );
          await db.$executeRawUnsafe(
            'CREATE TRIGGER workflow_reject_note BEFORE INSERT ON "WorkNote" FOR EACH ROW EXECUTE FUNCTION workflow_reject_note()',
          );
          try {
            await assert.rejects(
              supporting.createNote(
                task.id,
                {
                  body: "REJECT_WORKFLOW_NOTE",
                  taskStatus: "BACKLOG",
                  taskRevision: before.revision,
                },
                command(),
              ),
            );
          } finally {
            await db.$executeRawUnsafe('DROP TRIGGER workflow_reject_note ON "WorkNote"');
            await db.$executeRawUnsafe("DROP FUNCTION workflow_reject_note()");
          }
          assert.equal((await server.getTodo(task.id)).status, before.status);
          assert.equal((await server.getTodo(task.id)).revision, before.revision);
          assert.equal(await db.workActivity.count({ where: { todoId: task.id } }), activityCount);
        },
      );
      await t.test(
        "project aggregation excludes foreign records, includes archived tasks, and follows membership",
        async () => {
          foreign = await db.user.create({ data: { email: `${prefix}@example.invalid` } });
          await assert.rejects(
            db.workNote.create({
              data: {
                userId: foreign.id,
                projectId: project.id,
                actorGithubId: "foreign",
                body: "Private other-owner note",
              },
            }),
          );
          const foreignProject = await db.workProject.create({
            data: { userId: foreign.id, name: `${prefix} private` },
          });
          await assert.rejects(
            timeline({ projectId: foreignProject.id }),
            (error) => error.status === 404,
          );
          const options = await projects.projectOptions();
          assert.ok(options.items.some((row) => row.id === project.id));
          assert.ok(!options.items.some((row) => row.id === foreignProject.id));
          await db.workProject.delete({ where: { id: foreignProject.id } });
          let current = await server.getTodo(task.id);
          current = await server.patchTodo(task.id, { archived: true }, command(current.revision));
          assert.ok(
            (await timeline({ projectId: project.id })).notes.some(
              (note) => note.todoId === task.id,
            ),
          );
          current = await server.patchTodo(task.id, { archived: false }, command(current.revision));
          await projects.taskMembership(
            task.id,
            { projectId: other.id, stageId: null },
            command(current.revision),
          );
          assert.ok(
            !(await timeline({ projectId: project.id })).notes.some(
              (note) => note.todoId === task.id,
            ),
          );
          assert.ok(
            (await timeline({ projectId: other.id })).notes.some((note) => note.todoId === task.id),
          );
        },
      );
      await t.test(
        "project note pagination merges direct and task notes without duplicate rows",
        async () => {
          for (let index = 0; index < 22; index++)
            await supporting.createNote(
              index % 2 ? task.id : { projectId: other.id },
              { body: `Page note ${index}` },
              command(),
            );
          const first = await timeline({ projectId: other.id });
          const second = await timeline({ projectId: other.id }, "notes", "2");
          assert.equal(first.total, 23);
          assert.equal(first.notes.length, 20);
          assert.equal(second.notes.length, 3);
          assert.equal(new Set([...first.notes, ...second.notes].map((note) => note.id)).size, 23);
        },
      );
      await t.test(
        "target dates are scoped, colored, exclusive of range end, and create no Event",
        async () => {
          const before = await db.event.count();
          const params = new URLSearchParams({
            start: "2027-06-01T00:00:00Z",
            end: "2027-07-01T00:00:00Z",
            project: String(project.id),
            layers: "milestones",
          });
          const feed = await calendar.calendarFeed(params);
          const target = feed.items.find((item) => item.id === `project-target:${project.id}`);
          assert.equal(target.start, "2027-06-15");
          assert.equal(target.allDay, true);
          assert.equal(target.extendedProps.kind, "PROJECT_TARGET");
          params.set("project", "none");
          assert.equal((await calendar.calendarFeed(params)).items.length, 0);
          params.set("project", String(project.id));
          params.set("layers", "events");
          assert.ok(
            !(await calendar.calendarFeed(params)).items.some((item) =>
              item.id.startsWith("project-target:"),
            ),
          );
          assert.equal(await db.event.count(), before);
        },
      );
      await t.test("Done and Cancelled remain active until explicitly archived", async () => {
        for (const status of ["DONE", "CANCELLED"]) {
          let closed = await createTask();
          closed = await server.patchTodo(closed.id, { status }, command(closed.revision));
          const query = new URLSearchParams({ q: closed.reference });
          assert.ok((await server.searchWork(query)).items.some((row) => row.id === closed.id));
          await server.patchTodo(closed.id, { archived: true }, command(closed.revision));
          assert.equal((await server.searchWork(query)).items.length, 0);
          query.set("view", "archived");
          assert.equal((await server.searchWork(query)).items[0].id, closed.id);
        }
      });
    } finally {
      const parents = { OR: [{ todoId: { in: taskIds } }, { projectId: { in: projectIds } }] };
      await db.workActivity.deleteMany({ where: parents });
      await db.workNoteRevision.deleteMany({ where: { note: parents } });
      await db.workNote.deleteMany({ where: parents });
      await db.todoDependency.deleteMany({
        where: { OR: [{ dependentId: { in: taskIds } }, { prerequisiteId: { in: taskIds } }] },
      });
      await db.todo.updateMany({
        where: { id: { in: taskIds } },
        data: { dependsOnId: null, parentId: null },
      });
      await db.todo.deleteMany({ where: { id: { in: taskIds } } });
      await db.workProjectStage.deleteMany({ where: { projectId: { in: projectIds } } });
      await db.workProject.deleteMany({ where: { id: { in: projectIds } } });
      await db.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
      if (foreign) await db.user.delete({ where: { id: foreign.id } });
      await db.$disconnect();
    }
  },
);
