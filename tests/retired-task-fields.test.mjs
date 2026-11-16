import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";
const types = loadWorkModule("src/lib/work-management/types.ts");
const fields = loadWorkModule("src/components/todos/TaskFoundationFields.tsx", {
  "@/lib/work-management/types": types,
});
test("old in-memory task drafts cannot submit retired company or course fields", () => {
  const draft = fields.foundationDraft({
    priorityLevel: "NORMAL",
    kind: "TASK",
    company: "Old",
    course: "Old",
  });
  assert.equal(Object.hasOwn(draft, "company"), false);
  assert.equal(Object.hasOwn(draft, "course"), false);
  const payload = fields.foundationPayload({
    ...draft,
    company: "Stale cached draft",
    course: "Stale cached draft",
  });
  assert.equal(Object.hasOwn(payload, "company"), false);
  assert.equal(Object.hasOwn(payload, "course"), false);
});
