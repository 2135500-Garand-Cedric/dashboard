import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { snoozeInstant, inboxWhere, activeInboxWhere } from "../src/lib/notifications/inbox.mjs";
import { notificationId } from "../src/lib/notifications/inbox-api.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";

const now = new Date("2026-10-31T16:00:00Z");
test("snooze uses the dashboard timezone, validates bounds and explains repeated clock times", () => {
  assert.equal(
    snoozeInstant({ preset: "hour" }, "Asia/Tokyo", now).toISOString(),
    "2026-10-31T17:00:00.000Z",
  );
  assert.equal(
    snoozeInstant({ preset: "tomorrow" }, "America/Toronto", now).toISOString(),
    "2026-11-01T14:00:00.000Z",
  );
  assert.throws(
    () => snoozeInstant({ local: "2026-11-01T01:30" }, "America/Toronto", now),
    /occurs twice/,
  );
  assert.equal(
    snoozeInstant(
      { local: "2026-11-01T01:30", occurrence: "earlier" },
      "America/Toronto",
      now,
    ).toISOString(),
    "2026-11-01T05:30:00.000Z",
  );
  assert.equal(
    snoozeInstant(
      { local: "2026-11-01T01:30", occurrence: "later" },
      "America/Toronto",
      now,
    ).toISOString(),
    "2026-11-01T06:30:00.000Z",
  );
  assert.throws(
    () =>
      snoozeInstant(
        { local: "2027-03-14T02:30" },
        "America/Toronto",
        new Date("2027-03-13T12:00:00Z"),
      ),
    /does not exist/,
  );
  for (const value of [
    { local: "nonsense" },
    { local: "2026-02-30T09:00" },
    { local: "2026-10-30T12:00" },
    { local: "2027-01-01T12:00" },
  ])
    assert.throws(() => snoozeInstant(value, "UTC", now));
});
test("inbox counts share the exact active list eligibility and validate IDs", () => {
  assert.deepEqual(inboxWhere(1, "active", now), activeInboxWhere(1, now));
  assert.deepEqual(inboxWhere(1, "unread", now), { ...activeInboxWhere(1, now), readAt: null });
  assert.equal(notificationId(randomUUID()).length, 36);
  for (const value of ["/events/1", "not-an-id", 1, null])
    assert.throws(() => notificationId(value));
});
test("all inbox operations authorize before parsing the body or accessing the database", async () => {
  let accesses = 0;
  const forbidden = () => {
    accesses++;
    throw new Error("Should not access data");
  };
  for (const [file, methods] of [
    ["src/app/api/notifications/inbox/route.ts", ["GET"]],
    ["src/app/api/notifications/inbox/count/route.ts", ["GET"]],
    ["src/app/api/notifications/inbox/read-all/route.ts", ["POST"]],
    ["src/app/api/notifications/inbox/[id]/route.ts", ["GET", "PATCH"]],
    ["src/app/api/notifications/inbox/[id]/snooze/route.ts", ["POST"]],
  ]) {
    const routes = loadWorkModule(file, {
      "@/lib/require-owner": {
        requireOwner: async () => Response.json({ error: "Denied" }, { status: 403 }),
      },
      "@/lib/notifications/inbox-server": { inboxHandler: forbidden },
    });
    for (const method of methods)
      assert.equal(
        (
          await routes[method](
            { json: forbidden },
            { params: Promise.resolve({ id: randomUUID() }) },
          )
        ).status,
        403,
      );
  }
  assert.equal(accesses, 0);
});
