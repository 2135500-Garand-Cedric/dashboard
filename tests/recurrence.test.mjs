import assert from "node:assert/strict";
import test from "node:test";
import { occurrenceDates, seriesTiming, snapshotTemplate } from "../src/lib/recurrence/rules.mjs";

test("weekly schedules retain the original weekday and inclusive end date", () => {
  assert.deepEqual(occurrenceDates("2026-11-18", "WEEKLY", "2026-11-19", "2026-12-09"), [
    "2026-11-25",
    "2026-12-02",
    "2026-12-09",
  ]);
});
test("monthly and leap-day schedules skip invalid dates without drifting", () => {
  assert.deepEqual(occurrenceDates("2026-01-31", "MONTHLY", "2026-01-31", "2026-05-31"), [
    "2026-01-31",
    "2026-03-31",
    "2026-05-31",
  ]);
  assert.deepEqual(occurrenceDates("2024-02-29", "YEARLY", "2025-01-01", "2032-12-31"), [
    "2028-02-29",
    "2032-02-29",
  ]);
  assert.throws(() => occurrenceDates("invalid", "DAILY", "2026-01-01", "2026-02-01"));
  assert.throws(
    () => occurrenceDates("2026-01-01", "DAILY", "2026-01-01", "2040-01-01"),
    /ten years/,
  );
});
test("timed recurrence follows local wall time across daylight-saving changes", () => {
  const series = {
    kind: "EVENT",
    anchor: "2026-03-01T09:00:00",
    timeZone: "America/Toronto",
    template: { durationMs: 3600000, occurrence: "earlier" },
  };
  assert.equal(seriesTiming(series, "2026-03-01").date.toISOString(), "2026-03-01T14:00:00.000Z");
  const later = seriesTiming(series, "2026-03-08");
  assert.equal(later.date.toISOString(), "2026-03-08T13:00:00.000Z");
  assert.equal(later.endDate - later.date, 3600000);
});
test("spring gaps shift forward and fall folds retain the chosen occurrence", () => {
  const series = {
    kind: "TASK",
    anchor: "2026-03-01T02:30:00",
    timeZone: "America/Toronto",
    template: { occurrence: "earlier" },
  };
  assert.equal(
    seriesTiming(series, "2026-03-08").deadlineAt.toISOString(),
    "2026-03-08T07:30:00.000Z",
  );
  series.anchor = "2026-10-25T01:30:00";
  const early = seriesTiming(series, "2026-11-01").deadlineAt;
  series.template.occurrence = "later";
  const late = seriesTiming(series, "2026-11-01").deadlineAt;
  assert.equal(late - early, 3600000);
});
test("all-day events retain their date span and tasks retain independent date-only deadlines", () => {
  const event = {
    kind: "EVENT",
    anchor: "2026-11-18",
    timeZone: "Asia/Tokyo",
    template: { spanDays: 3 },
  };
  assert.deepEqual(seriesTiming(event, "2026-12-18"), {
    allDayStart: "2026-12-18",
    allDayEnd: "2026-12-21",
    date: null,
    endDate: null,
    timeZone: null,
  });
  assert.deepEqual(seriesTiming({ ...event, kind: "TASK" }, "2026-12-18"), {
    deadlineDate: "2026-12-18",
    deadlineAt: null,
    deadlineTimeZone: null,
  });
});
test("templates copy project membership and checklist titles, never completion or notes", () => {
  const snapshot = snapshotTemplate(
    "TASK",
    {
      title: "Payroll",
      status: "DONE",
      deadlineDate: "2026-11-18",
      projectId: 12,
      stageId: 4,
      notes: [{ body: "private" }],
      subtasks: [{ title: "Approve", done: true }],
    },
    "UTC",
  );
  assert.equal(snapshot.template.data.projectId, 12);
  assert.equal(snapshot.template.data.stageId, 4);
  assert.deepEqual(snapshot.template.checklist, ["Approve"]);
  assert.equal(snapshot.template.data.status, undefined);
  assert.equal(snapshot.template.notes, undefined);
  assert.throws(() => snapshotTemplate("EVENT", { title: "Undated" }, "UTC"), /event date/);
});

test("four-date lookahead supports yearly and leap-day schedules", async () => {
  const { nextOccurrenceDates } = await import("../src/lib/recurrence/rules.mjs");
  assert.deepEqual(nextOccurrenceDates("2026-11-18", "YEARLY", "2027-01-01"), [
    "2027-11-18",
    "2028-11-18",
    "2029-11-18",
    "2030-11-18",
  ]);
  assert.deepEqual(nextOccurrenceDates("2024-02-29", "YEARLY", "2025-01-01"), [
    "2028-02-29",
    "2032-02-29",
    "2036-02-29",
    "2040-02-29",
  ]);
  assert.deepEqual(nextOccurrenceDates("2026-01-31", "MONTHLY", "2026-02-01"), [
    "2026-03-31",
    "2026-05-31",
    "2026-07-31",
    "2026-08-31",
  ]);
});
