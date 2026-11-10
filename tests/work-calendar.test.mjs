import assert from "node:assert/strict";
import test from "node:test";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";
const validation = loadWorkModule("src/lib/work-management/validation.ts", { "next/server": {} }),
  core = loadTaskFoundation(validation)["./event-core"];
test("structural kind and timing validation keep label separate and reject incomplete sessions", () => {
  const data = core.parseEventFields({
    kind: "INFORMATIONAL",
    type: "Exam",
    busy: false,
    timing: { kind: "ALL_DAY", startDate: "2026-11-24", endExclusive: "2026-11-28" },
  });
  assert.equal(data.kind, "INFORMATIONAL");
  assert.equal(data.type, "Exam");
  assert.equal(data.date, null);
  assert.equal(data.allDayEnd, "2026-11-28");
  assert.throws(
    () => core.parseEventFields({ date: "2026-11-10Z", timing: { kind: "TBD" } }),
    /one timing/,
  );
  assert.throws(
    () =>
      core.parseEventFields({
        timing: { kind: "ALL_DAY", startDate: "2026-11-24", endExclusive: "2026-11-24" },
      }),
    /follow/,
  );
  assert.throws(
    () =>
      core.checkEventTimes({
        kind: "WORK_SESSION",
        date: null,
        endDate: null,
        allDayStart: null,
        allDayEnd: null,
        timeZone: null,
      }),
    /session needs/,
  );
});
test("task link inputs validate role, uniqueness, explicit versions and maximum count", () => {
  assert.deepEqual(core.parseEventLinks([{ todoId: 1, role: "RELATED" }]), [
    { todoId: 1, role: "RELATED" },
  ]);
  assert.throws(
    () =>
      core.parseEventLinks([
        { todoId: 1, role: "RELATED" },
        { todoId: 1, role: "SESSION_TARGET" },
      ]),
    /only once/,
  );
  assert.throws(() => core.parseEventLinks([{ todoId: 1, role: "OWNER" }]), /related task/);
  assert.throws(
    () =>
      core.parseEventLinks(
        Array.from({ length: 31 }, (_, i) => ({ todoId: i + 1, role: "RELATED" })),
      ),
    /at most/,
  );
});
