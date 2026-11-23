import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";

test(
  "holidays and birthdays have read-only dated views with safe occurrence-specific task links",
  { skip: process.env.RUN_CALENDAR_OCCASIONS_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const { holidays, holidaySelections, birthdays, occasions, server, calendar, projects } =
      loadWorkServices(db);
    const command = (revision) => ({ requestKey: randomUUID(), ...(revision ? { revision } : {}) });
    let birthday, christmas, task;
    try {
      await db.user.upsert({
        where: { id: 1 },
        create: { id: 1, email: "occasions-owner@example.test", timeZone: "UTC" },
        update: {},
      });
      await db.calendarBirthday.deleteMany({ where: { userId: 1 } });
      await db.calendarHoliday.deleteMany({ where: { userId: 1 } });
      const choices = holidays.holidayChoices("CA");
      const xmas = choices.find((item) => !item.state && item.rule === "12-25");
      const newYear = choices.find((item) => !item.state && item.rule === "01-01");
      christmas = await holidaySelections.addHoliday({ country: "CA", key: xmas.key });
      await holidaySelections.addHoliday({ country: "CA", key: newYear.key });
      birthday = await birthdays.saveBirthday({ name: "Alex", month: 12, day: 20 });
      task = await server.createTodo({ title: "Buy Christmas present" }, command());
      await t.test(
        "settings lists are ordered by next occurrence across years and retries do not duplicate birthdays",
        async () => {
          const january = await birthdays.saveBirthday({
            name: "January friend",
            month: 1,
            day: 2,
          });
          assert.equal(
            (await birthdays.saveBirthday({ name: "Alex", month: 12, day: 20 })).id,
            birthday.id,
          );
          assert.deepEqual(
            (await birthdays.listBirthdays(new Date("2026-11-19T12:00:00Z"))).map((row) => row.id),
            [birthday.id, january.id],
          );
          const selected = await holidaySelections.selectedHolidays(
            new Date("2026-11-19T12:00:00Z"),
          );
          assert.equal(selected[0].id, christmas.id);
        },
      );
      await t.test(
        "calendar items open occurrence-specific read-only holiday and birthday pages",
        async () => {
          const feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: "2026-12-01T00:00:00Z",
              end: "2027-01-01T00:00:00Z",
              layers: "holidays,birthdays",
            }),
          );
          assert.ok(
            feed.items.some(
              (item) =>
                item.extendedProps.href === `/events/holidays/${christmas.id}?date=2026-12-25`,
            ),
          );
          assert.ok(
            feed.items.some(
              (item) =>
                item.extendedProps.href === `/events/birthdays/${birthday.id}?date=2026-12-20`,
            ),
          );
          assert.equal(
            (await occasions.readOccasion("birthday", birthday.id, "2027-12-20")).title,
            "Alex’s birthday",
          );
          await assert.rejects(
            () => occasions.readOccasion("birthday", birthday.id, "2027-12-21"),
            /not an occurrence/,
          );
          await assert.rejects(
            () => occasions.readOccasion("holiday", christmas.id, "2026-12-24"),
            /not an occurrence/,
          );
        },
      );
      await t.test(
        "linking is idempotent, separate each year, visible from the task and removable without deleting anything",
        async () => {
          const value = { date: "2026-12-25", todoId: task.id };
          await Promise.all([
            occasions.occasionTaskCommand("holiday", christmas.id, value),
            occasions.occasionTaskCommand("holiday", christmas.id, value),
          ]);
          assert.equal(
            (await occasions.readOccasion("holiday", christmas.id, "2026-12-25")).tasks.length,
            1,
          );
          assert.equal(
            (await occasions.readOccasion("holiday", christmas.id, "2027-12-25")).tasks.length,
            0,
          );
          const taskDates = await calendar.taskCalendar(task.id, new URLSearchParams());
          assert.ok(
            taskDates.occasionLinks.some(
              (row) => row.id === christmas.id && row.date === "2026-12-25",
            ),
          );
          await occasions.occasionTaskCommand("holiday", christmas.id, value, true);
          assert.equal(
            (await occasions.readOccasion("holiday", christmas.id, "2026-12-25")).tasks.length,
            0,
          );
          assert.ok(await db.todo.findUnique({ where: { id: task.id } }));
          assert.ok(await db.calendarHoliday.findUnique({ where: { id: christmas.id } }));
        },
      );
      await t.test(
        "creating a task with a date link is atomic, retry safe and preserves the chosen deadline",
        async () => {
          const body = {
            title: "Birthday gift",
            firstDeadline: { kind: "DATE", date: "2026-12-18" },
            occasion: { kind: "birthday", id: birthday.id, date: "2026-12-20" },
          };
          const key = command();
          const created = await server.createTodo(body, key);
          assert.equal((await server.createTodo(body, key)).id, created.id);
          assert.equal(created.deadlineDate, "2026-12-18");
          assert.ok(
            (await occasions.readOccasion("birthday", birthday.id, "2026-12-20")).tasks.some(
              (row) => row.id === created.id,
            ),
          );
          const count = await db.todo.count();
          await assert.rejects(
            () =>
              server.createTodo(
                { ...body, occasion: { ...body.occasion, date: "2026-12-21" } },
                command(),
              ),
            /not an occurrence/,
          );
          assert.equal(await db.todo.count(), count);
        },
      );
      await t.test(
        "project calendars include only annual occurrences linked to their tasks",
        async () => {
          const project = await projects.createProject(
            { name: `Linked dates ${randomUUID()}` },
            command(),
          );
          await server.createTodo(
            {
              title: "Project Christmas gift",
              projectId: project.id,
              occasion: { kind: "holiday", id: christmas.id, date: "2026-12-25" },
            },
            command(),
          );
          let feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: "2026-12-01T00:00:00Z",
              end: "2027-01-01T00:00:00Z",
              layers: "holidays,birthdays",
              project: String(project.id),
            }),
          );
          assert.deepEqual(
            feed.items.map((item) => item.start),
            ["2026-12-25"],
          );
          const other = await projects.createProject(
            { name: `Unrelated dates ${randomUUID()}` },
            command(),
          );
          feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: "2026-12-01T00:00:00Z",
              end: "2027-01-01T00:00:00Z",
              layers: "holidays,birthdays",
              project: String(other.id),
            }),
          );
          assert.equal(feed.items.length, 0);
        },
      );
      await t.test(
        "birthday corrections move associations to the corrected date and deletion retains linked tasks",
        async () => {
          await birthdays.saveBirthday({ name: "Alex", month: 12, day: 21 }, birthday.id);
          const detail = await occasions.readOccasion("birthday", birthday.id, "2026-12-21");
          assert.ok(detail.tasks.some((row) => row.title === "Birthday gift"));
          const linkedTask = detail.tasks[0].id;
          await birthdays.deleteBirthday(birthday.id);
          assert.ok(await db.todo.findUnique({ where: { id: linkedTask } }));
          assert.equal(
            await db.calendarOccasionTaskLink.count({ where: { birthdayId: birthday.id } }),
            0,
          );
          const leap = await birthdays.saveBirthday({ name: "Leap birthday", month: 2, day: 29 });
          assert.equal(
            (await occasions.readOccasion("birthday", leap.id, "2027-02-28")).date,
            "2027-02-28",
          );
          assert.equal(
            (await occasions.readOccasion("birthday", leap.id, "2028-02-29")).date,
            "2028-02-29",
          );
        },
      );
      await t.test(
        "concurrent removal and linking serialize without orphan links or unexpected database errors",
        async () => {
          const source = await birthdays.saveBirthday({
            name: "Concurrent birthday",
            month: 12,
            day: 25,
          });
          const results = await Promise.allSettled([
            occasions.occasionTaskCommand("birthday", source.id, {
              date: "2026-12-25",
              todoId: task.id,
            }),
            birthdays.deleteBirthday(source.id),
          ]);
          assert.equal(results[1].status, "fulfilled");
          if (results[0].status === "rejected") assert.equal(results[0].reason.status, 404);
          assert.equal(
            await db.calendarOccasionTaskLink.count({ where: { birthdayId: source.id } }),
            0,
          );
          assert.ok(await db.todo.findUnique({ where: { id: task.id } }));
        },
      );
      await t.test(
        "owner checks and database foreign keys reject foreign tasks and dates",
        async () => {
          const outsider = await db.user.upsert({
            where: { id: 2000000000 },
            create: { id: 2000000000, email: `${randomUUID()}@example.test` },
            update: {},
          });
          const foreign = await db.calendarBirthday.create({
            data: { userId: outsider.id, name: `Foreign ${randomUUID()}`, month: 12, day: 25 },
          });
          const otherTask = await db.todo.create({
            data: { userId: outsider.id, title: "Foreign task" },
          });
          await assert.rejects(
            () => occasions.readOccasion("birthday", foreign.id, "2026-12-25"),
            /not found/,
          );
          await assert.rejects(
            () => birthdays.saveBirthday({ name: "Changed", month: 1, day: 1 }, foreign.id),
            /not found/,
          );
          await assert.rejects(() => birthdays.deleteBirthday(foreign.id), /not found/);
          await assert.rejects(
            () =>
              occasions.occasionTaskCommand("holiday", christmas.id, {
                date: "2026-12-25",
                todoId: otherTask.id,
              }),
            /not found/,
          );
          await assert.rejects(() =>
            db.calendarOccasionTaskLink.create({
              data: { userId: 1, birthdayId: foreign.id, todoId: task.id, date: "2026-12-25" },
            }),
          );
        },
      );
    } finally {
      await db.$disconnect();
    }
  },
);
