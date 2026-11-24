import assert from "node:assert/strict";
import test from "node:test";
import { weeklyModules } from "./helpers/weekly-report.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";
const {
  period: { weeklyPeriod, readCursor, cursorFor },
  server,
} = weeklyModules(null);

test("weekly boundaries use completed local weeks, calendar days and DST", () => {
  const now = new Date("2026-11-24T03:00:00Z");
  const spring = weeklyPeriod(new URLSearchParams("week=2026-03-02"), "America/Toronto", now);
  const autumn = weeklyPeriod(new URLSearchParams("week=2026-10-26"), "America/Toronto", now);
  assert.equal((spring.end - spring.start) / 3600000, 167);
  assert.equal((autumn.end - autumn.start) / 3600000, 169);
  assert.equal(spring.lastDay, "2026-03-08");
  const completed = weeklyPeriod(new URLSearchParams(), "Asia/Tokyo", now);
  assert.equal(completed.week, "2026-11-16");
  assert.equal(completed.financeTo, "2026-11-22");
  assert.equal(completed.cutoff.toISOString(), "2026-11-22T15:00:00.000Z");
  assert.equal(completed.current, false);
  const year = weeklyPeriod(new URLSearchParams("week=2025-12-29"), "UTC", now);
  assert.equal(year.lastDay, "2026-01-04");
  assert.equal(year.dataset, "all");
});
test("invalid weeks, future dates, currencies, stale captures and mismatched cursors are rejected", () => {
  const now = new Date("2026-11-24T03:00:00Z");
  for (const query of [
    "week=2026-02-30",
    "week=2026-11-24",
    "week=2026-11-23",
    "week=2027-01-04",
    "week=garbage",
    "currency=CHF",
    "dataset=other",
    "asOf=2027-01-01",
    "asOf=2026-01-01",
  ])
    assert.throws(() => weeklyPeriod(new URLSearchParams(query), "UTC", now));
  const p = weeklyPeriod(new URLSearchParams(), "UTC", now);
  const cursor = cursorFor(3, "completed", p);
  assert.equal(
    readCursor(new URLSearchParams({ week: p.week, section: "completed", cursor }), "UTC", now)
      .offset,
    3,
  );
  assert.throws(() =>
    readCursor(new URLSearchParams({ week: p.week, section: "created", cursor }), "UTC", now),
  );
  assert.throws(() =>
    readCursor(
      new URLSearchParams({ week: p.week, section: "completed", cursor }),
      "Asia/Tokyo",
      now,
    ),
  );
});
test("both report APIs authorize before reading query parameters or executing any service", async () => {
  for (const file of [
    "src/app/api/weekly-report/route.ts",
    "src/app/api/weekly-report/items/route.ts",
  ]) {
    const route = loadWorkModule(file, {
      "@/lib/require-owner": {
        requireOwner: async () => Response.json({ error: "Denied" }, { status: 401 }),
      },
      "@/lib/weekly-report/http": { weeklyResponse: () => assert.fail("Must not access reports") },
    });
    assert.equal((await route.GET({})).status, 401);
  }
});

test("a week becomes available only after local Monday midnight", () => {
  const now = new Date("2026-11-23T00:30:00Z");
  const utc = weeklyPeriod(new URLSearchParams(), "UTC", now);
  const toronto = weeklyPeriod(new URLSearchParams(), "America/Toronto", now);
  assert.equal(utc.week, "2026-11-16");
  assert.equal(toronto.week, "2026-11-09");
  assert.throws(() => weeklyPeriod(new URLSearchParams("week=2026-11-16"), "America/Toronto", now));
  assert.equal(utc.cutoff.toISOString(), "2026-11-23T00:00:00.000Z");
});
