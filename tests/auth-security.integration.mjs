import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import ts from "typescript";

function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory()
        ? files(path.join(directory, item.name))
        : [path.join(directory, item.name)],
    );
}

test(
  "live app denies all anonymous data routes, rejects other identities, and allows the owner",
  { skip: process.env.RUN_AUTH_HTTP_TEST !== "1" },
  async () => {
    const base = "http://localhost:3000";
    const secret = process.env.NEXTAUTH_SECRET;
    assert.ok(secret, "Run inside the development container; never print or export the secret");
    const apiRoot = fileURLToPath(new URL("../src/app/api", import.meta.url));
    let checked = 0;
    for (const file of files(apiRoot).filter(
      (file) => file.endsWith("/route.ts") && !file.includes("/api/auth/"),
    )) {
      const endpoint = `/api/${path.relative(apiRoot, path.dirname(file)).replace(/\[[^\]]+\]/g, "1")}`;
      const ast = ts.createSourceFile(
        file,
        fs.readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const node of ast.statements) {
        if (
          !ts.isFunctionDeclaration(node) ||
          !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(node.name?.text)
        )
          continue;
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
      assert.equal((await fetch(`${base}/api/my-work`, { headers })).status, 403);
      for (const suffix of [
        "",
        "/1",
        "/1/timeline",
        "/1/attachments/1/file",
        "/1/milestones",
        "/1/transition",
      ])
        assert.equal((await fetch(`${base}/api/projects${suffix}`, { headers })).status, 403);
      assert.equal((await fetch(`${base}/api/work-items?q=private`, { headers })).status, 403);
      assert.equal((await fetch(`${base}/api/work-contacts`, { headers })).status, 403);
      for (const suffix of [
        "timeline",
        "attachments",
        "notes/1/revisions",
        "attachments/1/file",
        "relationships",
        "transition?status=DONE",
        "dates",
        "calendar",
        "focus",
      ])
        assert.equal((await fetch(`${base}/api/todos/1/${suffix}`, { headers })).status, 403);
      const page = await fetch(base, { headers, redirect: "manual" });
      assert.equal(page.status, 307);
      assert.ok(page.headers.get("location").endsWith("/access-denied"));
    }
    assert.equal(
      (await fetch(`${base}/api/events`, { headers: { cookie: "next-auth.session-token=forged" } }))
        .status,
      401,
    );
    const headers = { cookie: await cookie(owner) };
    assert.equal((await fetch(`${base}/api/events`, { headers })).status, 200);
    // Auth rejection alone does not exercise the running Prisma client's schema.
    const taskResponse = await fetch(`${base}/api/todos?archived=all`, { headers });
    assert.equal(taskResponse.status, 200, "owner task reads must work after schema changes");
    const tasks = await taskResponse.json();
    assert.ok(Array.isArray(tasks));
    const contexts = await fetch(`${base}/api/work-contexts`, { headers });
    assert.equal(contexts.status, 200, "owner context reads must work after schema changes");
    assert.ok(Array.isArray(await contexts.json()));
    const work = await fetch(`${base}/api/work-items?view=all`, { headers });
    assert.equal(work.status, 200);
    const workData = await work.json();
    assert.ok(Array.isArray(workData.items));
    assert.ok(workData.items.length <= workData.pageSize);
    const contacts = await fetch(`${base}/api/work-contacts`, { headers });
    assert.equal(contacts.status, 200);
    assert.ok(Array.isArray((await contacts.json()).items));
    if (tasks.length) {
      const detail = await fetch(`${base}/api/todos/${tasks[0].id}`, { headers });
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).id, tasks[0].id);
      const activity = await fetch(`${base}/api/todos/${tasks[0].id}/activity`, { headers });
      assert.equal(activity.status, 200);
      assert.ok(Array.isArray(await activity.json()));
      for (const suffix of [
        "timeline?filter=notes",
        "timeline?filter=all",
        "attachments",
        "relationships",
        "transition?status=DONE",
        "dates",
        "calendar",
        "focus",
      ]) {
        const supporting = await fetch(`${base}/api/todos/${tasks[0].id}/${suffix}`, { headers });
        assert.equal(supporting.status, 200, `owner supporting-record read: ${suffix}`);
        assert.match(supporting.headers.get("cache-control"), /no-store/);
      }
    }
    const projectResponse = await fetch(`${base}/api/projects?view=all`, { headers });
    assert.equal(projectResponse.status, 200);
    assert.match(projectResponse.headers.get("cache-control"), /no-store/);
    const projectPage = await projectResponse.json();
    assert.ok(Array.isArray(projectPage.items));
    if (projectPage.items.length) {
      const projectId = projectPage.items[0].id;
      for (const suffix of ["", "/milestones", "/timeline", "/attachments", "/transition"]) {
        const response = await fetch(`${base}/api/projects/${projectId}${suffix}`, { headers });
        assert.equal(response.status, 200, `Owner project route: ${suffix}`);
        assert.match(response.headers.get("cache-control"), /no-store/);
      }
    }
    const planningResponse = await fetch(`${base}/api/my-work`, { headers });
    assert.equal(planningResponse.status, 200);
    assert.match(planningResponse.headers.get("cache-control"), /no-store/);
    const planning = await planningResponse.json();
    assert.ok(planning.sections.focus);
    assert.match(planning.date, /^\d{4}-\d\d-\d\d$/);
    const calendarRange = "start=2026-11-01T00:00:00Z&end=2026-12-01T00:00:00Z";
    const calendarResponse = await fetch(`${base}/api/work-calendar?${calendarRange}`, { headers });
    assert.equal(calendarResponse.status, 200);
    const calendar = await calendarResponse.json();
    assert.ok(Array.isArray(calendar.items));
    assert.equal(typeof calendar.timeZone, "string");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const historyUrl = `${base}/api/japanese-practice/practice-sessions?date=${today}&kind=vocab`;
    const history = await fetch(historyUrl, { headers });
    assert.equal(history.status, 200);
    const beforeSessions = (await history.json()).sessions;
    const wordResponse = await fetch(`${base}/api/japanese-practice/vocabulary`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ activity: 1, nbWords: 1, categories: [] }),
    });
    assert.equal(wordResponse.status, 200);
    const { words } = await wordResponse.json();
    assert.ok(words.length);
    const completedAt = new Date();
    const preview = await fetch(`${base}/api/japanese-practice/practice-sessions/preview`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionKey: crypto.randomUUID(),
        activity: 1,
        startedAt: new Date(completedAt.getTime() - 65000).toISOString(),
        completedAt: completedAt.toISOString(),
        categories: [],
        starredOnly: false,
        updates: [{ activityVocabId: words[0].id, status: "PERFECT" }],
      }),
    });
    assert.equal(preview.status, 200);
    const { review } = await preview.json();
    assert.equal(review.id, null);
    assert.equal(review.durationSeconds, 65);
    assert.equal(review.words.length, 1);
    assert.ok(Number.isFinite(review.averageAfter));
    assert.equal(
      (await (await fetch(historyUrl, { headers })).json()).sessions.length,
      beforeSessions.length,
      "preview must not save a practice",
    );
    if (beforeSessions.length) {
      const detail = await fetch(
        `${base}/api/japanese-practice/practice-sessions/${beforeSessions[0].id}`,
        { headers },
      );
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).review.id, beforeSessions[0].id);
    }
    assert.equal(
      (
        await fetch(`${base}/api/events`, {
          method: "POST",
          headers: { ...headers, origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    for (const page of [
      "/",
      "/events",
      "/japanese/practice",
      "/japanese/practice/history",
      "/japanese/practice/history/1",
      "/japanese/statistics",
      "/todos",
      "/my-work",
      "/projects",
      "/projects/1",
      "/timemanager",
      "/finance",
      "/finance/accounts",
      "/finance/categories",
      "/finance/transactions",
      "/finance/transactions/new",
      "/finance/transactions/1",
      "/finance/receipts",
      "/finance/receipts/new",
      "/finance/receipts/1",
      "/finance/income",
      "/finance/income/new",
      "/finance/income/1",
      "/finance/income/settings",
      "/finance/imports",
      "/finance/imports/new",
      "/finance/imports/1",
      "/finance/reconciliation",
    ]) {
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
    for (const endpoint of [
      "income",
      "income-sources",
      "deduction-types",
      "imports",
      "reconciliation",
    ]) {
      const response = await fetch(`${base}/api/finance/${endpoint}`, { headers });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /no-store/);
      const data = await response.json();
      assert.ok(
        Array.isArray(
          data[
            endpoint === "income"
              ? "records"
              : endpoint === "income-sources"
                ? "sources"
                : endpoint === "imports"
                  ? "batches"
                  : endpoint === "reconciliation"
                    ? "records"
                    : "types"
          ],
        ),
      );
    }
    const denied = await fetch(`${base}/access-denied`);
    assert.equal(denied.status, 200);
    const html = await denied.text();
    assert.ok(html.includes("You cannot use this app"));
    assert.ok(!html.includes("Dashboard Menu"));
    console.log(
      `Verified ${checked} protected API handlers, page redirects, denied identities, forged cookies, and the owner session.`,
    );
  },
);
