import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAudit,
  auditSnapshot,
  withinAuditCommand,
  pruneAudit,
} from "../src/lib/audit/writer.mjs";
import { logDateRange } from "../src/lib/audit/dates.mjs";
const base = {
  userId: 1,
  actorKind: "OWNER",
  actorGithubId: "89470930",
  category: "WORK",
  action: "task.changed",
  entityType: "task",
  entityId: 42,
  summary: "Task changed",
};

test("audit payloads allowlist differences, redact private content, bound text and skip no-op/nested writes", async () => {
  const saved = [];
  const db = {
    auditEvent: {
      createMany: async ({ data }) => {
        saved.push(data);
        return { count: 1 };
      },
    },
  };
  await appendAudit(db, {
    ...base,
    before: auditSnapshot({
      status: "NEW",
      body: "SECRET BODY",
      email: "SECRET EMAIL",
      readings: ["secret"],
      token: "SECRET TOKEN",
    }),
    after: auditSnapshot({
      status: "WAITING",
      body: "changed secret",
      email: "changed email",
      readings: ["new secret"],
      token: "other token",
    }),
  });
  assert.deepEqual(saved[0].changes.status, { before: "NEW", after: "WAITING" });
  assert.deepEqual(saved[0].changes.body, { changed: true });
  assert.doesNotMatch(
    JSON.stringify(saved),
    /SECRET|changed secret|changed email|new secret|private|token/,
  );
  assert.equal(
    await appendAudit(db, {
      ...base,
      before: auditSnapshot({ status: "NEW", revision: 1 }),
      after: auditSnapshot({ status: "NEW", revision: 2 }),
    }),
    null,
  );
  await withinAuditCommand(() => appendAudit(db, base));
  assert.equal(saved.length, 1);
  await appendAudit(db, {
    ...base,
    summary: "x".repeat(500),
    after: auditSnapshot({ name: "n".repeat(500) }),
  });
  assert.equal(saved[1].summary.length, 300);
  await assert.rejects(
    appendAudit(db, { ...base, actorGithubId: "someone-else" }),
    /Invalid audit/,
  );
  await assert.rejects(appendAudit(db, { ...base, eventKey: "x".repeat(241) }), /too large/);
});
test("audit ranges preserve date-only values and DST local-day boundaries", () => {
  assert.equal(logDateRange("2026-02-30", "2026-03-01", "UTC"), null);
  assert.equal(logDateRange("2026-03-02", "2026-03-01", "UTC"), null);
  assert.equal(logDateRange("2000-01-01", "2026-03-01", "UTC"), null);
  assert.equal(
    auditSnapshot({ purchasedOn: new Date("2026-11-25T00:00:00Z") }).purchasedOn,
    "2026-11-25",
  );
  assert.equal(
    auditSnapshot({ date: new Date("2026-11-25T20:00:00Z") }).date,
    "2026-11-25T20:00:00.000Z",
  );
  const range = logDateRange("2026-11-01", "2026-11-01", "America/Toronto");
  assert.equal(range.gte.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(range.lt - range.gte, 25 * 3600000);
});
test("retention is bounded and deletes only eligible global audit rows", async () => {
  let selection, deletion;
  const db = {
    auditEvent: {
      findMany: async (args) => {
        selection = args;
        return [{ id: "expired" }];
      },
      deleteMany: async (args) => {
        deletion = args;
        return { count: 1 };
      },
    },
  };
  const now = new Date("2026-11-26T12:00:00Z");
  assert.equal(await pruneAudit(db, now, 10000), 1);
  assert.equal(selection.take, 500);
  assert.equal((now - selection.where.OR[0].occurredAt.lt) / 86400000, 180);
  assert.equal((now - selection.where.OR[1].occurredAt.lt) / 86400000, 30);
  assert.deepEqual(deletion, { where: { id: { in: ["expired"] } } });
});

test("authentication audits are bounded, renewal is not a sign-in, and outages do not block access", async () => {
  const { loadWorkModule } = await import("./helpers/work-support.mjs");
  const writer = await import("../src/lib/audit/writer.mjs");
  let denied = 20;
  const saved = [];
  const db = {
    $executeRaw: async () => {

    },
    auditEvent: {
      count: async () => denied,
      createMany: async ({ data }) => {
        saved.push(data);
        return { count: 1 };
      },
    },
  };
  const { auditAuthentication } = loadWorkModule("src/lib/audit/auth.ts", {
    "@/lib/prisma": { prisma: { $transaction: (action) => action(db) } },
    "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" },
    "./writer.mjs": writer,
  });
  await auditAuthentication("denied");
  assert.equal(saved.length, 0);
  denied = 0;
  await auditAuthentication("denied");
  assert.equal(saved[0].actorKind, "ANONYMOUS");
  await auditAuthentication("signed-in");
  assert.equal(saved[1].actorKind, "OWNER");
  const policy = loadWorkModule("src/lib/owner-policy.ts");
  const observed = [];
  const { authOptions } = loadWorkModule("src/lib/auth.ts", {
    "next-auth/providers/github": () => ({}),
    "./owner-policy": policy,
    "./audit/auth": { auditAuthentication: async (action) => observed.push(action) },
  });
  const token = { githubId: "89470930", provider: "github", ownerAuthVersion: 1 };
  await authOptions.callbacks.session({ session: {}, token });
  await authOptions.callbacks.jwt({ token });
  assert.deepEqual(observed, []);
  await authOptions.events.signIn({
    account: { provider: "github", providerAccountId: "89470930" },
  });
  await authOptions.events.signOut({ token });
  assert.deepEqual(observed, ["signed-in", "signed-out"]);
  const unavailable = loadWorkModule("src/lib/audit/auth.ts", {
    "@/lib/prisma": {prisma: {$transaction: async () => {throw new Error("SECRET_DATABASE_DIAGNOSTIC");}}},
    "@/lib/owner-policy": {OWNER_DATABASE_USER_ID:1,OWNER_GITHUB_ID:"89470930"},
    "./writer.mjs": writer,
  });
  const diagnostic = [];
  const previous = console.error;
  console.error = (message) => diagnostic.push(message);
  try {
    await assert.doesNotReject(unavailable.auditAuthentication("signed-in"));
    assert.equal(diagnostic.length,1);
    assert.doesNotMatch(diagnostic[0],/SECRET_DATABASE_DIAGNOSTIC/);
  } finally { console.error = previous; }

});
