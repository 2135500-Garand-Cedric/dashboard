import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { captureInventory } from "../scripts/work-management-inventory.mjs";
test(
  "Phase 09 focus and My Work preserve canonical task/date semantics",
  { skip: process.env.RUN_WORK_FOCUS_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    assert.notEqual(process.env.NODE_ENV, "production");
    const { PrismaClient } = await import("../src/generated/prisma/index.js"),
      db = new PrismaClient({ log: [] }),
      services = loadWorkServices(db),
      api = services.myWork,
      tasks = services.server,
      prefix = `__phase09_${randomUUID()}`,
      ids = [],
      events = [],
      keys = [];
    const now = new Date("2026-11-11T17:00:00Z"),
      day = "2026-11-11",
      command = (row) => {
        const requestKey = randomUUID();
        keys.push(requestKey);
        return { requestKey, ...(row ? { revision: row.revision } : {}) };
      };
    const task = async (body) => {
      const row = await tasks.createTodo({ title: prefix, ...body }, command());
      ids.push(row.id);
      return row;
    };
    const focus = async (row, active, at = now, date = day) =>
      api.setFocus(row.id, { date, active }, command(await tasks.getTodo(row.id)), at);
    const view = (filter = {}, at = now) =>
      api.myWork(new URLSearchParams({ company: prefix, ...filter }), at);
    const scoped = (body) => task({ company: prefix, ...body });
    let a, b, foreign;
    const originalUser = await db.user.findUniqueOrThrow({ where: { id: 1 } });
    try {
      await t.test(
        "focus concurrent retry is one dated relation and changes only technical task fields",
        async () => {
          a = await scoped({ priorityLevel: "URGENT" });
          b = await scoped({ status: "WAITING", waitingReason: "Vendor", kind: "ISSUE" });
          const before = await db.todo.findUniqueOrThrow({ where: { id: a.id } }),
            key = command(a),
            body = { date: day, active: true };
          const result = await Promise.all([
            api.setFocus(a.id, body, key, now),
            api.setFocus(a.id, body, key, now),
          ]);
          assert.equal(result[0].id, result[1].id);
          assert.equal(await db.workFocus.count({ where: { todoId: a.id } }), 1);
          const after = await db.todo.findUniqueOrThrow({ where: { id: a.id } });
          for (const name of Object.keys(before).filter(
            (key) => !["revision", "updatedAt"].includes(key),
          ))
            assert.deepEqual(after[name], before[name], name);
          assert.equal(
            await db.workActivity.count({ where: { todoId: a.id, action: "FOCUS_ADDED" } }),
            1,
          );
          const bKey = await tasks.getTodo(b.id);
          const competition = await Promise.allSettled([
            api.setFocus(b.id, body, command(bKey), now),
            api.setFocus(b.id, body, command(bKey), now),
          ]);
          assert.equal(competition.filter((row) => row.status === "fulfilled").length, 1);
          assert.equal(
            competition.filter((row) => row.status === "rejected" && row.reason.status === 409)
              .length,
            1,
          );
          await focus(b, false);
          const current = await tasks.getTodo(a.id);
          await Promise.all([
            api.setFocus(a.id, body, command(current), now),
            api.setFocus(a.id, body, command(current), now),
          ]);
          assert.equal(await db.workFocus.count({ where: { todoId: a.id } }), 1);
          await assert.rejects(
            api.setFocus(a.id, { date: day, active: false }, command(a), now),
            (e) => e.status === 409,
          );
        },
      );
      await t.test(
        "sections overlap with honest unique active total; Urgent has no invented deadline",
        async () => {
          const data = await view();
          assert.equal(data.totalActive, 2);
          for (const key of ["new", "focus", "urgent", "undated"])
            assert.ok(data.sections[key].total >= 1);
          assert.equal(data.sections.waiting.total, 1);
          assert.equal(data.sections.blocked.total, 0);
          assert.equal(data.sections.overdue.total, 0);
          assert.ok(data.sections.urgent.items.some((row) => row.id === a.id && row.focused));
          assert.equal((await tasks.getTodo(a.id)).deadlineDate, null);
          await services.relationships.relationshipCommand(
            b.id,
            { kind: "blocked-by", targetId: a.id },
            command(await tasks.getTodo(b.id)),
          );
          const updated = await view();
          assert.equal(updated.sections.blocked.total, 1);
          assert.equal(updated.sections.waiting.total, 1);
          const shared = await tasks.searchWork(
            new URLSearchParams({ company: prefix, planning: "blocked" }),
          );
          assert.equal(shared.total, updated.sections.blocked.total);
        },
      );
      await t.test(
        "date boundaries, due follow-ups and upcoming deadlines reuse existing sources",
        async () => {
          await services.dates.taskDateCommand(
            a.id,
            { action: "deadline", date: { kind: "DATE", date: "2026-11-10" } },
            command(await tasks.getTodo(a.id)),
          );
          await services.dates.taskDateCommand(
            b.id,
            {
              action: "deadline",
              date: { kind: "TIME", local: "2026-11-11T13:00", timeZone: "America/Toronto" },
            },
            command(await tasks.getTodo(b.id)),
          );
          await services.dates.taskDateCommand(
            b.id,
            { action: "followup-create", date: { kind: "DATE", date: day } },
            command(await tasks.getTodo(b.id)),
          );
          const data = await view();
          assert.equal(data.sections.overdue.total, 1);
          assert.equal(data.sections.upcoming.total, 1);
          assert.equal(data.sections.followups.total, 1);
          assert.equal(data.sections.overdue.items[0].deadlineState, "OVERDUE");
          const springView = await view({}, new Date("2026-03-08T07:00:00Z"));
          assert.equal(springView.sections.urgent.items[0].deadlineState, "UPCOMING");
          const eventsBefore = await db.event.count();
          await focus(a, false);
          assert.equal(await db.event.count(), eventsBefore);
          assert.equal((await tasks.getTodo(a.id)).deadlineDate, "2026-11-10");
        },
      );
      await t.test("Toronto midnight and DST never carry yesterday's pin", async () => {
        const beforeMidnight = new Date("2026-11-12T04:59:59Z"),
          afterMidnight = new Date("2026-11-12T05:00:00Z");
        await focus(a, true, beforeMidnight);
        assert.equal((await view({}, beforeMidnight)).sections.focus.total, 1);
        assert.equal((await view({}, afterMidnight)).sections.focus.total, 0);
        await assert.rejects(focus(a, false, afterMidnight), (e) => e.status === 409);
        await focus(a, true, afterMidnight, "2026-11-12");
        assert.equal(await db.workFocus.count({ where: { todoId: a.id } }), 2);
        const spring = new Date("2026-03-08T07:00:00Z");
        await focus(a, true, spring, "2026-03-08");
        const data = await view({}, spring);
        assert.equal(data.date, "2026-03-08");
        assert.equal(data.nextDayAt, "2026-03-09T04:00:00.000Z");
      });
      await t.test(
        "queued focus validates the planning day after acquiring the owner lock",
        async () => {
          let release, acquired;
          const locked = new Promise((resolve) => {
            acquired = resolve;
          });
          const holding = db.$transaction(
            async (tx) => {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(62019, 1)`;
              acquired();
              await new Promise((resolve) => {
                release = resolve;
              });
            },
            { timeout: 15000 },
          );
          await locked;
          const root = await tasks.getTodo(a.id);
          let calls = 0;
          const pending = api.setFocus(a.id, { date: day, active: false }, command(root), () => {
            calls++;
            return new Date("2026-11-12T05:00:00Z");
          });
          assert.equal(calls, 0);
          release();
          await holding;
          await assert.rejects(pending, (error) => error.status === 409);
          assert.equal(calls, 1);
          assert.equal((await tasks.getTodo(a.id)).revision, root.revision);
        },
      );
      await t.test(
        "closure/archive hide retained pins; same-day reopen restores only that date",
        async () => {
          const row = await scoped({ status: "TODO" });
          await focus(row, true);
          const close = await services.relationships.readTransition(
            row.id,
            new URLSearchParams({ status: "DONE" }),
          );
          await tasks.patchTodo(
            row.id,
            { status: "DONE", transitionToken: close.token },
            command(await tasks.getTodo(row.id)),
          );
          assert.ok(!(await view()).sections.focus.items.some((item) => item.id === row.id));
          await assert.rejects(focus(row, true), (e) => e.status === 409);
          await tasks.patchTodo(row.id, { status: "TODO" }, command(await tasks.getTodo(row.id)));
          assert.ok((await view()).sections.focus.items.some((item) => item.id === row.id));
          await tasks.patchTodo(row.id, { archived: true }, command(await tasks.getTodo(row.id)));
          assert.ok(!(await view()).sections.focus.items.some((item) => item.id === row.id));
          await focus(row, false);
          assert.equal(
            (await db.workFocus.findFirstOrThrow({ where: { todoId: row.id, date: day } })).active,
            false,
          );
        },
      );
      await t.test(
        "real sessions are events; informational dates are not reserved sessions",
        async () => {
          const make = async (body) => {
            const event = await tasks.createEvent({ title: prefix, ...body }, command());
            events.push(event.id);
            return event;
          };
          const session = await make({
            kind: "WORK_SESSION",
            timing: {
              kind: "TIMED",
              start: { kind: "TIME", local: "2026-11-10T23:00", timeZone: "America/Toronto" },
              end: { kind: "TIME", local: "2026-11-11T01:00", timeZone: "America/Toronto" },
            },
            links: [{ todoId: a.id, role: "SESSION_TARGET" }],
          });
          await make({
            kind: "INFORMATIONAL",
            timing: { kind: "ALL_DAY", startDate: day, endExclusive: "2026-11-12" },
            links: [{ todoId: a.id, role: "RELATED" }],
          });
          const data = await view();
          assert.equal(data.sessions.total, 1);
          assert.equal(data.sessions.items[0].id, session.id);
          assert.equal((await tasks.getTodo(a.id)).status, "NEW");
          await tasks.patchEvent(
            session.id,
            { completed: true },
            command(await tasks.getEvent(session.id)),
          );
          assert.equal((await view()).sessions.total, 0);
          for (let i = 0; i < 7; i++)
            await make({
              kind: "WORK_SESSION",
              timing: {
                kind: "TIMED",
                start: {
                  kind: "TIME",
                  local: `${day}T${String(9 + i).padStart(2, "0")}:00`,
                  timeZone: "America/Toronto",
                },
                end: {
                  kind: "TIME",
                  local: `${day}T${String(10 + i).padStart(2, "0")}:00`,
                  timeZone: "America/Toronto",
                },
              },
              links: [{ todoId: a.id, role: "SESSION_TARGET" }],
            });
          assert.equal((await view()).sessions.items.length, 6);
          const second = await view({ sessionPage: "2" });
          assert.equal(second.sessions.total, 7);
          assert.equal(second.sessions.items.length, 1);
          await tasks.patchTodo(a.id, { archived: true }, command(await tasks.getTodo(a.id)));
          assert.equal((await view()).sessions.total, 7);
          assert.ok((await view()).sessions.items[0].taskLinks[0].todo.archivedAt);
          await tasks.patchTodo(a.id, { archived: false }, command(await tasks.getTodo(a.id)));
        },
      );
      await t.test(
        "combined/separate context and project filters, paging links, and reads do not write",
        async () => {
          const contexts = await tasks.listWorkContexts(),
            school = contexts.find((row) => row.key === "school");
          const project = await services.projects.createProject({ name: prefix }, command());
          const row = await scoped({ contextId: school.id });
          await services.projects.taskMembership(row.id, { projectId: project.id }, command(row));
          for (let i = 0; i < 7; i++) await scoped({ status: "BACKLOG" });
          const before = await captureInventory(db),
            all = await view(),
            separate = await view({ context: String(school.id), project: String(project.id) });
          assert.equal(separate.totalActive, 1);
          assert.equal(all.sections.backlog.total, 7);
          assert.equal(all.sections.backlog.items.length, 6);
          const after = await captureInventory(db);
          for (const [table, entry] of Object.entries(before.tables))
            assert.equal(after.tables[table].hash, entry.hash, table);
          await services.projects.taskMembership(
            row.id,
            { projectId: null },
            command(await tasks.getTodo(row.id)),
          );
          await db.workActivity.deleteMany({ where: { projectId: project.id } });
          await db.workProjectStage.deleteMany({ where: { projectId: project.id } });
          await db.workProject.delete({ where: { id: project.id } });
        },
      );
      await t.test(
        "foreign tasks, invalid dates and forged ownership cannot acquire focus",
        async () => {
          foreign = await db.user.create({ data: { email: `${prefix}@invalid.test` } });
          const alien = await db.todo.create({ data: { title: prefix, userId: foreign.id } });
          ids.push(alien.id);
          await assert.rejects(
            api.setFocus(alien.id, { date: day, active: true }, command(alien), now),
            (e) => e.status === 404,
          );
          await assert.rejects(
            db.workFocus.create({ data: { userId: 1, todoId: alien.id, date: day } }),
          );
          await assert.rejects(
            api.setFocus(
              a.id,
              { date: "2026-02-30", active: true },
              command(await tasks.getTodo(a.id)),
              now,
            ),
            (e) => e.status === 400,
          );
          await assert.rejects(
            api.myWork(new URLSearchParams({ status: "DONE" }), now),
            (e) => e.status === 400,
          );
        },
      );
      await t.test(
        "late audit failure rolls back focus, task revision and retry receipt",
        async () => {
          await focus(b, false);
          const before = await captureInventory(db),
            key = command(await tasks.getTodo(b.id));
          await db.$executeRawUnsafe(
            `CREATE FUNCTION phase09_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action"='FOCUS_ADDED' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
          );
          await db.$executeRawUnsafe(
            `CREATE TRIGGER phase09_fail_audit BEFORE INSERT ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION phase09_fail_audit()`,
          );
          try {
            await assert.rejects(api.setFocus(b.id, { date: day, active: true }, key, now));
          } finally {
            await db.$executeRawUnsafe('DROP TRIGGER phase09_fail_audit ON "WorkActivity"');
            await db.$executeRawUnsafe("DROP FUNCTION phase09_fail_audit()");
          }
          const after = await captureInventory(db);
          for (const [table, entry] of Object.entries(before.tables))
            assert.equal(after.tables[table].hash, entry.hash, table);
        },
      );
      assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: 1 } }), originalUser);
    } finally {
      await db.$transaction(async (tx) => {
        await tx.eventTaskLink.deleteMany({ where: { eventId: { in: events } } });
        await tx.workEventActivity.deleteMany({ where: { sourceEventId: { in: events } } });
        await tx.event.deleteMany({ where: { id: { in: events } } });
        await tx.workFocus.deleteMany({ where: { todoId: { in: ids } } });
        await tx.workActivity.deleteMany({ where: { todoId: { in: ids } } });
        await tx.workFollowUp.deleteMany({ where: { todoId: { in: ids } } });
        await tx.todoDependency.deleteMany({
          where: { OR: [{ dependentId: { in: ids } }, { prerequisiteId: { in: ids } }] },
        });
        await tx.todo.updateMany({ where: { id: { in: ids } }, data: { dependsOnId: null } });
        await tx.todo.deleteMany({ where: { id: { in: ids } } });
        await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
        if (foreign) await tx.user.delete({ where: { id: foreign.id } });
      });
      await db.$disconnect();
    }
  },
);
