import assert from "node:assert/strict";
import test from "node:test";
import { emailPreferencesInput, EmailSettingsError } from "../src/lib/email/preferences.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";

test("email consent requires a single valid recipient and a current settings revision", () => {
  assert.deepEqual(
    emailPreferencesInput({ enabled: true, recipient: " owner@example.com ", revision: 1 }),
    { enabled: true, recipient: "owner@example.com", revision: 1 },
  );
  assert.deepEqual(emailPreferencesInput({ enabled: false, recipient: "", revision: 0 }), {
    enabled: false,
    recipient: "",
    revision: 0,
  });
  for (const value of [
    { enabled: true, recipient: "", revision: 0 },
    { enabled: true, recipient: "a@example.com,b@example.com", revision: 0 },
    { enabled: true, recipient: "a@example.com\r\nBcc:other@example.com", revision: 0 },
    { enabled: true, recipient: "owner@example.com", revision: -1 },
    { enabled: true, recipient: "owner@example.com", revision: 0, userId: 2 },
  ])
    assert.throws(() => emailPreferencesInput(value), EmailSettingsError);
});

test("email settings APIs authorize before reading preferences or request bodies", async () => {
  const fail = () => assert.fail("Unauthorized email settings access");
  const route = loadWorkModule("src/app/api/settings/email/route.ts", {
    "@/lib/require-owner": { requireOwner: async () => Response.json({}, { status: 403 }) },
    "@/lib/prisma": { prisma: {} },
    "@/lib/owner-policy": { OWNER_DATABASE_USER_ID: 1 },
    "@/lib/email/resend.mjs": { emailConfiguration: fail },
    "@/lib/email/preferences.mjs": {
      readEmailPreferences: fail,
      saveEmailPreferences: fail,
      EmailSettingsError,
    },
  });
  for (const method of ["GET", "PATCH"])
    assert.equal((await route[method]({ json: fail })).status, 403);
});
