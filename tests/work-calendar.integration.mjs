import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { supportModules, loadWorkModule } from "./helpers/work-support.mjs";
test(
  "Phase 07 typed calendar, sessions, explicit conversion and safe reversal",
  { skip: process.env.RUN_WORK_MANAGEMENT_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.notEqual(process.env.NODE_ENV, "production");
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, "work-db");
    assert.equal(url.pathname, "/work_test");
    const { PrismaClient } = await import("../src/generated/prisma/index.js"),
      db = new PrismaClient(),
      modules = supportModules(db),
      api = modules.server,
      cal = loadWorkModule("src/lib/work-management/calendar-server.ts", modules.supportingDeps),
      dates = loadWorkModule("src/lib/work-management/date-server.ts", modules.supportingDeps);
    const prefix = `__phase07_${randomUUID()}`,
      tasks = [],
      events = [],
      keys = [];
    let foreign;
    const command = (row) => {
      const requestKey = randomUUID();
      keys.push(requestKey);
      return { requestKey, ...(row ? { revision: row.revision } : {}) };
    };
    const task = async (body) => {
      const row = await api.createTodo({ title: prefix, ...body }, command());
      tasks.push(row.id);
      return row;
    };
    const event = async (body) => {
      const row = await api.createEvent({ title: prefix, ...body }, command());
      events.push(row.id);
      return row;
    };
    const fresh = (row) => api.getEvent(row.id),
      patch = async (row, body) => api.patchEvent(row.id, body, command(await fresh(row))),
      patchTask = async (row, body) =>
        api.patchTodo(row.id, body, command(await api.getTodo(row.id)));
    const day = (value) => ({ kind: "DATE", date: value }),
      time = (local) => ({ kind: "TIME", local, timeZone: "America/Toronto" }),
      timing = (start = "2026-11-12T10:00", end = "2026-11-12T11:00") => ({
        kind: "TIMED",
        start: time(start),
        end: time(end),
      });
    const reject = (promise, status = 409) =>
      assert.rejects(
        promise,
        (error) =>
          error instanceof modules.validation.WorkValidationError && error.status === status,
      );
    const feed = (extra) =>
      cal.calendarFeed(
        new URLSearchParams({
          start: "2026-11-01T00:00:00-04:00",
          end: "2026-12-02T00:00:00-05:00",
          ...extra,
        }),
      );
    const beforeBalance = await db.user.findUniqueOrThrow({
      where: { id: 1 },
      select: { totalXp: true, coins: true, updatedAt: true },
    });
    try {
      await t.test(
        "legacy links are ordinary RELATED associations; repeat extracted backfill is a no-op",
        async () => {
          const before = await db.eventTaskLink.findMany({
              orderBy: [{ eventId: "asc" }, { todoId: "asc" }],
            }),
            sql = fs
              .readFileSync(
                "prisma/migrations/20261111120000_calendar_work_layers/migration.sql",
                "utf8",
              )
              .split("-- BEGIN LEGACY EVENT LINKS")[1]
              .split("-- END LEGACY EVENT LINKS")[0];
          await db.$executeRawUnsafe(sql.trim());
          assert.deepEqual(
            await db.eventTaskLink.findMany({ orderBy: [{ eventId: "asc" }, { todoId: "asc" }] }),
            before,
          );
          for (const link of before.filter((row) => row.origin === "LEGACY")) {
            assert.equal(link.role, "RELATED");
            assert.equal((await fresh({ id: link.eventId })).kind, "ORDINARY");
          }
        },
      );
      await t.test(
        "sessions require valid start/end and one owned target; multiple sessions share the canonical task",
        async () => {
          const target = await task(),
            related = await task();
          const count = await db.event.count();
          await reject(
            event({
              kind: "WORK_SESSION",
              timing: { kind: "TBD" },
              links: [{ todoId: target.id, role: "SESSION_TARGET" }],
            }),
            400,
          );
          await reject(event({ kind: "WORK_SESSION", timing: timing(), links: [] }), 400);
          await reject(
            event({
              kind: "WORK_SESSION",
              timing: timing(),
              links: [
                { todoId: target.id, role: "SESSION_TARGET" },
                { todoId: related.id, role: "SESSION_TARGET" },
              ],
            }),
            400,
          );
          assert.equal(await db.event.count(), count);
          const a = await event({
              kind: "WORK_SESSION",
              timing: timing(),
              links: [
                { todoId: target.id, role: "SESSION_TARGET" },
                { todoId: related.id, role: "RELATED" },
              ],
            }),
            b = await event({
              kind: "WORK_SESSION",
              timing: timing("2026-11-13T10:00", "2026-11-13T11:00"),
              links: [{ todoId: target.id, role: "SESSION_TARGET" }],
            });
          assert.equal(a.linkedTodoId, null);
          assert.equal(a.taskLinks.length, 2);
          assert.equal((await cal.taskCalendar(target.id, new URLSearchParams())).total, 2);
          await reject(patch(a, { linkedTodoId: null }));
          assert.equal((await fresh(a)).taskLinks.length, 2);
          await reject(api.deleteTodo(target.id, command(await api.getTodo(target.id))));
          const ordinary = await event({ date: "2026-11-10T12:00:00Z" });
          await patch(ordinary, {
            links: [
              { todoId: target.id, role: "RELATED" },
              { todoId: related.id, role: "RELATED" },
            ],
          });
          await reject(patch(ordinary, { linkedTodoId: null }));
          await patchTask(target, { archived: true });
          await reject(
            event({
              kind: "WORK_SESSION",
              timing: timing(),
              links: [{ todoId: target.id, role: "SESSION_TARGET" }],
            }),
          );
          await patchTask(target, { archived: false });
          const raw = await db.event.findUnique({ where: { id: b.id } });
          assert.equal(raw.date.toISOString(), "2026-11-13T15:00:00.000Z");
        },
      );
      await t.test(
        "bounded feed has stable typed IDs, labels, layers, context, TBD and date-only markers",
        async () => {
          const contexts = await api.listWorkContexts(),
            school = contexts.find((row) => row.key === "school"),
            row = await task({ contextId: school.id }),
            noContext = await task({ contextId: null });
          await dates.taskDateCommand(
            row.id,
            { action: "deadline", date: day("2026-11-13") },
            command(await api.getTodo(row.id)),
          );
          await dates.taskDateCommand(
            row.id,
            { action: "followup-create", date: day("2026-11-12") },
            command(await api.getTodo(row.id)),
          );
          await dates.taskDateCommand(
            row.id,
            { action: "key-create", label: "Delivery", date: day("2026-11-14") },
            command(await api.getTodo(row.id)),
          );
          const ordinary = await event({
              date: "2026-11-18T14:00:00Z",
              links: [{ todoId: row.id, role: "RELATED" }],
            }),
            tbd = await event({ timing: { kind: "TBD" } });
          await event({ timing: timing(), links: [{ todoId: noContext.id, role: "RELATED" }] });
          const scoped = await feed({ context: String(school.id) });
          for (const id of [`deadline:${row.id}`, `event:${ordinary.id}`])
            assert.ok(scoped.items.some((item) => item.id === id));
          assert.ok(scoped.items.some((item) => String(item.id).startsWith("followup:")));
          assert.ok(scoped.items.some((item) => String(item.id).startsWith("keydate:")));
          const marker = scoped.items.find((item) => item.id === `deadline:${row.id}`);
          assert.equal(marker.start, "2026-11-13");
          assert.equal(marker.display, "list-item");
          assert.equal(marker.extendedProps.busy, false);
          assert.ok(marker.extendedProps.href.startsWith(`/todos/${row.id}`));
          const deadlines = await feed({ layers: "deadlines", context: String(school.id) });
          assert.ok(deadlines.items.every((item) => item.id.startsWith("deadline:")));
          assert.ok(
            (await feed({ layers: "events", context: "none" })).tbd.some(
              (item) => item.id === tbd.id,
            ),
          );
          await reject(
            cal.calendarFeed(
              new URLSearchParams({ start: "2020-01-01T00:00:00Z", end: "2026-01-01T00:00:00Z" }),
            ),
            400,
          );
          await reject(feed({ layers: "arbitrary" }), 400);
        },
      );
      await t.test(
        "all-day exclusive ends and cross-month sessions preserve named-zone instants",
        async () => {
          const allDay = await event({
            kind: "INFORMATIONAL",
            busy: false,
            timing: { kind: "ALL_DAY", startDate: "2026-11-24", endExclusive: "2026-11-28" },
          });
          assert.equal(allDay.date, null);
          assert.equal(allDay.allDayStart, "2026-11-24");
          const item = (await feed()).items.find((item) => item.id === `event:${allDay.id}`);
          assert.equal(item.allDay, true);
          assert.equal(item.end, "2026-11-28");
          const row = await task(),
            session = await event({
              kind: "WORK_SESSION",
              timing: timing("2026-11-30T23:00", "2026-12-01T01:00"),
              links: [{ todoId: row.id, role: "SESSION_TARGET" }],
            });
          assert.equal(session.date, "2026-12-01T04:00:00.000Z");
          assert.ok((await feed()).items.some((item) => item.id === `event:${session.id}`));
          await reject(event({ timing: timing("2026-03-08T02:30", "2026-03-08T04:00") }), 400);
          await reject(event({ timing: timing("2026-11-01T01:30", "2026-11-01T03:00") }), 400);
        },
      );
      await t.test(
        "moving/completing/deleting a session cannot move dates or complete/delete its task",
        async () => {
          const row = await task();
          await dates.taskDateCommand(
            row.id,
            { action: "deadline", date: day("2026-11-20") },
            command(await api.getTodo(row.id)),
          );
          const session = await event({
            kind: "WORK_SESSION",
            timing: timing(),
            links: [{ todoId: row.id, role: "SESSION_TARGET" }],
          });
          const before = await api.getTodo(row.id);
          await patch(session, { date: "2026-11-13T15:00:00Z", endDate: "2026-11-13T16:00:00Z" });
          assert.deepEqual(await api.getTodo(row.id), before);
          await patch(session, { completed: true });
          assert.equal((await api.getTodo(row.id)).status, "NEW");
          assert.equal((await api.getTodo(row.id)).deadlineDate, "2026-11-20");
          await api.deleteEvent(session.id, command(await fresh(session)));
          assert.ok(await api.getTodo(row.id));
          assert.equal((await api.getTodo(row.id)).status, "NEW");
          assert.ok(
            await db.workEventActivity.count({
              where: { sourceEventId: session.id, eventId: null },
            }),
          );
        },
      );
      await t.test(
        "closure retains past/future sessions, suppresses actionable markers and stale session review fails",
        async () => {
          const row = await task();
          await dates.taskDateCommand(
            row.id,
            { action: "deadline", date: day("2026-11-15") },
            command(await api.getTodo(row.id)),
          );
          const future = await event({
              kind: "WORK_SESSION",
              timing: timing("2030-11-12T10:00", "2030-11-12T11:00"),
              links: [{ todoId: row.id, role: "SESSION_TARGET" }],
            }),
            past = await event({
              kind: "WORK_SESSION",
              timing: timing("2020-11-12T10:00", "2020-11-12T11:00"),
              links: [{ todoId: row.id, role: "SESSION_TARGET" }],
            });
          const preview = await modules.supportingDeps["./graph"].transitionSnapshot(
            db,
            row.id,
            "DONE",
          );
          assert.equal(preview.futureSessionCount, 1);
          await patch(future, { date: "2030-11-13T15:00:00Z", endDate: "2030-11-13T16:00:00Z" });
          await reject(patchTask(row, { status: "DONE", transitionToken: preview.token }));
          await patchTask(row, { status: "DONE" });
          assert.ok(await fresh(future));
          assert.ok(await fresh(past));
          assert.ok(!(await feed()).items.some((item) => item.id === `deadline:${row.id}`));
          assert.equal(
            (await feed({ history: "true" })).items.find((item) => item.id === `deadline:${row.id}`)
              .extendedProps.actionable,
            false,
          );
          await patchTask(row, { status: "TODO" });
          assert.ok((await feed()).items.some((item) => item.id === `deadline:${row.id}`));
        },
      );
      await t.test(
        "conversion preview is read-only; retained event conversion preserves its timing and reuses linked task",
        async () => {
          const row = await task(),
            source = await event({
              date: "2026-11-18T14:00:00Z",
              links: [{ todoId: row.id, role: "RELATED" }],
            });
          const body = {
              mode: "RELATED",
              taskId: row.id,
              changeDeadline: true,
              deadline: day("2026-11-17"),
            },
            count = await db.todo.count(),
            before = await fresh(source),
            preview = await cal.previewConversion(source.id, body);
          assert.equal(await db.todo.count(), count);
          assert.deepEqual(await fresh(source), before);
          const key = command(source),
            payload = { ...body, previewToken: preview.token },
            converted = await cal.confirmConversion(source.id, payload, key);
          assert.equal(converted.taskId, row.id);
          assert.equal(converted.event.superseded, false);
          assert.equal(converted.event.date, source.date);
          assert.deepEqual(await cal.confirmConversion(source.id, payload, key), converted);
          assert.equal(
            (await cal.confirmConversion(source.id, payload, command(source))).taskId,
            row.id,
          );
          assert.equal(await db.todo.count(), count);
          assert.ok((await feed()).items.some((item) => item.id === `event:${source.id}`));
        },
      );
      await t.test(
        "concurrent placeholder confirmation creates one task and suppresses only the explicit source",
        async () => {
          const source = await event({ date: "2026-11-13T20:00:00Z" }),
            other = await event({ title: `${prefix} birthday`, date: "2026-11-22T20:00:00Z" }),
            body = {
              mode: "PLACEHOLDER",
              taskId: null,
              title: prefix,
              contextId: null,
              changeDeadline: true,
              deadline: day("2026-11-13"),
            };
          const before = await db.todo.count(),
            preview = await cal.previewConversion(source.id, body),
            payload = { ...body, previewToken: preview.token };
          const results = await Promise.all([
            cal.confirmConversion(source.id, payload, command(source)),
            cal.confirmConversion(source.id, payload, command(source)),
          ]);
          const created = results[0].taskId;
          tasks.push(created);
          assert.equal(results[1].taskId, created);
          assert.equal(await db.todo.count(), before + 1);
          const projection = await feed();
          assert.ok(!projection.items.some((item) => item.id === `event:${source.id}`));
          assert.ok(projection.items.some((item) => item.id === `deadline:${created}`));
          assert.ok(projection.items.some((item) => item.id === `event:${other.id}`));
          const original = await db.event.findUnique({ where: { id: source.id } });
          assert.equal(original.date.toISOString(), source.date);
          assert.equal(original.title, source.title);
          assert.equal(original.completed, false);
          await reject(api.deleteTodo(created, command(await api.getTodo(created))));
          const undo = await cal.undoConversion(
            source.id,
            { conversionId: results[0].conversion.id, restoreDeadline: true },
            command(await fresh(source)),
          );
          assert.equal(undo.event.superseded, false);
          assert.equal((await api.getTodo(created)).deadlineDate, null);
          assert.ok((await feed()).items.some((item) => item.id === `event:${source.id}`));
        },
      );
      await t.test(
        "changed previews reject, undo preserves later event edits and never overwrites changed task deadlines",
        async () => {
          const row = await task(),
            source = await event({ date: "2026-11-13T20:00:00Z" }),
            body = {
              mode: "PLACEHOLDER",
              taskId: row.id,
              changeDeadline: true,
              deadline: day("2026-11-13"),
            };
          const preview = await cal.previewConversion(source.id, body);
          await patchTask(row, { description: "Later task edit" });
          await reject(
            cal.confirmConversion(
              source.id,
              { ...body, previewToken: preview.token },
              command(source),
            ),
          );
          const current = await cal.previewConversion(source.id, body),
            result = await cal.confirmConversion(
              source.id,
              { ...body, previewToken: current.token },
              command(source),
            );
          await dates.taskDateCommand(
            row.id,
            { action: "deadline", date: day("2026-11-25") },
            command(await api.getTodo(row.id)),
          );
          await patch(source, { title: `${prefix} later event edit` });
          await reject(
            cal.undoConversion(
              source.id,
              { conversionId: result.conversion.id, restoreDeadline: true },
              command(await fresh(source)),
            ),
          );
          const undone = await cal.undoConversion(
            source.id,
            { conversionId: result.conversion.id, restoreDeadline: false },
            command(await fresh(source)),
          );
          assert.equal(undone.event.title, `${prefix} later event edit`);
          assert.equal((await api.getTodo(row.id)).deadlineDate, "2026-11-25");
        },
      );
      await t.test(
        "database enforces target/session timing and late conversion audit failure leaves no duplicates",
        async () => {
          const source = await event({ date: "2026-11-13T20:00Z" });
          await assert.rejects(
            db.$transaction((tx) =>
              tx.event.create({
                data: {
                  userId: 1,
                  title: prefix,
                  kind: "WORK_SESSION",
                  date: new Date("2026-11-10T15:00Z"),
                  endDate: new Date("2026-11-10T16:00Z"),
                  timeZone: "America/Toronto",
                },
              }),
            ),
          );
          await assert.rejects(
            db.event.create({
              data: {
                userId: 1,
                title: prefix,
                allDayStart: "2026-11-10",
                allDayEnd: "2026-11-10",
              },
            }),
          );
          const body = {
              mode: "PLACEHOLDER",
              taskId: null,
              title: prefix,
              changeDeadline: true,
              deadline: day("2026-11-13"),
            },
            preview = await cal.previewConversion(source.id, body);
          const counts = async () => ({
              tasks: await db.todo.count(),
              links: await db.eventTaskLink.count(),
              ledger: await db.workEventConversion.count(),
              audit: await db.workActivity.count(),
              eventAudit: await db.workEventActivity.count(),
              receipts: await db.workMutationReceipt.count(),
              event: await fresh(source),
            }),
            before = await counts();
          const failureDb = {
            $transaction: (action, options) =>
              db.$transaction(
                (tx) =>
                  action(
                    new Proxy(tx, {
                      get(target, prop) {
                        if (prop === "workEventActivity")
                          return {
                            ...target.workEventActivity,
                            create: async (args) => {
                              if (args.data.action === "CONVERTED")
                                throw new Error("injected conversion audit failure");
                              return target.workEventActivity.create(args);
                            },
                          };
                        return Reflect.get(target, prop);
                      },
                    }),
                  ),
                options,
              ),
          };
          const failing = supportModules(failureDb),
            service = loadWorkModule(
              "src/lib/work-management/calendar-server.ts",
              failing.supportingDeps,
            );
          await assert.rejects(
            service.confirmConversion(
              source.id,
              { ...body, previewToken: preview.token },
              command(source),
            ),
            /injected conversion audit failure/,
          );
          assert.deepEqual(await counts(), before);
        },
      );
      await t.test(
        "cross-owner links, feeds, conversions and task-calendar lookups are denied",
        async () => {
          foreign = await db.user.create({
            data: { name: prefix, email: `${prefix}@invalid.test` },
          });
          const foreignTask = await db.todo.create({
            data: { title: "PRIVATE", userId: foreign.id },
          });
          tasks.push(foreignTask.id);
          const foreignEvent = await db.event.create({
            data: { title: prefix, userId: foreign.id, date: new Date("2026-11-10T10:00Z") },
          });
          events.push(foreignEvent.id);
          const source = await event({ date: "2026-11-13T20:00Z" });
          await reject(
            patch(source, { links: [{ todoId: foreignTask.id, role: "RELATED" }] }),
            400,
          );
          await reject(cal.taskCalendar(foreignTask.id, new URLSearchParams()), 404);
          await reject(
            cal.previewConversion(foreignEvent.id, {
              mode: "RELATED",
              taskId: null,
              title: "Try",
              changeDeadline: false,
            }),
            404,
          );
          await reject(
            cal.previewConversion(source.id, {
              mode: "RELATED",
              taskId: foreignTask.id,
              changeDeadline: false,
            }),
            404,
          );
          assert.ok(!(await feed()).items.some((item) => item.id === `event:${foreignEvent.id}`));
          await db.eventTaskLink.create({
            data: {
              eventId: source.id,
              todoId: foreignTask.id,
              origin: "LEGACY",
              legacyReviewReason: "CROSS_OWNER",
              role: "RELATED",
            },
          });
          await db.event.update({
            where: { id: source.id },
            data: { linkedTodoId: foreignTask.id },
          });
          assert.ok(!JSON.stringify(await fresh(source)).includes("PRIVATE"));
          await patch(source, { description: "Owned event metadata remains editable" });
          assert.ok(!JSON.stringify(await cal.eventActivity(source.id)).includes("PRIVATE"));
          await reject(
            cal.previewConversion(source.id, {
              mode: "RELATED",
              taskId: null,
              title: prefix,
              changeDeadline: false,
            }),
          );
        },
      );
    } finally {
      await db.$transaction(async (tx) => {
        await tx.workEventConversion.deleteMany({
          where: { OR: [{ sourceEventId: { in: events } }, { todoId: { in: tasks } }] },
        });
        await tx.workEventActivity.deleteMany({ where: { sourceEventId: { in: events } } });
        await tx.eventTaskLink.deleteMany({
          where: { OR: [{ eventId: { in: events } }, { todoId: { in: tasks } }] },
        });
        await tx.event.deleteMany({ where: { id: { in: events } } });
        await tx.workActivity.deleteMany({
          where: {
            todoReference: { in: tasks.map((id) => `TASK-${String(id).padStart(4, "0")}`) },
          },
        });
        await tx.workFollowUp.updateMany({
          where: { todoId: { in: tasks } },
          data: { previousId: null },
        });
        await tx.workFollowUp.deleteMany({ where: { todoId: { in: tasks } } });
        await tx.workKeyDate.deleteMany({ where: { todoId: { in: tasks } } });
        await tx.todo.deleteMany({ where: { id: { in: tasks } } });
        await tx.workMutationReceipt.deleteMany({ where: { requestKey: { in: keys } } });
        if (foreign) await tx.user.delete({ where: { id: foreign.id } });
        await tx.user.update({ where: { id: 1 }, data: beforeBalance });
      });
      await db.$disconnect();
    }
  },
);
