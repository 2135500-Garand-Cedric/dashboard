import assert from "node:assert/strict";
import test from "node:test";
import {
  latestWeeklyReportSource,
  weeklyReportSource,
} from "../src/lib/notifications/weekly-report.mjs";
import {
  DEFAULTS,
  reminderCandidate,
  reminderPayload,
  settingsInput,
} from "../src/lib/notifications/rules.mjs";

test("weekly reminders refer only to the latest completed local week", () => {
  const now = new Date("2026-11-23T00:30:00Z");
  const utc = latestWeeklyReportSource("UTC", now);
  const toronto = latestWeeklyReportSource("America/Toronto", now);
  assert.equal(utc.id, 20261116);
  assert.equal(utc.url, "/weekly-report?week=2026-11-16");
  assert.equal(toronto.id, 20261109);
  assert.equal(weeklyReportSource(20261123, "UTC", now), null);
  for (const id of [20260230, 20261117, -1, 20261116.5, "20261116"])
    assert.equal(weeklyReportSource(id, "UTC", now), null);
});

test("Monday reminders use the configured wall time and stable weekly identity across DST", () => {
  const settings = { ...DEFAULTS, leadMinutes: 10080, dateOnlyTime: "09:00" };
  const now = new Date("2026-11-03T15:00:00Z");
  const source = weeklyReportSource(20261026, "America/Toronto", now);
  const candidate = reminderCandidate(source, settings, "America/Toronto");
  assert.equal(candidate.sendAt.toISOString(), "2026-11-02T14:00:00.000Z");
  assert.equal(candidate.sendAt.getTime(), candidate.targetAt.getTime());
  const changedTime = reminderCandidate(
    source,
    { ...settings, dateOnlyTime: "10:00" },
    "America/Toronto",
  );
  assert.equal(candidate.occurrenceKey, changedTime.occurrenceKey);
  const next = reminderCandidate(
    weeklyReportSource(20261102, "UTC", new Date("2026-11-10")),
    settings,
    "UTC",
  );
  assert.notEqual(candidate.occurrenceKey, next.occurrenceKey);
  assert.equal(weeklyReportSource(20251229, "UTC", now).date, "2026-01-05");
});

test("weekly reminders support opt-out and private push text without financial details", () => {
  assert.deepEqual(settingsInput({ weeklyReports: false }), { weeklyReports: false });
  assert.throws(() => settingsInput({ weeklyReports: "true" }));
  const candidate = reminderCandidate(
    latestWeeklyReportSource("UTC", new Date("2026-11-24")),
    DEFAULTS,
    "UTC",
  );
  const payload = reminderPayload(candidate, DEFAULTS, "UTC");
  assert.match(payload.title, /Nov 16.*Nov 22, 2026/);
  assert.equal(payload.url, "/weekly-report?week=2026-11-16");
  assert.equal(
    reminderPayload(candidate, { ...DEFAULTS, showDetails: false }, "UTC").title,
    "Dashboard reminder",
  );
  assert.ok(!JSON.stringify(payload).includes("CAD"));
});
