import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkModule } from "./helpers/work-support.mjs";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
const validation = loadWorkModule("src/lib/work-management/validation.ts", { "next/server": {} });
const modules = loadTaskFoundation(validation),
  dates = modules["./dates"];
const rules = loadWorkModule("src/lib/work-management/planning-rules.ts", { "./dates": dates });
test("planning local-day windows handle Toronto midnight and 23/25 hour days", () => {
  assert.equal(dates.localToday(new Date("2026-11-12T04:59:59Z"), "America/Toronto"), "2026-11-11");
  assert.equal(dates.localToday(new Date("2026-11-12T05:00:00Z"), "America/Toronto"), "2026-11-12");
  for (const [day, hours] of [
    ["2026-03-08", 23],
    ["2026-11-01", 25],
  ]) {
    const window = rules.planningWindow(day, "America/Toronto");
    assert.equal((window.end - window.start) / 3600000, hours);
  }
  assert.equal(rules.planningWindow("2026-12-29", "America/Toronto").through, "2027-01-05");
});
test("shared planning predicates keep focus, priority, no deadline and Waiting separate", () => {
  const now = new Date("2026-11-11T17:00:00Z"),
    where = (name) => rules.planningWhere(name, "2026-11-11", "America/Toronto", now, 1);
  assert.deepEqual(where("focus"), {
    focusRecords: { some: { userId: 1, date: "2026-11-11", active: true } },
  });
  assert.deepEqual(where("urgent"), { priorityLevel: "URGENT" });
  assert.deepEqual(where("undated"), { deadlineDate: null, deadlineAt: null });
  assert.deepEqual(where("waiting"), { status: "WAITING" });
  assert.ok(where("blocked").prerequisites);
});

test("explicit planning dates agree in UTC and Tokyo process zones", () => {
  const previous = process.env.TZ;
  try {
    const results = [];
    for (const zone of ["UTC", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      results.push([
        dates.localToday(new Date("2026-11-12T04:30:00Z"), "America/Toronto"),
        rules.planningWindow("2026-11-01", "America/Toronto").end.toISOString(),
      ]);
    }
    assert.deepEqual(results[0], results[1]);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
