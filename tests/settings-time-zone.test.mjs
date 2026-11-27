import assert from "node:assert/strict";
import test from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { loadWorkModule } from "./helpers/work-support.mjs";

const scope = loadWorkModule("src/lib/time-zone-context.ts", {
  "node:async_hooks": { AsyncLocalStorage },
  "./app-time-zone": { APP_TIME_ZONE: "UTC" },
});
const dates = loadWorkModule("src/lib/japanese/dates.ts", { "@/lib/time-zone-context": scope });
const format = loadWorkModule("src/lib/work-management/date-format.ts");
const clock = loadWorkModule("src/lib/local-time.ts", { "./work-management/date-format": format });

test("saved timezone scopes survive awaits without leaking between concurrent requests", async () => {
  let preference = "Asia/Tokyo";
  const settings = loadWorkModule("src/lib/user-settings.ts", {
    "@/lib/prisma": { prisma: { user: { findUnique: async () => ({ timeZone: preference }) } } },
    "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1 },
    "./accounts/access": {
      getActor: async () => ({
        id: 1,
        role: "OWNER",
        permissions: [],
        initialized: true,
        timeZone: preference,
      }),
    },
    "./accounts/context.mjs": { runAsActor: (_actor, action) => action() },
    "./app-time-zone": { APP_TIME_ZONE: "UTC" },
    "./time-zone-context": scope,
  });
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const instant = new Date("2026-11-12T00:30:00Z");
  const tokyo = settings.withUserTimeZone(async () => {
    await barrier;
    return [scope.getAppTimeZone(), dates.torontoDateKey(instant)];
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  preference = "America/Los_Angeles";
  const losAngeles = settings.withUserTimeZone(async () => {
    release();
    await Promise.resolve();
    return [scope.getAppTimeZone(), dates.torontoDateKey(instant)];
  });
  assert.deepEqual(await tokyo, ["Asia/Tokyo", "2026-11-12"]);
  assert.deepEqual(await losAngeles, ["America/Los_Angeles", "2026-11-11"]);
  assert.equal(scope.getAppTimeZone(), "UTC");
  assert.equal(
    format.describeWorkDate({ date: "2026-11-12", at: null, timeZone: null }, "Pacific/Honolulu"),
    "2026-11-12 · date only",
  );
  assert.equal(
    format.describeWorkDate({ date: null, at: instant, timeZone: "UTC" }, "Asia/Tokyo"),
    "2026-11-12 09:30:00",
  );
});

test("wall-time input uses the selected zone and preserves DST gaps and both fold instants", () => {
  const choices = clock.repeatedTimeChoices("2026-11-01T01:30", "America/New_York");
  assert.equal(choices.minutesApart, 60);
  assert.deepEqual(
    choices.choices.map((choice) => choice.value),
    ["earlier", "later"],
  );
  assert.match(choices.choices[0].label, /GMT-04:00/);
  assert.match(choices.choices[1].label, /GMT-05:00/);
  assert.equal(
    clock.repeatedTimeChoices("2026-04-05T01:45", "Australia/Lord_Howe").minutesApart,
    30,
  );
  assert.equal(clock.repeatedTimeChoices("2026-11-02T10:00", "America/New_York"), null);
  assert.equal(clock.repeatedTimeChoices("2026-03-08T02:30", "America/New_York"), null);
  assert.equal(clock.repeatedTimeChoices("", "America/New_York"), null);
  assert.deepEqual(
    clock.resolveLocalInstants("2026-11-12T09:30", "Asia/Tokyo").map((date) => date.toISOString()),
    ["2026-11-12T00:30:00.000Z"],
  );
  assert.equal(clock.resolveLocalInstants("2026-03-08T02:30", "America/New_York").length, 0);
  assert.deepEqual(
    clock
      .resolveLocalInstants("2026-11-01T01:30", "America/New_York")
      .map((date) => date.toISOString()),
    ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"],
  );
});

test("account timezone writes target only the connected user and reject invalid zones", async () => {
  const { accountModules } = await import("./helpers/accounts.mjs");
  let actor = null;
  const writes = [];
  const db = {
    $transaction: async (action) =>
      action({
        user: {
          update: async (args) => {
            writes.push(args);
            return args.data;
          },
        },
      }),
  };
  const route = accountModules(db, {
    "@/lib/accounts/access": { getActor: async () => actor },
    "@/lib/accounts/identity": { identityAudit: async () => null },
    "next/headers": { cookies: async () => ({}) },
  }).load("src/app/api/account/route.ts");
  const request = (timeZone) =>
    new Request("http://localhost/api/account", {
      method: "POST",
      body: JSON.stringify({
        action: "profile",
        name: "Learner",
        timeZone,
        userId: 1,
        role: "OWNER",
      }),
    });
  assert.equal((await route.POST(request("Asia/Tokyo"))).status, 401);
  actor = { id: 7, role: "MEMBER" };
  assert.equal((await route.POST(request("Invalid/Timezone"))).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await route.POST(request("Asia/Tokyo"))).status, 200);
  assert.deepEqual(writes, [
    { where: { id: 7 }, data: { name: "Learner", timeZone: "Asia/Tokyo" } },
  ]);
});
