import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";

test(
  "individual holiday selections preserve old settings and support multiple countries/regions safely",
  { skip: process.env.RUN_HOLIDAY_SELECTION_DB_TEST !== "1" },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const { holidays, holidaySelections: selections, calendar } = loadWorkServices(db);
    try {
      await db.user.upsert({
        where: { id: 1 },
        create: { id: 1, email: "holiday-owner@example.test" },
        update: {},
      });
      await db.calendarHoliday.deleteMany({ where: { userId: 1 } });
      await db.user.update({
        where: { id: 1 },
        data: {
          holidaySelectionConfigured: false,
          holidayCountry: "CA",
          holidayRegion: "QC",
          holidayBanks: true,
        },
      });
      await t.test("old preferences convert exactly once under concurrent requests", async () => {
        await Promise.all([
          selections.initializeHolidaySelections(),
          selections.initializeHolidaySelections(),
        ]);
        const result = await selections.holidayOverview("CA");
        assert.ok(
          result.selected.some((item) => item.state === "QC" && item.name.includes("National")),
        );
        assert.ok(result.selected.some((item) => item.name === "Easter Monday"));
        assert.ok(
          result.selected.some((item) => item.name === "Remembrance Day" && item.type === "bank"),
        );
        assert.equal(new Set(result.selected.map((item) => item.key)).size, result.selected.length);
        const user = await db.user.findUnique({ where: { id: 1 } });
        assert.equal(user.holidaySelectionConfigured, true);
        assert.equal(user.holidayCountry, null);
        const easter = result.selected.find((item) => item.name === "Easter Monday");
        await selections.removeHoliday(easter.id);
        await selections.initializeHolidaySelections();
        assert.ok(!(await selections.selectedHolidays()).some((item) => item.id === easter.id));
      });
      await t.test(
        "Canada regional holidays and a Japanese holiday coexist; duplicate adds are idempotent",
        async () => {
          const bc = holidays
            .holidayChoices("CA")
            .find((item) => item.state === "BC" && item.name === "British Columbia Day");
          const jp = holidays
            .holidayChoices("JP")
            .find((item) => item.name === "Coming of Age Day");
          assert.ok(bc);
          assert.ok(jp);
          const copies = await Promise.all([
            selections.addHoliday({ country: "CA", key: bc.key }),
            selections.addHoliday({ country: "CA", key: bc.key }),
          ]);
          assert.equal(copies[0].id, copies[1].id);
          const japan = await selections.addHoliday({ country: "JP", key: jp.key });
          const result = await selections.selectedHolidays(new Date("2026-12-31T12:00:00Z"));
          assert.equal(result.filter((item) => item.key === bc.key).length, 1);
          assert.equal(result.find((item) => item.key === bc.key).nextDate, "2027-08-02");
          assert.equal(result.find((item) => item.key === jp.key).nextDate, "2027-01-11");
          const count = await db.calendarHoliday.count();
          await assert.rejects(
            () => selections.addHoliday({ country: "CA", key: jp.key }),
            /does not belong/,
          );
          await assert.rejects(
            () => selections.addHoliday({ country: "INVALID", key: jp.key }),
            /valid holiday country/,
          );
          await assert.rejects(
            () => selections.addHoliday({ country: "CA", key: "bad", rule: "anything" }),
            /invalid fields/,
          );
          assert.equal(await db.calendarHoliday.count(), count);
          await selections.removeHoliday(japan.id);
          assert.ok(!(await selections.selectedHolidays()).some((item) => item.key === jp.key));
        },
      );
      await t.test(
        "only selected dates appear in Calendar, without creating event records",
        async () => {
          await db.calendarHoliday.deleteMany({ where: { userId: 1 } });
          const easter = holidays
            .holidayChoices("CA")
            .find((item) => item.name === "Easter Monday" && !item.state);
          const bank = holidays
            .holidayChoices("CA")
            .find((item) => item.name === "Remembrance Day" && item.type === "bank" && !item.state);
          const count = await db.event.count();
          const selection = await selections.addHoliday({ country: "CA", key: easter.key });
          let feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: "2027-03-01T00:00:00Z",
              end: "2027-04-01T00:00:00Z",
              layers: "holidays",
            }),
          );
          assert.deepEqual(
            feed.items.map((item) => item.start),
            ["2027-03-29"],
          );
          assert.equal(
            feed.items[0].extendedProps.href,
            `/events/holidays/${selection.id}?date=2027-03-29`,
          );
          await selections.addHoliday({ country: "CA", key: bank.key });
          feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: "2027-11-01T00:00:00Z",
              end: "2027-12-01T00:00:00Z",
              layers: "holidays",
            }),
          );
          assert.ok(
            feed.items.some(
              (item) =>
                item.start === "2027-11-11" && item.extendedProps.activityType === "Bank holiday",
            ),
          );
          await selections.removeHoliday(selection.id);
          feed = await calendar.calendarFeed(
            new URLSearchParams({
              start: "2027-03-01T00:00:00Z",
              end: "2027-04-01T00:00:00Z",
              layers: "holidays",
            }),
          );
          assert.equal(feed.items.length, 0);
          // Calendar may replenish other recurring events; selected holidays never get Event IDs.
          assert.equal(await db.event.count({ where: { title: "Easter Monday" } }), 0);
          assert.ok((await db.event.count()) >= count);
        },
      );
      await t.test(
        "custom names and types preserve moving date rules and are reflected in the calendar",
        async () => {
          await db.calendarHoliday.deleteMany({ where: { userId: 1 } });
          const easter = holidays
            .holidayChoices("CA")
            .find((item) => item.name === "Easter Monday" && !item.state);
          const row = await selections.addHoliday({
            country: "CA",
            key: easter.key,
            name: "My spring holiday",
            type: "holiday",
          });
          const original = await db.calendarHoliday.findUnique({ where: { id: row.id } });
          let summary = (await selections.selectedHolidays(new Date("2026-04-07T12:00:00Z"))).find(
            (item) => item.id === row.id,
          );
          assert.equal(summary.name, "My spring holiday");
          assert.equal(summary.sourceName, "Easter Monday");
          assert.equal(summary.nextDate, "2027-03-29");
          const next = (await selections.selectedHolidays(new Date("2027-04-01T12:00:00Z"))).find(
            (item) => item.id === row.id,
          );
          assert.equal(next.nextDate, "2028-04-17");
          for (const [type, label, color] of [
            ["bank", "Bank holiday", "#d97706"],
            ["important", "Important date", "#2563eb"],
            ["holiday", "Holiday", "#0d9488"],
          ]) {
            await selections.updateHoliday(row.id, { name: "Family spring day", type });
            const feed = await calendar.calendarFeed(
              new URLSearchParams({
                start: "2027-03-01T00:00:00Z",
                end: "2027-04-01T00:00:00Z",
                layers: "holidays",
              }),
            );
            assert.equal(feed.items.length, 1);
            assert.equal(feed.items[0].start, "2027-03-29");
            assert.equal(feed.items[0].extendedProps.plainTitle, "Family spring day");
            assert.equal(feed.items[0].extendedProps.activityType, label);
            assert.equal(feed.items[0].backgroundColor, color);
          }
          const stored = await db.calendarHoliday.findUnique({ where: { id: row.id } });
          assert.equal(stored.rule, original.rule);
          assert.equal(stored.key, original.key);
          assert.deepEqual(stored.options, original.options);
          await selections.addHoliday({ country: "CA", key: easter.key });
          assert.equal(
            (await db.calendarHoliday.findUnique({ where: { id: row.id } })).name,
            "Family spring day",
          );
          for (const invalid of [
            { name: " " },
            { name: "x".repeat(501) },
            { type: "invalid" },
            { rule: "01-01" },
            {},
          ])
            await assert.rejects(() => selections.updateHoliday(row.id, invalid));
          assert.equal(
            (await db.calendarHoliday.findUnique({ where: { id: row.id } })).name,
            "Family spring day",
          );
        },
      );
      await t.test("a foreign owner's selection cannot be removed", async () => {
        const outsider = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
        const choice = holidays.holidayChoices("CA")[0];
        const foreign = await db.calendarHoliday.create({
          data: { userId: outsider.id, ...choice },
        });
        await assert.rejects(
          () => selections.updateHoliday(foreign.id, { name: "Not allowed", type: "important" }),
          /not found/,
        );
        await assert.rejects(() => selections.removeHoliday(foreign.id), /not found/);
        assert.ok(await db.calendarHoliday.findUnique({ where: { id: foreign.id } }));
      });
    } finally {
      await db.$disconnect();
    }
  },
);
