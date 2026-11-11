import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
import { samplePng } from "./helpers/work-support.mjs";

test(
  "Phase 08 projects reuse canonical tasks and protected support records",
  { skip: process.env.RUN_WORK_PROJECT_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.notEqual(process.env.NODE_ENV, "production");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js"),
      db = new PrismaClient({ log: [] });
    const services = loadWorkServices(db),
      api = services.projects,
      tasks = services.server,
      support = services.supporting;
    const prefix = `__phase08_${randomUUID()}`,
      taskIds = [],
      projectIds = [],
      keys = [],
      eventIds = [];
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    const reject = (promise, status = 409) => assert.rejects(promise, (e) => e.status === status);
    const project = async (name) => {
      const row = await api.createProject({ name: `${prefix} ${name}` }, command());
      projectIds.push(row.id);
      return row;
    };
    const task = async (fields) => {
      const row = await tasks.createTodo({ title: prefix, ...fields }, command());
      taskIds.push(row.id);
      return row;
    };
    const membership = async (row, projectId, stageId = null) =>
      api.taskMembership(row.id, { projectId, stageId }, command(await tasks.getTodo(row.id)));
    const milestone = async (row, fields) =>
      api.projectMilestoneCommand(row.id, fields, command(await api.getProject(row.id)));
    let a, b, standalone, child, cancelled, archived, foreign, attachment;
    const originalTasks = await db.todo.findMany({ orderBy: { id: "asc" } });
    const balance = await db.user.findUniqueOrThrow({
      where: { id: 1 },
      select: { totalXp: true, coins: true, updatedAt: true },
    });
    try {
      await t.test(
        "project creation is retry-safe, stages are independent and originals stay standalone",
        async () => {
          const key = command(),
            body = { name: `${prefix} A`, objective: "Improve a test system" };
          const results = await Promise.all([
            api.createProject(body, key),
            api.createProject(body, key),
          ]);
          assert.equal(results[0].id, results[1].id);
          a = results[0];
          projectIds.push(a.id);
          b = await project("B");
          assert.equal(a.stages.length, 4);
          assert.deepEqual(
            a.stages.map((row) => row.name),
            ["Requirements", "Implementation", "Testing", "Launch"],
          );
          assert.equal(await db.todo.count({ where: { projectId: { in: projectIds } } }), 0);
          standalone = await task();
          assert.equal(standalone.projectId, null);
          assert.equal(standalone.status, "NEW");
          const old = await db.todo.findMany({
            where: { id: { in: originalTasks.map((row) => row.id) } },
            orderBy: { id: "asc" },
          });
          assert.deepEqual(old, originalTasks);
        },
      );
      await t.test(
        "membership preserves every task field, URL identity, checklist, links and parent policy",
        async () => {
          const original = await task({ status: "TODO" });
          await tasks.createSubtask(
            original.id,
            { title: "Keep this checklist row" },
            command(await tasks.getTodo(original.id)),
          );
          await services.dates.taskDateCommand(
            original.id,
            { action: "deadline", date: { kind: "DATE", date: "2026-11-25" } },
            command(await tasks.getTodo(original.id)),
          );
          const before = await db.todo.findUniqueOrThrow({ where: { id: original.id } });
          await membership(original, a.id, a.stages[1].id);
          const after = await db.todo.findUniqueOrThrow({ where: { id: original.id } });
          for (const field of Object.keys(before).filter(
            (key) => !["projectId", "stageId", "revision", "updatedAt"].includes(key),
          ))
            assert.deepEqual(after[field], before[field], field);
          assert.equal(after.revision, before.revision + 1);
          const root = await tasks.getTodo(original.id);
          assert.equal(root.subtasks.length, 1);
          assert.equal(root.reference, original.reference);
          child = await task({
            parentId: original.id,
            parentRevision: root.revision,
            projectId: b.id,
          });
          assert.equal((await tasks.getTodo(child.id)).parentId, original.id);
          await membership(original, null);
          assert.equal((await tasks.getTodo(child.id)).projectId, b.id);
          const linked = await services.relationships.relationshipCommand(
            original.id,
            { kind: "blocked-by", targetId: child.id },
            command(await tasks.getTodo(original.id)),
          );
          assert.ok(linked);
          await membership(original, a.id);
          assert.equal(
            await db.todoDependency.count({
              where: { dependentId: original.id, prerequisiteId: child.id },
            }),
            1,
          );
        },
      );
      await t.test(
        "stage/project/owner mismatches are rejected by services and database constraints",
        async () => {
          await reject(membership(standalone, a.id, b.stages[0].id), 400);
          await reject(membership(standalone, null, a.stages[0].id), 400);
          foreign = await db.user.create({ data: { email: `${prefix}@invalid.test` } });
          const alien = await db.workProject.create({ data: { userId: foreign.id, name: prefix } });
          projectIds.push(alien.id);
          await reject(membership(standalone, alien.id), 404);
          await reject(api.getProject(alien.id), 404);
          await assert.rejects(
            db.todo.update({ where: { id: standalone.id }, data: { projectId: alien.id } }),
          );
          await assert.rejects(
            db.todo.update({
              where: { id: standalone.id },
              data: { stageId: a.stages[0].id, projectId: null },
            }),
          );
          await assert.rejects(
            db.todo.update({
              where: { id: standalone.id },
              data: { projectId: a.id, stageId: b.stages[0].id },
            }),
          );
          await assert.rejects(
            db.workNote.create({
              data: {
                userId: 1,
                projectId: alien.id,
                actorGithubId: "89470930",
                body: "Not allowed",
              },
            }),
          );
          await assert.rejects(
            db.workNote.create({
              data: {
                userId: 1,
                projectId: a.id,
                todoId: standalone.id,
                actorGithubId: "89470930",
                body: "Two parents",
              },
            }),
          );
        },
      );
      await t.test(
        "new project tasks are atomic, stages do not alter status and moves reject stale versions",
        async () => {
          const row = await task({ projectId: a.id, stageId: a.stages[0].id });
          assert.equal(row.status, "NEW");
          const original = await tasks.getTodo(row.id),
            key = command(original);
          const results = await Promise.all([
            api.taskMembership(row.id, { projectId: b.id, stageId: b.stages[2].id }, key),
            api.taskMembership(row.id, { projectId: b.id, stageId: b.stages[2].id }, key),
          ]);
          assert.equal(results[0].id, results[1].id);
          assert.equal((await tasks.getTodo(row.id)).status, "NEW");
          await reject(api.taskMembership(row.id, { projectId: a.id }, command(original)));
          await reject(
            tasks.createTodo(
              { title: prefix, projectId: a.id, stageId: b.stages[0].id },
              command(),
            ),
            400,
          );
          const before = await db.todo.count();
          await reject(
            tasks.createTodo({ title: prefix, stageId: a.stages[0].id }, command()),
            400,
          );
          assert.equal(await db.todo.count(), before);
        },
      );
      await t.test(
        "stage edits and deactivation retain members and block new assignments",
        async () => {
          const row = await task({ projectId: b.id, stageId: b.stages[3].id });
          const changed = await api.projectStageCommand(
            b.id,
            { id: b.stages[3].id, name: "Release", active: false, position: 5 },
            command(await api.getProject(b.id)),
          );
          assert.equal(changed.stages.find((stage) => stage.id === b.stages[3].id).active, false);
          assert.equal((await tasks.getTodo(row.id)).stageId, b.stages[3].id);
          await reject(membership(standalone, b.id, b.stages[3].id), 400);
          const created = await api.projectStageCommand(
            b.id,
            { name: "Review", position: 2 },
            command(await api.getProject(b.id)),
          );
          assert.equal(created.stages.length, 5);
          await reject(
            api.projectStageCommand(b.id, { name: "review" }, command(await api.getProject(b.id))),
          );
        },
      );
      await t.test(
        "counts exclude Cancelled and archived work without claiming effort progress",
        async () => {
          cancelled = await task({ projectId: a.id });
          await tasks.patchTodo(cancelled.id, { status: "CANCELLED" }, command(cancelled));
          archived = await task({ projectId: a.id });
          await tasks.patchTodo(archived.id, { archived: true }, command(archived));
          const done = await task({ projectId: a.id });
          await tasks.patchTodo(done.id, { status: "DONE" }, command(done));
          const row = await api.getProject(a.id),
            actual = await db.todo.findMany({ where: { projectId: a.id, userId: 1 } });
          assert.equal(
            row.counts.total,
            actual.filter((item) => !item.archivedAt && item.status !== "CANCELLED").length,
          );
          assert.equal(row.counts.completed, 1);
          assert.equal(row.counts.cancelled, 1);
          assert.equal(row.counts.archived, 1);
        },
      );
      await t.test(
        "project notes share revisions and deny wrong task/project/foreign parent paths",
        async () => {
          const parent = { projectId: a.id },
            note = await support.createNote(
              parent,
              { body: "A project decision", documentationUrls: [] },
              command(),
            );
          const edited = await support.patchNote(
            parent,
            note.id,
            { body: "Revised decision", documentationUrls: ["https://example.com/reference"] },
            command(note),
          );
          const versions = await support.noteRevisions(parent, note.id, new URLSearchParams());
          assert.equal(versions.items.length, 2);
          assert.equal(versions.items[1].body, "A project decision");
          await reject(
            support.patchNote(
              { projectId: b.id },
              note.id,
              { body: "Wrong parent", documentationUrls: [] },
              command(edited),
            ),
            404,
          );
          await reject(
            support.patchNote(
              standalone.id,
              note.id,
              { body: "Wrong kind", documentationUrls: [] },
              command(edited),
            ),
            404,
          );
          await reject(
            support.createNote(
              { projectId: projectIds.at(-1) },
              { body: "Foreign", documentationUrls: [] },
              command(),
            ),
            404,
          );
          const log = await support.taskTimeline(parent, new URLSearchParams({ filter: "all" }));
          assert.ok(log.activity.some((row) => row.noteRevision?.body === "Revised decision"));
          await support.removeNote(parent, note.id, command(edited));
          assert.equal(
            (await support.noteRevisions(parent, note.id, new URLSearchParams())).items.length,
            3,
          );
        },
      );
      await t.test(
        "project originals use private file validation, protected read, replacement and cleanup",
        async () => {
          // Use the same byte validator via the maintenance module loader.
          const { loadWorkModule } = await import("./helpers/work-support.mjs");
          const primitives = loadWorkModule("src/lib/documents/private-files.ts");
          const file = await primitives.prepareDocument(
            new File([samplePng], "project.png", { type: "image/png" }),
          );
          attachment = await support.uploadAttachment({ projectId: a.id }, file, command());
          assert.deepEqual(
            (await support.readAttachment({ projectId: a.id }, attachment.id)).buffer,
            samplePng,
          );
          await reject(support.readAttachment({ projectId: b.id }, attachment.id), 404);
          await reject(support.readAttachment(standalone.id, attachment.id), 404);
          await reject(
            support.readAttachment({ projectId: projectIds.at(-1) }, attachment.id),
            404,
          );
          const replacement = await support.uploadAttachment(
            { projectId: a.id },
            file,
            command(attachment),
            attachment.id,
          );
          assert.equal(replacement.id, attachment.id);
          assert.equal(replacement.revision, 2);
          await support.removeAttachment({ projectId: a.id }, attachment.id, command(replacement));
          await reject(support.readAttachment({ projectId: a.id }, attachment.id), 404);
        },
      );
      await t.test(
        "milestones keep date-only/exact semantics, reach state and unique calendar sources",
        async () => {
          await milestone(a, {
            action: "create",
            label: "Launch",
            date: { kind: "DATE", date: "2026-11-20" },
          });
          const data = await api.projectMilestones(a.id),
            row = data.items[0];
          assert.equal(row.todoId, null);
          assert.equal(row.projectId, a.id);
          const feed = () =>
            services.calendar.calendarFeed(
              new URLSearchParams({
                start: "2026-11-01T00:00:00Z",
                end: "2026-12-01T00:00:00Z",
                project: String(a.id),
              }),
            );
          let projected = await feed();
          const marker = projected.items.find((item) => item.id === `milestone:${row.id}`);
          assert.equal(marker.extendedProps.href, `/projects/${a.id}#project-milestones`);
          assert.equal(marker.extendedProps.busy, false);
          const eventsBefore = await db.event.count();
          await milestone(a, {
            action: "edit",
            id: row.id,
            label: "Launch window",
            date: { kind: "TIME", local: "2026-11-21T10:00", timeZone: "America/Toronto" },
          });
          assert.equal(
            (await api.projectMilestones(a.id)).items[0].at.toISOString(),
            "2026-11-21T15:00:00.000Z",
          );
          await milestone(a, { action: "complete", id: row.id, completed: true });
          assert.ok((await api.projectMilestones(a.id)).items[0].completedAt);
          assert.equal(await db.event.count(), eventsBefore);
          await reject(
            api.projectMilestoneCommand(
              b.id,
              { action: "remove", id: row.id },
              command(await api.getProject(b.id)),
            ),
            404,
          );
          projected = await feed();
          assert.ok(
            projected.items
              .find((item) => item.id === `milestone:${row.id}`)
              .title.includes("Reached"),
          );
          await milestone(a, { action: "remove", id: row.id });
          assert.ok(!(await feed()).items.some((item) => item.id === `milestone:${row.id}`));
          await reject(
            milestone(a, {
              action: "create",
              label: "Gap",
              date: { kind: "TIME", local: "2026-03-08T02:30", timeZone: "America/Toronto" },
            }),
            400,
          );
        },
      );
      await t.test(
        "shared list/board criteria and calendar filter canonical project task/events",
        async () => {
          const row = await task({ projectId: b.id });
          const event = await tasks.createEvent(
            {
              title: prefix,
              date: "2026-11-15T16:00:00Z",
              links: [{ todoId: row.id, role: "RELATED" }],
            },
            command(),
          );
          eventIds.push(event.id);
          const unlinked = await tasks.createEvent(
            { title: prefix, date: "2026-11-15T17:00:00Z" },
            command(),
          );
          eventIds.push(unlinked.id);
          const standaloneFeed = await services.calendar.calendarFeed(
            new URLSearchParams({
              start: "2026-11-01T00:00:00Z",
              end: "2026-12-01T00:00:00Z",
              project: "none",
            }),
          );
          assert.ok(standaloneFeed.items.some((item) => item.id === `event:${unlinked.id}`));
          assert.ok(!standaloneFeed.items.some((item) => item.id === `event:${event.id}`));
          const joint = await services.calendar.calendarFeed(
            new URLSearchParams({
              start: "2026-11-01T00:00:00Z",
              end: "2026-12-01T00:00:00Z",
              project: String(b.id),
              context: "none",
            }),
          );
          assert.ok(!joint.items.some((item) => item.id === `event:${event.id}`));
          const found = await tasks.searchWork(
            new URLSearchParams({ project: String(b.id), view: "all" }),
          );
          assert.ok(found.items.length);
          assert.ok(found.items.every((item) => item.projectId === b.id));
          const stage = await tasks.searchWork(
            new URLSearchParams({
              project: String(b.id),
              stage: String(b.stages[2].id),
              view: "all",
            }),
          );
          assert.ok(stage.items.every((item) => item.stageId === b.stages[2].id));
          const feed = await services.calendar.calendarFeed(
            new URLSearchParams({
              start: "2026-11-01T00:00:00Z",
              end: "2026-12-01T00:00:00Z",
              project: String(b.id),
            }),
          );
          assert.ok(feed.items.some((item) => item.id === `event:${event.id}`));
          const other = await services.calendar.calendarFeed(
            new URLSearchParams({
              start: "2026-11-01T00:00:00Z",
              end: "2026-12-01T00:00:00Z",
              project: String(a.id),
            }),
          );
          assert.ok(!other.items.some((item) => item.id === `event:${event.id}`));
        },
      );
      await t.test(
        "fresh closure review, reopen/archive and history never cascade to tasks or sessions",
        async () => {
          let review = await api.projectTransition(a.id);
          await reject(
            api.transitionProject(
              a.id,
              { action: "complete", token: review.token },
              command(review.project),
            ),
          );
          const changed = await task({ projectId: a.id });
          await reject(
            api.transitionProject(
              a.id,
              { action: "complete", token: review.token, allowUnfinished: true },
              command(review.project),
            ),
          );
          review = await api.projectTransition(a.id);
          await tasks.patchTodo(
            changed.id,
            { title: `${prefix} changed while reviewing` },
            command(await tasks.getTodo(changed.id)),
          );
          await reject(
            api.transitionProject(
              a.id,
              { action: "complete", token: review.token, allowUnfinished: true },
              command(review.project),
            ),
          );
          const session = await tasks.createEvent(
            {
              title: prefix,
              kind: "WORK_SESSION",
              timing: {
                kind: "TIMED",
                start: { kind: "TIME", local: "2026-11-26T10:00", timeZone: "America/Toronto" },
                end: { kind: "TIME", local: "2026-11-26T11:00", timeZone: "America/Toronto" },
              },
              links: [{ todoId: changed.id, role: "SESSION_TARGET" }],
            },
            command(),
          );
          eventIds.push(session.id);
          const eventBefore = await tasks.getEvent(session.id);
          review = await api.projectTransition(a.id);
          const before = await db.todo.findMany({
            where: { projectId: a.id },
            orderBy: { id: "asc" },
          });
          const row = await api.transitionProject(
            a.id,
            {
              action: "complete",
              token: review.token,
              allowUnfinished: true,
              summary: "Explicit test closure",
            },
            command(review.project),
          );
          assert.equal(row.status, "COMPLETED");
          assert.deepEqual(await tasks.getEvent(session.id), eventBefore);
          assert.deepEqual(
            await db.todo.findMany({ where: { projectId: a.id }, orderBy: { id: "asc" } }),
            before,
          );
          assert.ok(
            (
              await api.listProjects(new URLSearchParams({ view: "history", q: prefix }))
            ).items.some((item) => item.id === a.id),
          );
          await reject(membership(standalone, a.id));
          let reopened = await api.transitionProject(a.id, { action: "reopen" }, command(row));
          assert.equal(reopened.completedAt, null);
          review = await api.projectTransition(a.id);
          const archivedProject = await api.transitionProject(
            a.id,
            { action: "archive", token: review.token, allowUnfinished: true },
            command(review.project),
          );
          assert.ok(archivedProject.archivedAt);
          assert.equal((await tasks.getTodo(changed.id)).archivedAt, null);
          reopened = await api.transitionProject(
            a.id,
            { action: "restore" },
            command(archivedProject),
          );
          assert.equal(reopened.archivedAt, null);
        },
      );
      await t.test(
        "closure also warns about unfinished archived members outside the progress denominator",
        async () => {
          const root = await project("Archived unfinished"),
            member = await task({ projectId: root.id });
          await tasks.patchTodo(member.id, { archived: true }, command(member));
          const review = await api.projectTransition(root.id);
          assert.equal(review.counts.unfinished, 0);
          assert.equal(review.counts.total, 0);
          assert.equal(review.openTaskCount, 1);
          await reject(
            api.transitionProject(
              root.id,
              { action: "complete", token: review.token },
              command(review.project),
            ),
          );
          await api.transitionProject(
            root.id,
            { action: "complete", token: review.token, allowUnfinished: true },
            command(review.project),
          );
          const kept = await tasks.getTodo(member.id);
          assert.equal(kept.status, "NEW");
          assert.ok(kept.archivedAt);
        },
      );
      await t.test("explicit deletion retains project history and retries once", async () => {
        const row = await task({ projectId: b.id }),
          key = command(row),
          before = (await api.getProject(b.id)).counts.total;
        await tasks.deleteTodo(row.id, key);
        await tasks.deleteTodo(row.id, key);
        assert.equal((await api.getProject(b.id)).counts.total, before - 1);
        assert.equal(
          await db.workActivity.count({
            where: {
              projectId: b.id,
              action: "TASK_DELETED",
              changes: { path: ["task", "before", "id"], equals: row.id },
            },
          }),
          1,
        );
      });
      await t.test(
        "late membership audit failure rolls back membership, versions, history and receipts",
        async () => {
          const before = await captureInventory(db),
            key = command(await tasks.getTodo(standalone.id));
          await db.$executeRawUnsafe(
            `CREATE FUNCTION phase08_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='TASK_MEMBERSHIP_CHANGED' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
          );
          await db.$executeRawUnsafe(
            `CREATE TRIGGER phase08_fail_audit BEFORE INSERT ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION phase08_fail_audit()`,
          );
          try {
            await assert.rejects(api.taskMembership(standalone.id, { projectId: a.id }, key));
          } finally {
            await db.$executeRawUnsafe('DROP TRIGGER phase08_fail_audit ON "WorkActivity"');
            await db.$executeRawUnsafe("DROP FUNCTION phase08_fail_audit()");
          }
          const after = await captureInventory(db);
          for (const [table, entry] of Object.entries(before.tables))
            assert.equal(after.tables[table].hash, entry.hash, table);
        },
      );
      assert.deepEqual(
        await db.user.findUniqueOrThrow({
          where: { id: 1 },
          select: { totalXp: true, coins: true, updatedAt: true },
        }),
        balance,
      );
    } finally {
      await db.workActivity.deleteMany({
        where: { OR: [{ todoId: { in: taskIds } }, { projectId: { in: projectIds } }] },
      });
      await db.workNoteRevision.deleteMany({
        where: { note: { OR: [{ todoId: { in: taskIds } }, { projectId: { in: projectIds } }] } },
      });
      await db.workNote.deleteMany({
        where: { OR: [{ todoId: { in: taskIds } }, { projectId: { in: projectIds } }] },
      });
      await db.workAttachment.deleteMany({ where: { projectId: { in: projectIds } } });
      await db.workKeyDate.deleteMany({
        where: { OR: [{ todoId: { in: taskIds } }, { projectId: { in: projectIds } }] },
      });
      await db.$transaction([
        db.eventTaskLink.deleteMany({ where: { eventId: { in: eventIds } } }),
        db.workEventActivity.deleteMany({ where: { sourceEventId: { in: eventIds } } }),
        db.event.deleteMany({ where: { id: { in: eventIds } } }),
      ]);
      await db.todoDependency.deleteMany({
        where: { OR: [{ dependentId: { in: taskIds } }, { prerequisiteId: { in: taskIds } }] },
      });
      await db.todo.updateMany({
        where: { id: { in: taskIds } },
        data: { parentId: null, dependsOnId: null },
      });
      await db.subtask.deleteMany({ where: { todoId: { in: taskIds } } });
      await db.todo.deleteMany({ where: { id: { in: taskIds } } });
      await db.workProjectStage.deleteMany({ where: { projectId: { in: projectIds } } });
      await db.workProject.deleteMany({ where: { id: { in: projectIds } } });
      await db.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
      if (foreign) await db.user.delete({ where: { id: foreign.id } });
      await db.$disconnect();
    }
  },
);
