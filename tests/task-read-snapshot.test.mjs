import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";
const { taskReadSnapshot, readSnapshot, memoTaskRead } = loadWorkModule(
  "src/lib/work-management/read-snapshot.ts",
);

test("initial task reads share a transaction and deduplicate concurrent task lookups", async () => {
  let transactions = 0,
    reads = 0;
  const db = {};
  const client = {
    $transaction: async (run) => {
      transactions++;
      return run(db);
    },
  };
  await taskReadSnapshot(client, async (snapshot) => {
    assert.equal(snapshot, db);
    const fetch = async () => {
      reads++;
      await Promise.resolve();
      return { id: 1 };
    };
    const [a, b] = await Promise.all([
      readSnapshot(client, (tx) => memoTaskRead(tx, "task:1", fetch)),
      readSnapshot(client, (tx) => memoTaskRead(tx, "task:1", fetch)),
    ]);
    assert.equal(a, b);
    assert.equal(transactions, 1);
    assert.equal(reads, 1);
  });
  await readSnapshot(client, (tx) =>
    memoTaskRead(tx, "task:1", async () => {
      reads++;
    }),
  );
  assert.equal(transactions, 2);
  assert.equal(reads, 2, "Subsequent API requests must read fresh data");
});

test("read snapshots never share task results between concurrent requests or mutation transactions", async () => {
  const client = { $transaction: async (run) => run({}) };
  const results = await Promise.all(
    ["first", "second"].map((value) =>
      taskReadSnapshot(client, async (db) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        const result = await memoTaskRead(db, "task:1", async () => value);
        const outside = await memoTaskRead({}, "task:1", async () => "different transaction");
        assert.equal(outside, "different transaction");
        return result;
      }),
    ),
  );
  assert.deepEqual(results, ["first", "second"]);
});
