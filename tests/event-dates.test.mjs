import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/event-dates.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exportsObject = {};
new Function("exports", compiled)(exportsObject);
const { validateEventDates, toLocalDateTime, formatEventRange } = exportsObject;

test("allows TBD events and a start without an end", () => {
  assert.equal(validateEventDates(null, null), null);
  assert.equal(validateEventDates("2026-10-14T09:00:00Z", null), null);
});

test("allows ranges crossing weeks, months, and years", () => {
  assert.equal(validateEventDates("2026-10-14T09:00:00Z", "2027-01-02T17:00:00Z"), null);
});

test("rejects an end without a start, reversed ranges, and equal endpoints", () => {
  assert.ok(validateEventDates(null, "2026-10-14T09:00:00Z"));
  assert.ok(validateEventDates("2026-10-15T09:00:00Z", "2026-10-14T09:00:00Z"));
  assert.ok(validateEventDates("2026-10-14T09:00:00Z", "2026-10-14T09:00:00Z"));
});

test("compares instants across timezone offsets", () => {
  assert.equal(validateEventDates("2026-11-01T01:30:00-04:00", "2026-11-01T01:15:00-05:00"), null);
});

test("rejects invalid dates and non-string inputs", () => {
  for (const value of ["invalid", "", 42, {}, []]) {
    assert.ok(validateEventDates(value, null));
    assert.ok(validateEventDates("2026-10-14T09:00:00Z", value));
  }
});

test("editor preserves the local date near midnight and during daylight saving time", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Toronto";
  try {
    assert.equal(toLocalDateTime("2026-10-15T02:30:00Z"), "2026-10-14T22:30");
    assert.equal(toLocalDateTime("2026-12-15T02:30:00Z"), "2026-12-14T21:30");
    assert.equal(toLocalDateTime(null), "");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("formats both endpoints when an end is provided", () => {
  assert.equal(formatEventRange(null, null), "TBD");
  assert.ok(!formatEventRange("2026-10-14T09:00:00Z", null).includes(" – "));
  assert.ok(formatEventRange("2026-10-14T09:00:00Z", "2026-10-17T17:00:00Z").includes(" – "));
});
