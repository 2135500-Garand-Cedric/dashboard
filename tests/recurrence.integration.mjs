import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { ensureOccurrences } from "../src/lib/recurrence/engine.mjs";
import { dateInZone, shiftDate } from "../src/lib/recurrence/rules.mjs";

test(
  "recurring work keeps independent history, project membership, exceptions and retry safety",
  { skip: process.env.RUN_RECURRENCE_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const { server, projects, recurrence, calendar, holidays, holidaySelections, taskDetails } =
      loadWorkServices(db);
    const command = (revision) => ({ requestKey: randomUUID(), ...(revision ? { revision } : {}) });
    const today = dateInZone(new Date(), "UTC");
    try {
      await db.user.upsert({
        where: { id: 1 },
        create: { id: 1, email: "recurrence-owner@example.test", timeZone: "UTC" },
        update: {},
      });
      const project = await projects.createProject({ name: `Payroll ${randomUUID()}` }, command());
      const createKey = command();
      let task = await server.createTodo(
        {
          title: "Do payroll",
          projectId: project.id,
          firstDeadline: { kind: "DATE", date: today },
          recurrence: { frequency: "WEEKLY" },
        },
        createKey,
      );
      let series = await recurrence.readRecurrence("TASK", task.id);
      await t.test("creation and concurrent generation never duplicate a week", async () => {
        const original = await db.todo.count({ where: { recurrenceId: series.id } });
        const replay = await server.createTodo(
          {
            title: "Do payroll",
            projectId: project.id,
            firstDeadline: { kind: "DATE", date: today },
            recurrence: { frequency: "WEEKLY" },
          },
          createKey,
        );
        assert.equal(replay.id, task.id);
        await Promise.all([ensureOccurrences(db), ensureOccurrences(db)]);
        assert.equal(await db.todo.count({ where: { recurrenceId: series.id } }), original);
        const rows = await db.todo.findMany({ where: { recurrenceId: series.id } });
        assert.ok(rows.length >= 7);
        assert.ok(rows.every((row) => row.projectId === project.id));
        const details = await taskDetails.readTaskDetails(task.id);
        assert.equal(details.initial[`/api/todos/${task.id}/recurrence`].data.series.id, series.id);
      });
      await t.test("completion affects one task, and deleting a week stays skipped", async () => {
        const next = await db.todo.findFirst({
          where: { recurrenceId: series.id, id: { not: task.id } },
          orderBy: { recurrenceDate: "asc" },
        });
        const skipped = next.recurrenceDate;
        await server.deleteTodo(next.id, command(next.revision));
        await db.recurrenceSeries.update({
          where: { id: series.id },
          data: { generatedThrough: today },
        });
        await ensureOccurrences(db);
        assert.equal(
          await db.todo.count({ where: { recurrenceId: series.id, recurrenceDate: skipped } }),
          0,
        );
        task = await server.patchTodo(task.id, { status: "DONE" }, command(task.revision));
        assert.equal(task.status, "DONE");
        assert.equal(task.archivedAt, null);
        assert.ok(
          (await db.todo.count({ where: { recurrenceId: series.id, status: "TODO" } })) > 0,
        );
      });
      await t.test(
        "stopping repeat retains completed and edited tasks, removes untouched future copies",
        async () => {
          const edited = await db.todo.findFirst({
            where: { recurrenceId: series.id, status: "TODO" },
            orderBy: { recurrenceDate: "asc" },
          });
          await server.patchTodo(
            edited.id,
            { description: "Keep this exception" },
            command(edited.revision),
          );
          const key = command(series.revision);
          const result = await recurrence.saveRecurrence(
            "TASK",
            task.id,
            { active: false, sourceRevision: task.revision },
            key,
          );
          assert.equal(result.active, false);
          assert.equal(
            (
              await recurrence.saveRecurrence(
                "TASK",
                task.id,
                { active: false, sourceRevision: task.revision },
                key,
              )
            ).id,
            series.id,
          );
          assert.equal(
            (await db.todo.findUnique({ where: { id: edited.id } })).description,
            "Keep this exception",
          );
          assert.equal((await db.todo.findUnique({ where: { id: task.id } })).status, "DONE");
          assert.equal(await db.todo.count({ where: { recurrenceId: series.id } }), 2);
        },
      );
      await t.test(
        "existing tasks can start repeating, keep stages and checklist templates, and update their future schedule",
        async () => {
          const parent = await projects.getProject(project.id);
          await projects.projectStageCommand(
            project.id,
            { name: "Weekly payroll" },
            command(parent.revision),
          );
          const stage = (await projects.getProject(project.id)).stages.find(
            (item) => item.name === "Weekly payroll",
          );
          let source = await server.createTodo(
            { title: "Existing routine", projectId: project.id, stageId: stage.id },
            command(),
          );
          await server.createSubtask(
            source.id,
            { title: "Approve pays" },
            command(source.revision),
          );
          source = await server.getTodo(source.id);
          const routine = await recurrence.saveRecurrence(
            "TASK",
            source.id,
            {
              frequency: "WEEKLY",
              firstDeadline: { kind: "DATE", date: today },
              sourceRevision: source.revision,
            },
            command(),
          );
          const copy = await db.todo.findFirst({
            where: { recurrenceId: routine.id, id: { not: source.id } },
            include: { subtasks: true },
          });
          assert.equal(copy.stageId, stage.id);
          assert.equal(copy.subtasks[0].title, "Approve pays");
          assert.equal(copy.subtasks[0].done, false);
          source = await server.getTodo(source.id);
          const changed = await recurrence.saveRecurrence(
            "TASK",
            source.id,
            { frequency: "DAILY", until: shiftDate(today, 3), sourceRevision: source.revision },
            command(routine.revision),
          );
          assert.equal(changed.frequency, "DAILY");
          assert.equal(await db.todo.count({ where: { recurrenceId: routine.id } }), 4);
          await ensureOccurrences(db);
          assert.equal(await db.todo.count({ where: { recurrenceId: routine.id } }), 4);
        },
      );
      await t.test(
        "moving an occurrence then updating its series does not duplicate the moved date",
        async () => {
          let moved = await server.createEvent(
            {
              title: "Moved weekly event",
              timing: { kind: "ALL_DAY", startDate: today, endExclusive: shiftDate(today, 1) },
              recurrence: { frequency: "WEEKLY" },
            },
            command(),
          );
          const original = await recurrence.readRecurrence("EVENT", moved.id);
          const newDate = shiftDate(today, 1);
          moved = await server.patchEvent(
            moved.id,
            {
              timing: { kind: "ALL_DAY", startDate: newDate, endExclusive: shiftDate(newDate, 1) },
            },
            command(moved.revision),
          );
          await recurrence.saveRecurrence(
            "EVENT",
            moved.id,
            { frequency: "WEEKLY", until: shiftDate(today, 20), sourceRevision: moved.revision },
            command(original.revision),
          );
          assert.equal(
            await db.event.count({ where: { recurrenceId: original.id, allDayStart: newDate } }),
            1,
          );
          assert.ok((await db.event.count({ where: { recurrenceId: original.id } })) >= 3);
        },
      );
      await t.test(
        "only four upcoming copies are listed, counted and shown in Calendar; history and hidden records are preserved",
        async () => {
          const group = await projects.createProject(
            { name: `Four occurrence ${randomUUID()}` },
            command(),
          );
          const title = `Four visible ${randomUUID()}`;
          const routine = await server.createTodo(
            {
              title,
              projectId: group.id,
              firstDeadline: { kind: "DATE", date: today },
              recurrence: { frequency: "DAILY" },
            },
            command(),
          );
          const params = new URLSearchParams({ project: String(group.id), sort: "deadline" });
          let result = await server.searchWork(params);
          assert.equal(result.total, 4);
          assert.equal(result.items.length, 4);
          assert.equal((await projects.getProject(group.id)).counts.total, 4);
          assert.equal(
            (await server.listTodos()).filter((row) => row.projectId === group.id).length,
            4,
          );
          const future = await db.todo.findFirst({
            where: { recurrenceId: routine.recurrenceId },
            orderBy: { recurrenceDate: "desc" },
          });
          await server.patchTodo(
            future.id,
            { description: "Retain this future exception" },
            command(future.revision),
          );
          assert.equal(
            (await server.getTodo(future.id)).description,
            "Retain this future exception",
          );
          result = await server.searchWork(params);
          assert.equal(result.total, 4);
          assert.ok(!result.items.some((row) => row.id === future.id));
          const feed = await calendar.calendarFeed(
            new URLSearchParams({
              project: String(group.id),
              start: `${today}T00:00:00Z`,
              end: `${shiftDate(today, 60)}T00:00:00Z`,
              layers: "deadlines",
            }),
          );
          assert.equal(feed.items.length, 4);
          const first = await server.getTodo(routine.id);
          await server.patchTodo(first.id, { status: "DONE" }, command(first.revision));
          result = await server.searchWork(params);
          assert.equal(
            result.items.filter((row) => !["DONE", "CANCELLED"].includes(row.status)).length,
            4,
          );
          assert.ok(result.items.some((row) => row.id === first.id && row.status === "DONE"));
          assert.equal((await projects.getProject(group.id)).counts.total, 5);
          const past = await db.todo.create({
            data: {
              title,
              userId: 1,
              projectId: group.id,
              recurrenceId: routine.recurrenceId,
              recurrenceDate: shiftDate(today, -1),
              deadlineDate: shiftDate(today, -1),
              status: "TODO",
            },
          });
          result = await server.searchWork(params);
          assert.ok(result.items.some((row) => row.id === past.id));
          assert.equal(
            result.items.filter(
              (row) => row.deadlineDate >= today && !["DONE", "CANCELLED"].includes(row.status),
            ).length,
            4,
          );
          const daily = await server.createEvent(
            {
              title: `${title} event`,
              timing: { kind: "ALL_DAY", startDate: today, endExclusive: shiftDate(today, 1) },
              recurrence: { frequency: "DAILY" },
            },
            command(),
          );
          assert.equal(
            (await server.listEvents()).filter((row) => row.recurrenceId === daily.recurrenceId)
              .length,
            4,
          );
          const events = await calendar.calendarFeed(
            new URLSearchParams({
              start: `${today}T00:00:00Z`,
              end: `${shiftDate(today, 60)}T00:00:00Z`,
              layers: "events",
            }),
          );
          assert.equal(
            events.items.filter((row) => row.extendedProps.plainTitle === `${title} event`).length,
            4,
          );
          const birthday = await server.createEvent(
            {
              title: "Four birthdays",
              timing: { kind: "ALL_DAY", startDate: today, endExclusive: shiftDate(today, 1) },
              recurrence: { frequency: "YEARLY" },
            },
            command(),
          );
          assert.equal(
            (await server.listEvents()).filter((row) => row.recurrenceId === birthday.recurrenceId)
              .length,
            4,
          );
        },
      );
      let event;
      await t.test(
        "yearly birthdays appear in future calendar ranges with independent completion",
        async () => {
          event = await server.createEvent(
            {
              title: "Birthday",
              kind: "INFORMATIONAL",
              timing: { kind: "ALL_DAY", startDate: today, endExclusive: shiftDate(today, 1) },
              recurrence: { frequency: "YEARLY" },
            },
            command(),
          );
          const feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: `${shiftDate(today, 360)}T00:00:00Z`,
              end: `${shiftDate(today, 370)}T00:00:00Z`,
            }),
          );
          const birthday = feed.items.find((row) => row.extendedProps.plainTitle === "Birthday");
          assert.ok(birthday);
          assert.equal(birthday.allDay, true);
          event = await server.patchEvent(event.id, { completed: true }, command(event.revision));
          assert.equal(event.completed, true);
          assert.equal(
            await db.event.count({ where: { recurrenceId: event.recurrenceId, completed: false } }),
            3,
          );
        },
      );
      await t.test(
        "future template updates preserve exceptions and enforce optimistic versions",
        async () => {
          const currentSeries = await recurrence.readRecurrence("EVENT", event.id);
          event = await server.patchEvent(
            event.id,
            { title: "Annual birthday" },
            command(event.revision),
          );
          const value = { frequency: "YEARLY", until: null, sourceRevision: event.revision };
          await recurrence.saveRecurrence(
            "EVENT",
            event.id,
            value,
            command(currentSeries.revision),
          );
          assert.equal(
            (
              await db.event.findFirst({
                where: { recurrenceId: currentSeries.id, id: { not: event.id } },
              })
            ).title,
            "Annual birthday",
          );
          await assert.rejects(
            () =>
              recurrence.saveRecurrence("EVENT", event.id, value, command(currentSeries.revision)),
            /another window/,
          );
        },
      );
      await t.test("owner boundaries and invalid rules fail without partial records", async () => {
        const outsider = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
        const foreign = await db.todo.create({ data: { title: "Not yours", userId: outsider.id } });
        await assert.rejects(() => recurrence.readRecurrence("TASK", foreign.id), /not found/);
        const before = await db.todo.count();
        await assert.rejects(
          () =>
            server.createTodo({ title: "Invalid", recurrence: { frequency: "WEEKLY" } }, command()),
          /deadline/,
        );
        await assert.rejects(
          () =>
            server.createTodo(
              {
                title: "Invalid",
                firstDeadline: { kind: "DATE", date: today },
                recurrence: { frequency: "HOURLY" },
              },
              command(),
            ),
          /Choose daily/,
        );
        assert.equal(await db.todo.count(), before);
      });
      await t.test(
        "holiday calendars calculate regional and moving holidays without creating records",
        async () => {
          await ensureOccurrences(db);
          await ensureOccurrences(db);
          const count = await db.event.count();
          const choices = holidays.holidayChoices("CA");
          const national = choices.find((item) => item.state === "QC" && item.rule === "06-24");
          const easter = choices.find((item) => !item.state && item.name === "Easter Monday");
          const remembrance = choices.find(
            (item) => !item.state && item.type === "bank" && item.name === "Remembrance Day",
          );
          for (const choice of [national, easter, remembrance])
            await holidaySelections.addHoliday({ country: "CA", key: choice.key });
          assert.ok(
            holidays
              .selectedHolidayDates(easter, "2026-01-01", "2027-01-01")
              .some((row) => row.date === "2026-04-06"),
          );
          assert.ok(
            holidays
              .selectedHolidayDates(remembrance, "2027-01-01", "2028-01-01")
              .some((row) => row.date === "2027-11-11" && row.type === "bank"),
          );
          const feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: "2027-06-01T00:00:00Z",
              end: "2027-07-01T00:00:00Z",
              layers: "holidays",
            }),
          );
          assert.ok(
            feed.items.some(
              (row) => row.start === "2027-06-24" && row.extendedProps.layer === "holidays",
            ),
          );
          assert.equal(await db.event.count(), count);
          assert.throws(() => holidays.holidayChoices("INVALID"), /valid holiday country/);
        },
      );
    } finally {
      await db.$disconnect();
    }
  },
);
