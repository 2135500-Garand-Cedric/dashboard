import assert from "node:assert/strict";
import test from "node:test";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";
const validation = loadWorkModule("src/lib/work-management/validation.ts", { "next/server": {} });
const modules = loadTaskFoundation(validation),
  dates = modules["./dates"],
  query = modules["./query"],
  zone = "America/Toronto";
test("date-only deadlines and follow-ups use Toronto boundaries, regardless of process locale", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      const value = dates.parseWorkDate({ kind: "DATE", date: "2026-11-10" }, zone);
      assert.equal(value.at, null);
      assert.equal(
        dates.workDateState(value, "deadline", new Date("2026-11-11T04:59:59.999Z"), zone),
        "UPCOMING",
      );
      assert.equal(
        dates.workDateState(value, "deadline", new Date("2026-11-11T05:00:00Z"), zone),
        "OVERDUE",
      );
      assert.equal(
        dates.workDateState(value, "followup", new Date("2026-11-10T04:59:59Z"), zone),
        "UPCOMING",
      );
      assert.equal(
        dates.workDateState(value, "followup", new Date("2026-11-10T05:00:00Z"), zone),
        "DUE",
      );
      assert.equal(
        dates.workDateState(value, "deadline", new Date("2027-01-01Z"), zone, false),
        null,
      );
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
test("exact deadlines are overdue strictly after the instant; follow-ups are due at it", () => {
  const value = dates.parseWorkDate(
    { kind: "TIME", local: "2026-11-10T12:30", timeZone: zone },
    zone,
  );
  assert.equal(value.at.toISOString(), "2026-11-10T17:30:00.000Z");
  assert.equal(dates.workDateState(value, "deadline", value.at, zone), "UPCOMING");
  assert.equal(dates.workDateState(value, "followup", value.at, zone), "DUE");
  assert.equal(
    dates.workDateState(value, "deadline", new Date(value.at.getTime() + 1), zone),
    "OVERDUE",
  );
  assert.equal(dates.workDateState(dates.emptyWorkDate(), "deadline", new Date(), zone), null);
});
test("DST gaps reject and folds require an explicit earlier/later occurrence", () => {
  assert.throws(
    () => dates.parseWorkDate({ kind: "TIME", local: "2026-03-08T02:30", timeZone: zone }, zone),
    /does not exist/,
  );
  assert.throws(
    () => dates.parseWorkDate({ kind: "TIME", local: "2026-11-01T01:30", timeZone: zone }, zone),
    /occurs twice/,
  );
  const earlier = dates.parseWorkDate(
      { kind: "TIME", local: "2026-11-01T01:30", timeZone: zone, occurrence: "earlier" },
      zone,
    ),
    later = dates.parseWorkDate(
      { kind: "TIME", local: "2026-11-01T01:30", timeZone: zone, occurrence: "later" },
      zone,
    );
  assert.equal(earlier.at.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(later.at.toISOString(), "2026-11-01T06:30:00.000Z");
  assert.equal(
    dates.dayStart("2026-03-09", zone) - dates.dayStart("2026-03-08", zone),
    23 * 3600000,
  );
  assert.equal(
    dates.dayStart("2026-11-02", zone) - dates.dayStart("2026-11-01", zone),
    25 * 3600000,
  );
  assert.equal(
    dates
      .parseWorkDate({ kind: "TIME", local: "2026-01-10T12:00", timeZone: "Asia/Tokyo" }, zone)
      .at.toISOString(),
    "2026-01-10T03:00:00.000Z",
  );
});
test("leap days, invalid alternatives, unknown zones and impossible clock values are validated", () => {
  assert.equal(dates.calendarDate("2028-02-29"), "2028-02-29");
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "2026-11-00",
    "0000-01-01",
    null,
  ])
    assert.throws(() => dates.calendarDate(value));
  for (const value of [
    { kind: "DATE", date: "2026-11-10", local: "12:00" },
    { kind: "TIME", local: "2026-01-01T25:00" },
    { kind: "TIME", local: "2026-01-01T12:00", timeZone: "Invalid/Zone" },
    { kind: "TIME", local: "2026-01-01T12:00", date: "2026-01-01" },
  ])
    assert.throws(() => dates.parseWorkDate(value, zone));
  assert.deepEqual(dates.parseWorkDate(null, zone, true), dates.emptyWorkDate());
  assert.throws(() => dates.parseWorkDate(null, zone));
});
test("deadline ordering interleaves timed/date-only values; filters use configured day bounds", () => {
  const date = dates.parseWorkDate({ kind: "DATE", date: "2026-11-10" }, zone),
    timed = dates.parseWorkDate({ kind: "TIME", local: "2026-11-10T20:00" }, zone);
  assert.ok(
    dates.dateSortInstant(timed, "deadline", zone) < dates.dateSortInstant(date, "deadline", zone),
  );
  assert.equal(dates.dateSortInstant(dates.emptyWorkDate(), "deadline", zone), Infinity);
  const value = query.parseWorkQuery(new URLSearchParams("due=today&sort=deadline&followup=due")),
    where = query.workQueryWhere(value, 1, new Date("2026-11-10T23:00Z"), zone);
  const text = JSON.stringify(where);
  assert.ok(text.includes("2026-11-10T05:00:00.000Z"));
  assert.ok(text.includes("2026-11-11T05:00:00.000Z"));
  assert.throws(
    () =>
      query.workQueryWhere(
        query.parseWorkQuery(new URLSearchParams("deadlineFrom=2026-11-11&deadlineTo=2026-11-10")),
        1,
      ),
    /range/,
  );
});
test("configured app timezone changes date meaning explicitly, independent of process TZ", () => {
  const previous = process.env.APP_TIME_ZONE;
  try {
    process.env.APP_TIME_ZONE = "Asia/Tokyo";
    const configured = loadTaskFoundation(validation);
    assert.equal(configured["@/lib/app-time-zone"].APP_TIME_ZONE, "Asia/Tokyo");
    const q = configured["./query"],
      where = q.workQueryWhere(
        q.parseWorkQuery(new URLSearchParams("due=today")),
        1,
        new Date("2026-11-10T01:00:00Z"),
      );
    assert.ok(JSON.stringify(where).includes("2026-11-09T15:00:00.000Z"));
    assert.ok(JSON.stringify(where).includes("2026-11-10T15:00:00.000Z"));
    process.env.APP_TIME_ZONE = "Invalid/Zone";
    assert.throws(() => loadTaskFoundation(validation), /time zone/i);
  } finally {
    if (previous === undefined) delete process.env.APP_TIME_ZONE;
    else process.env.APP_TIME_ZONE = previous;
  }
});
