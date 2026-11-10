import assert from "node:assert/strict";
import test from "node:test";
import { loadTaskFoundation } from "./helpers/task-foundation.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";
const validation = loadWorkModule("src/lib/work-management/validation.ts", { "next/server": {} });
const graph = loadTaskFoundation(validation)["./graph"];
test("dependency graph handles deep paths, diamonds and cycles without recursion", () => {
  const edges = Array.from({ length: 12000 }, (_, i) => ({ dependentId: i + 1, prerequisiteId: i + 2 }));
  assert.doesNotThrow(() => graph.assertDependencyAddition(0, 1, edges));
  assert.throws(() => graph.assertDependencyAddition(12001, 1, edges), /cycle/);
  const diamond = [{ dependentId: 1, prerequisiteId: 2 }, { dependentId: 1, prerequisiteId: 3 }, { dependentId: 2, prerequisiteId: 4 }, { dependentId: 3, prerequisiteId: 4 }];
  assert.doesNotThrow(() => graph.assertDependencyAddition(0, 1, diamond));
  assert.throws(() => graph.assertDependencyAddition(4, 1, diamond), /cycle/);
  assert.throws(() => graph.assertDependencyAddition(1, 1, []), /itself/);
  assert.throws(() => graph.assertDependencyAddition(0, 1, [{ dependentId: 1, prerequisiteId: 2, legacyReviewReason: "CYCLE_PATH" }]), /legacy/);
});
test("hierarchy traverses deep chains and rejects self, missing parents and deep cycles", () => {
  const rows = Array.from({ length: 12000 }, (_, i) => ({ id: i + 1, parentId: i ? i : null, userId: 1 }));
  assert.equal(graph.descendants(1, rows).length, 11999);
  assert.equal(graph.assertParentChange(12001, 12000, rows).length, 12000);
  assert.throws(() => graph.assertParentChange(1, 12000, rows), /cycle/);
  assert.throws(() => graph.assertParentChange(1, 1, rows), /cycle/);
  assert.throws(() => graph.assertParentChange(1, 13000, rows), /owner/);
});
