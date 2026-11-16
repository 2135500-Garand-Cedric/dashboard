import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";
const { writtenEventDate, eventDateDisplay } = loadWorkModule(
  "src/lib/work-management/event-display.ts",
);
const timed = {
  date: "2026-11-16T22:00:00Z",
  endDate: "2026-11-17T00:30:00Z",
  allDayStart: null,
  allDayEnd: null,
};

test("written event times follow the display timezone, including date rollover and noon/midnight", () => {
  assert.equal(writtenEventDate(timed.date, "America/New_York"), "5pm, Nov 16, 2026");
  assert.equal(writtenEventDate(timed.date, "Asia/Tokyo"), "7am, Nov 17, 2026");
  assert.equal(writtenEventDate("2026-11-16T12:05:00Z", "UTC"), "12:05pm, Nov 16, 2026");
  assert.equal(writtenEventDate("2026-11-16T00:00:00Z", "UTC"), "12am, Nov 16, 2026");
  const result = eventDateDisplay(timed, "America/New_York");
  assert.equal(result.end, "7:30pm, Nov 16, 2026");
  assert.equal(result.duration, "2h 30m");
});

test("all-day spans display inclusive dates without timezone shifts", () => {
  const event = { date: null, endDate: null, allDayStart: "2026-11-16", allDayEnd: "2026-11-19" };
  for (const zone of ["Pacific/Honolulu", "Pacific/Kiritimati"]) {
    const result = eventDateDisplay(event, zone);
    assert.equal(result.start, "Nov 16, 2026");
    assert.equal(result.end, "Nov 18, 2026");
    assert.equal(result.duration, "3 days");
    assert.equal(eventDateDisplay({ ...event, allDayEnd: "2026-11-17" }, zone).end, null);
  }
});

test("open-ended and unscheduled events have no invented end or duration; DST duration is elapsed time", () => {
  assert.equal(eventDateDisplay({ ...timed, endDate: null }, "UTC").end, null);
  assert.equal(
    eventDateDisplay({ ...timed, date: null, endDate: null }, "UTC").start,
    "Date to be decided",
  );
  const fold = eventDateDisplay(
    { ...timed, date: "2026-11-01T05:30:00Z", endDate: "2026-11-01T06:30:00Z" },
    "America/New_York",
  );
  assert.equal(fold.duration, "1h");
  assert.equal(fold.start, fold.end);
});
