import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import ts from "typescript";

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}

test("live app denies all anonymous data routes, rejects other identities, and allows the owner", { skip: process.env.RUN_AUTH_HTTP_TEST !== "1" }, async () => {
  const base = "http://localhost:3000";
  const secret = process.env.NEXTAUTH_SECRET;
  assert.ok(secret, "Run inside the development container; never print or export the secret");
  const apiRoot = fileURLToPath(new URL("../src/app/api", import.meta.url));
  let checked = 0;
  for (const file of files(apiRoot).filter((file) => file.endsWith("/route.ts") && !file.includes("/api/auth/"))) {
    const endpoint = `/api/${path.relative(apiRoot, path.dirname(file)).replace(/\[[^\]]+\]/g, "1")}`;
    const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (!ts.isFunctionDeclaration(node) || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(node.name?.text)) continue;
      const response = await fetch(base + endpoint, { method: node.name.text });
      assert.equal(response.status, 401, `${node.name.text} ${endpoint}`);
      assert.deepEqual(await response.json(), { error: "Authentication required." });
      checked += 1;
    }
  }
  assert.ok(checked >= 43);
  const cookie = async (token) => {
    const value = await encode({ token, secret, maxAge: 120 });
    return `next-auth.session-token=${value}; __Secure-next-auth.session-token=${value}`;
  };
  const owner = { githubId: "89470930", provider: "github", ownerAuthVersion: 1 };
  for (const token of [
    { ...owner, githubId: "123", ownerAccess: true, email: "cedricgarand@hotmail.com" },
    { ...owner, provider: "credentials" },
    { sub: "89470930", email: "cedricgarand@hotmail.com" },
  ]) {
    const headers = { cookie: await cookie(token) };
    assert.equal((await fetch(`${base}/api/events`, { headers })).status, 403);
    const page = await fetch(base, { headers, redirect: "manual" });
    assert.equal(page.status, 307);
    assert.ok(page.headers.get("location").endsWith("/access-denied"));
  }
  assert.equal((await fetch(`${base}/api/events`, { headers: { cookie: "next-auth.session-token=forged" } })).status, 401);
  const headers = { cookie: await cookie(owner) };
  assert.equal((await fetch(`${base}/api/events`, { headers })).status, 200);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const historyUrl = `${base}/api/japanese-practice/practice-sessions?date=${today}&kind=vocab`;
  const history = await fetch(historyUrl, { headers });
  assert.equal(history.status, 200);
  const beforeSessions = (await history.json()).sessions;
  const wordResponse = await fetch(`${base}/api/japanese-practice/vocabulary`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ activity: 1, nbWords: 1, categories: [] }),
  });
  assert.equal(wordResponse.status, 200);
  const { words } = await wordResponse.json();
  assert.ok(words.length);
  const completedAt = new Date();
  const preview = await fetch(`${base}/api/japanese-practice/practice-sessions/preview`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionKey: crypto.randomUUID(), activity: 1, startedAt: new Date(completedAt.getTime() - 65000).toISOString(), completedAt: completedAt.toISOString(), categories: [], starredOnly: false, updates: [{ activityVocabId: words[0].id, status: "PERFECT" }] }),
  });
  assert.equal(preview.status, 200);
  const { review } = await preview.json();
  assert.equal(review.id, null);
  assert.equal(review.durationSeconds, 65);
  assert.equal(review.words.length, 1);
  assert.ok(Number.isFinite(review.averageAfter));
  assert.equal((await (await fetch(historyUrl, { headers })).json()).sessions.length, beforeSessions.length, "preview must not save a practice");
  if (beforeSessions.length) {
    const detail = await fetch(`${base}/api/japanese-practice/practice-sessions/${beforeSessions[0].id}`, { headers });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).review.id, beforeSessions[0].id);
  }
  assert.equal((await fetch(`${base}/api/events`, { method: "POST", headers: { ...headers, origin: "https://untrusted.example" } })).status, 403);
  for (const page of ["/", "/events", "/japanese/practice", "/japanese/practice/history", "/japanese/practice/history/1", "/japanese/statistics", "/todos", "/timemanager", "/finance", "/finance/accounts", "/finance/categories", "/finance/transactions", "/finance/transactions/new", "/finance/transactions/1", "/finance/receipts", "/finance/receipts/new", "/finance/receipts/1"]) {
    const response = await fetch(base + page, { redirect: "manual" });
    assert.equal(response.status, 307, page);
    assert.ok(response.headers.get("location").includes("/api/auth/signin"));
  }
  for (const endpoint of ["accounts", "categories", "transactions", "receipts"]) {
    const response = await fetch(`${base}/api/finance/${endpoint}`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.ok(Array.isArray((await response.json())[endpoint]));
  }
  const denied = await fetch(`${base}/access-denied`);
  assert.equal(denied.status, 200);
  const html = await denied.text();
  assert.ok(html.includes("You cannot use this app"));
  assert.ok(!html.includes("Dashboard Menu"));
  console.log(`Verified ${checked} protected API handlers, page redirects, denied identities, forged cookies, and the owner session.`);
});
