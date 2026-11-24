import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as webpush from "web-push";
import {
  DEFAULTS,
  pushConfiguration,
  settingsInput,
  subscriptionInput,
  dateOnlyInstant,
  reminderCandidate,
  reminderPayload,
} from "../src/lib/notifications/rules.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";

const keys = webpush.generateVAPIDKeys();
const environment = {
  PUSH_ENABLED: "true",
  PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
  PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
  PUSH_VAPID_SUBJECT: "mailto:owner@example.com",
  NEXTAUTH_URL: "https://dashboard.example.com",
  NODE_ENV: "production",
};
test("push configuration requires explicit opt-in, a matched key pair, HTTPS and a contact", () => {
  assert.equal(pushConfiguration({}), null);
  assert.ok(pushConfiguration(environment));
  for (const change of [
    { PUSH_ENABLED: "false" },
    { PUSH_VAPID_PRIVATE_KEY: "broken" },
    { NEXTAUTH_URL: "http://dashboard.example.com" },
    { PUSH_VAPID_SUBJECT: "https://localhost" },
  ])
    assert.equal(pushConfiguration({ ...environment, ...change }), null);
});
test("device registration rejects arbitrary outbound URLs and malformed keys", () => {
  const valid = {
    endpoint: "https://web.push.apple.com/valid",
    label: "My iPhone",
    keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString("base64url") },
  };
  assert.equal(subscriptionInput(valid).label, "My iPhone");
  for (const endpoint of [
    "https://127.0.0.1/internal",
    "http://web.push.apple.com/a",
    "https://web.push.apple.com.evil.test/a",
    "https://user:pass@web.push.apple.com/a",
    "https://web.push.apple.com:8443/a",
  ])
    assert.throws(() => subscriptionInput({ ...valid, endpoint }));
  assert.throws(() => subscriptionInput({ ...valid, keys: { ...valid.keys, auth: "wrong" } }));
  assert.throws(() => subscriptionInput({ ...valid, label: "" }));
});
test("notification preferences validate booleans, bounded offsets and wall time", () => {
  assert.deepEqual(settingsInput({ events: false, leadMinutes: 1440, dateOnlyTime: "08:30" }), {
    events: false,
    leadMinutes: 1440,
    dateOnlyTime: "08:30",
  });
  for (const body of [
    { events: "false" },
    { leadMinutes: -1 },
    { leadMinutes: 1.5 },
    { dateOnlyTime: "25:00" },
    { userId: 2 },
  ])
    assert.throws(() => settingsInput(body));
});
test("date-only reminders respect DST, gaps, repeated times and the user's zone", () => {
  assert.equal(
    dateOnlyInstant("2026-10-31", "09:00", "America/Toronto").toISOString(),
    "2026-10-31T13:00:00.000Z",
  );
  assert.equal(
    dateOnlyInstant("2026-11-01", "09:00", "America/Toronto").toISOString(),
    "2026-11-01T14:00:00.000Z",
  );
  assert.equal(
    dateOnlyInstant("2026-03-08", "02:30", "America/Toronto").toISOString(),
    "2026-03-08T07:30:00.000Z",
  );
  assert.equal(
    dateOnlyInstant("2026-11-01", "01:30", "America/Toronto").toISOString(),
    "2026-11-01T05:30:00.000Z",
  );
});
test("reminder identities survive title/offset edits but change for rescheduled occurrences; private notifications omit titles", () => {
  const source = {
    kind: "EVENT",
    id: 1,
    title: "Private appointment",
    label: "Event",
    at: "2026-11-16T18:00:00Z",
    url: "/events/1",
  };
  const first = reminderCandidate(source, DEFAULTS, "UTC");
  assert.equal(first.sendAt.toISOString(), "2026-11-16T17:45:00.000Z");
  assert.equal(
    reminderCandidate({ ...source, minutes: 60, title: "Changed" }, DEFAULTS, "UTC").occurrenceKey,
    first.occurrenceKey,
  );
  assert.notEqual(
    reminderCandidate({ ...source, at: "2026-11-17T18:00:00Z" }, DEFAULTS, "UTC").occurrenceKey,
    first.occurrenceKey,
  );
  assert.equal(reminderCandidate({ ...source, minutes: -1 }, DEFAULTS, "UTC"), null);
  assert.equal(
    reminderCandidate(
      { ...source, at: null, date: "2026-11-16" },
      DEFAULTS,
      "UTC",
    ).sendAt.toISOString(),
    "2026-11-16T09:00:00.000Z",
  );
  assert.ok(
    !JSON.stringify(reminderPayload(first, { ...DEFAULTS, showDetails: false }, "UTC")).includes(
      source.title,
    ),
  );
});
test("service worker always shows a visible notification, blocks external click URLs and never caches private responses", async () => {
  const handlers = {},
    shown = [];
  const worker = {
    location: { origin: "https://dashboard.example.com" },
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
    skipWaiting() {},
    registration: {
      showNotification: async (title, options) => {
        shown.push({ title, options });
      },
    },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (url) => url },
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: worker,
    URL,
  });
  assert.equal(handlers.fetch, undefined);
  let pending;
  handlers.push({
    data: { json: () => ({ title: "Test", url: "https://evil.example/steal" }) },
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  await pending;
  assert.equal(shown[0].options.data.url, "https://dashboard.example.com/settings");
  handlers.push({
    data: {
      json: () => {
        throw new Error("invalid JSON");
      },
    },
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  await pending;
  assert.equal(shown[1].title, "Dashboard reminder");
  handlers.notificationclick({
    notification: { close() {}, data: { url: "/events/42" } },
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  assert.equal(
    await pending,
    "https://dashboard.example.com/notifications/open?target=%2Fevents%2F42",
  );
});
test("every notification API rejects unauthorized requests before reading data or sending push", async () => {
  let accesses = 0;
  const forbidden = () => {
    accesses++;
    throw new Error("Must not run");
  };
  const deps = {
    "@/lib/require-owner": {
      requireOwner: async () => Response.json({ error: "Denied" }, { status: 401 }),
    },
    "@/lib/notifications/server": {
      notificationOverview: forbidden,
      saveNotificationSettings: forbidden,
      registerDevice: forbidden,
      unregisterDevice: forbidden,
      deviceId: forbidden,
      sendTestNotification: forbidden,
      notificationError: forbidden,
    },
  };
  for (const file of [
    "src/app/api/notifications/route.ts",
    "src/app/api/notifications/subscriptions/route.ts",
    "src/app/api/notifications/test/route.ts",
  ]) {
    const routes = loadWorkModule(file, deps);
    for (const method of ["GET", "POST", "PATCH", "DELETE"])
      if (routes[method]) assert.equal((await routes[method]({ json: forbidden })).status, 401);
  }
  assert.equal(accesses, 0);
});

test("notification click redirect preserves a safe target through login and rejects other accounts or external destinations", async () => {
  const policy = loadWorkModule("src/lib/owner-policy.ts");
  let session = null;
  const page = loadWorkModule("src/app/notifications/open/page.tsx", {
    "next-auth/next": { getServerSession: async () => session },
    "next/navigation": {
      redirect: (destination) => {
        throw Object.assign(new Error("Redirect"), { destination });
      },
    },
    "@/lib/auth": { authOptions: {} },
    "@/components/notifications/NotificationSourceOpen": { default: () => null },
    "@/lib/owner-policy": policy,
  }).default;
  const destination = async (target) => {
    try {
      await page({ searchParams: Promise.resolve({ target }) });
    } catch (error) {
      return error.destination;
    }
    assert.fail("Expected redirect");
  };
  assert.equal(
    await destination("/events/42"),
    "/api/auth/signin?callbackUrl=%2Fnotifications%2Fopen%3Ftarget%3D%252Fevents%252F42",
  );
  assert.equal(
    await destination("https://evil.example"),
    "/api/auth/signin?callbackUrl=%2Fnotifications%2Fopen%3Ftarget%3D%252Fsettings",
  );
  session = { githubId: "123", ownerAccess: true };
  assert.equal(await destination("/todos/1"), "/access-denied");
  session = { githubId: "89470930", ownerAccess: true };
  assert.equal(await destination("/todos/1"), "/todos/1");
  assert.equal(await destination("//evil.example/path"), "/settings");
});
