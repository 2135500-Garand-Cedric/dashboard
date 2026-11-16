import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";
const { calendarAppearance, calendarItemTiming, upcomingCalendarItems } = loadWorkModule(
  "src/lib/work-management/calendar-display.ts",
  {
    "./date-format": loadWorkModule("src/lib/work-management/date-format.ts"),
    "./event-display": loadWorkModule("src/lib/work-management/event-display.ts"),
  },
);
const item = (id, start, layer = "events", allDay = false) => ({
  id,
  start,
  allDay,
  title: id,
  extendedProps: { layer, href: `/todos/${id}` },
});

test("upcoming agenda includes every layer in date order, with no 40-item truncation", () => {
  const now = new Date("2026-11-16T18:00:00Z");
  const rows = [
    item("past", "2026-11-16T17:59:59Z"),
    item("now", now.toISOString()),
    item("deadline", "2026-11-16T21:00:00Z", "deadlines"),
    item("followup", "2026-11-16T19:00:00Z", "followups"),
    item("milestone", "2026-11-17", "milestones", true),
    item("session", "2026-11-16T20:00:00Z", "sessions"),
    ...Array.from({ length: 45 }, (_, i) => item(`event${i}`, "2026-11-18T12:00:00Z")),
  ];
  const result = upcomingCalendarItems(rows, now, "America/New_York");
  assert.equal(result.length, 49);
  assert.deepEqual(
    result.slice(0, 4).map((row) => row.id),
    ["followup", "session", "deadline", "milestone"],
  );
  assert.equal(rows[0].id, "past", "Sorting must not mutate the calendar feed");
});

test("date-only items include today in the chosen timezone, not the UTC day", () => {
  const now = new Date("2026-11-17T02:00:00Z");
  const rows = [
    item("today", "2026-11-16", "deadlines", true),
    item("yesterday", "2026-11-15", "followups", true),
  ];
  assert.deepEqual(
    upcomingCalendarItems(rows, now, "America/New_York").map((row) => row.id),
    ["today"],
  );
  assert.deepEqual(upcomingCalendarItems(rows, now, "Asia/Tokyo"), []);
});

test("timed agenda order uses actual instants through a repeated DST hour", () => {
  const rows = [item("later", "2026-11-01T06:05:00Z"), item("earlier", "2026-11-01T05:55:00Z")];
  assert.deepEqual(
    upcomingCalendarItems(rows, new Date("2026-11-01T05:00:00Z"), "America/New_York").map(
      (row) => row.id,
    ),
    ["earlier", "later"],
  );
});

test("agenda and legend use actual feed colors and label task markers distinctly", () => {
  const custom = {
    ...item("event", "2026-11-16T22:00:00Z"),
    borderColor: "#aabbcc",
    extendedProps: { layer: "events", plainTitle: "An appointment", activityType: "School" },
  };
  assert.equal(calendarAppearance(custom).color, "#aabbcc");
  assert.equal(calendarAppearance(custom).title, "An appointment");
  assert.equal(calendarAppearance(custom).activityType, "School");
  assert.equal(calendarAppearance(item("due", "2026-11-16", "deadlines", true)).label, "Deadline");
  assert.equal(
    calendarAppearance(item("follow", "2026-11-16", "followups", true)).color,
    "#f59e0b",
  );
  const span = { ...item("span", "2026-11-16", "events", true), end: "2026-11-19" };
  assert.equal(
    calendarItemTiming(span, "Pacific/Honolulu"),
    "Nov 16, 2026 – Nov 18, 2026 · All day",
  );
});

test("date-only task markers and historical items keep their meaning", () => {
  const due = {
    ...item("due", "2026-11-16", "deadlines", true),
    classNames: ["calendar-historical"],
    extendedProps: { layer: "deadlines", marker: true },
  };
  assert.equal(calendarItemTiming(due, "UTC"), "Nov 16, 2026 · Date only");
  assert.equal(calendarAppearance(due).historical, true);
});
