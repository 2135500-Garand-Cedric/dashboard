import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test("Phase 03 real UI/API: shared list/board filters, contacts, responsive details, URL/back/focus, drafts and stale saves", { skip: process.env.RUN_WORK_ALL_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require("playwright"), base = "http://localhost:3002";
  const token = await encode({ secret: "disposable-work-browser-test-secret-not-for-production", maxAge: 2400, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const browser = await chromium.launch({ headless: true }), tasks = new Set(), contacts = [], prefix = `Browser allwork ${randomUUID().slice(0, 8)}`;
  let context;
  try {
    context = await browser.newContext({ colorScheme: "dark", hasTouch: true });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route(`${base}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const request = context.request;
    async function command(path, method, body, revision) {
      const response = await request.fetch(base + path, { method, headers: { "Idempotency-Key": randomUUID(), ...(revision ? { "If-Match": `"${revision}"` } : {}) }, ...(body === undefined ? {} : { data: body }) });
      assert.ok(response.ok(), `${method} ${path}: HTTP ${response.status()}`); return response.json();
    }
    for (const suffix of ["requester", "affected", "waiting"]) contacts.push(await command("/api/work-contacts", "POST", { name: `${prefix} ${suffix}`, company: "Synthetic company" }));
    const catalogResponse = await request.get(`${base}/api/work-contexts`); assert.ok(catalogResponse.ok()); const contexts = await catalogResponse.json();
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    for (const [index, viewport] of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }, { width: 2560, height: 1440 }].entries()) {
      const activate = locator => viewport.width < 1024 ? locator.tap() : locator.click();
      await page.setViewportSize(viewport);
      const contextName = ["Work", "School", "Personal", null][index], selected = contexts.find(item => item.name === contextName);
      const params = new URLSearchParams({ q: prefix }); if (selected) params.set("context", String(selected.id));
      await page.goto(`${base}/todos?${params}`);
      await page.getByRole("heading", { name: "All Work", exact: true }).waitFor();
      await page.getByRole("button", { name: "+ New task", exact: true }).waitFor();
      await activate(page.getByRole("button", { name: "+ New task", exact: true }));
      assert.equal(await page.getByRole("combobox", { name: "Capture context", exact: true }).locator("option:checked").textContent(), contextName ?? "Personal");
      const title = `${prefix} ${viewport.width} ${"longword".repeat(30)}`;
      await page.getByRole("textbox", { name: "New todo title", exact: true }).fill(title);
      const [createdResponse] = await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === "/api/todos" && response.request().method() === "POST"), activate(page.getByRole("button", { name: "Add task", exact: true }))]);
      assert.equal(createdResponse.status(), 201); const row = await createdResponse.json(); tasks.add(row.id);
      const entry = page.locator(`[data-open-task="${row.id}"]`); await entry.waitFor();
      const listResults = await (await request.get(`${base}/api/work-items?${params}`)).json();
      await activate(page.getByRole("button", { name: "board", exact: true }));
      await page.getByRole("region", { name: "Work board", exact: true }).waitFor();
      const boardResults = await (await request.get(`${base}/api/work-items?${params}&mode=board`)).json();
      assert.deepEqual(boardResults.items.map(item => item.id), listResults.items.map(item => item.id));
      await activate(page.getByRole("button", { name: "list", exact: true }));
      const refreshedEntry = page.locator(`[data-open-task="${row.id}"]`); await refreshedEntry.focus(); await page.keyboard.press("Enter");
      const panel = page.getByRole("dialog", { name: "Task details", exact: true }); await panel.waitFor();
      await panel.getByRole("heading", { name: title, exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("task"), String(row.id));
      const panelBox = await panel.boundingBox(); assert.ok(panelBox.width <= viewport.width + 1); if (viewport.width < 768) assert.ok(panelBox.width >= viewport.width - 1);
      await activate(panel.getByRole("button", { name: "Edit", exact: true }));
      await panel.getByRole("textbox", { name: "Description", exact: true }).fill(`${prefix} searchable description`);
      await panel.getByRole("textbox", { name: "Next action", exact: true }).fill("Call the synthetic requester");
      await panel.getByRole("combobox", { name: "Priority", exact: true }).selectOption("URGENT");
      await panel.getByRole("textbox", { name: "Search requester", exact: true }).fill(prefix);
      await panel.getByRole("combobox", { name: "Requester", exact: true }).locator(`option[value="${contacts[0].id}"]`).waitFor({ state: "attached" });
      await panel.getByRole("combobox", { name: "Requester", exact: true }).selectOption(String(contacts[0].id));
      await panel.getByRole("textbox", { name: "Search affected people", exact: true }).fill(prefix);
      await panel.getByRole("checkbox", { name: new RegExp(`Affected people: .*affected.*#${contacts[1].id}$`) }).check();
      await panel.getByRole("textbox", { name: "Search waiting-on contact", exact: true }).fill(prefix);
      await panel.getByRole("combobox", { name: "Waiting-on contact", exact: true }).locator(`option[value="${contacts[2].id}"]`).waitFor({ state: "attached" });
      await panel.getByRole("combobox", { name: "Waiting-on contact", exact: true }).selectOption(String(contacts[2].id));
      // Reject a close, retain the same unsaved form, then save atomically.
      page.once("dialog", dialog => dialog.dismiss());
      await activate(panel.getByRole("button", { name: "Close details", exact: true }));
      assert.equal(await panel.getByRole("textbox", { name: "Description", exact: true }).inputValue(), `${prefix} searchable description`);
      await activate(panel.getByRole("button", { name: "Save", exact: true }));
      await panel.getByRole("button", { name: "Edit", exact: true }).waitFor();
      if (viewport.width === 1440) await page.screenshot({ path: "/tmp/work-phase03-desktop.png" });
      const saved = await (await request.get(`${base}/api/todos/${row.id}`)).json();
      assert.equal(saved.priorityLevel, "URGENT"); assert.equal(saved.requesterId, contacts[0].id); assert.equal(saved.waitingOnContactId, contacts[2].id); assert.deepEqual(saved.affectedPeople.map(person => person.id), [contacts[1].id]);
      if (index === 0) {
        await activate(panel.getByRole("button", { name: "Close details", exact: true }));
        await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Task details"]'));
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-open-task")), String(row.id));
        await page.keyboard.press("Enter");
        await panel.getByRole("heading", { name: title, exact: true }).waitFor();
        await page.goBack();
        await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Task details"]'));
        assert.equal(new URL(page.url()).searchParams.get("task"), null);
        await activate(page.locator(`[data-open-task="${row.id}"]`));
        await activate(panel.getByRole("button", { name: "Edit", exact: true }));
        await panel.getByRole("textbox", { name: "Description", exact: true }).fill("Unsaved browser-back draft");
        assert.equal(await panel.locator("article[data-work-dirty]").getAttribute("data-work-dirty"), "true");
        await page.goBack();
        await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Task details"]'));
        await activate(page.locator(`[data-open-task="${row.id}"]`));
        await panel.getByRole("textbox", { name: "Description", exact: true }).waitFor();
        assert.equal(await panel.getByRole("textbox", { name: "Description", exact: true }).inputValue(), "Unsaved browser-back draft");
        await panel.getByText("Unsaved draft restored. Save to apply it, or discard edits.", { exact: true }).waitFor();
        const beforeBack = page.url();
        page.once("dialog", dialog => dialog.dismiss());
        await activate(panel.getByRole("link", { name: "Open full page", exact: true }));
        assert.equal(page.url(), beforeBack);
        page.once("dialog", dialog => dialog.accept());
        await activate(panel.getByRole("button", { name: "Discard edits", exact: true }));
      }
      // Same fields on the stable full-page route; back restores filters.
      await activate(panel.getByRole("link", { name: "Open full page", exact: true }));
      await page.waitForURL(url => url.pathname === `/todos/${row.id}`);
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
      await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("WAITING");
      await page.waitForFunction(() => document.querySelector('[aria-label="Task status"]').value === "WAITING" && !document.querySelector('[aria-label="Task status"]').disabled);
      await activate(page.getByRole("button", { name: "← All Work", exact: true }));
      await page.getByRole("heading", { name: "All Work", exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("q"), prefix); if (selected) assert.equal(new URL(page.url()).searchParams.get("context"), String(selected.id));
      // Reload keeps the same URL filters and results.
      await page.reload(); await page.locator(`[data-open-task="${row.id}"]`).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Search work", exact: true }).inputValue(), prefix);
      await page.getByRole("textbox", { name: "Search work", exact: true }).fill(row.reference);
      await page.locator(`[data-open-task="${row.id}"]`).waitFor();
      await activate(page.locator(`[data-open-task="${row.id}"]`));
      await panel.getByRole("heading", { name: title, exact: true }).waitFor();
      await activate(panel.getByRole("button", { name: "Edit", exact: true }));
      await panel.getByRole("textbox", { name: "Task title", exact: true }).fill("Retained conflict draft");
      const latest = await (await request.get(`${base}/api/todos/${row.id}`)).json();
      await command(`/api/todos/${row.id}`, "PATCH", { nextAction: "Changed in other tab" }, latest.revision);
      await activate(panel.getByRole("button", { name: "Save", exact: true }));
      await panel.getByRole("alert").filter({ hasText: "changed in another window" }).waitFor();
      assert.equal(await panel.getByRole("textbox", { name: "Task title", exact: true }).inputValue(), "Retained conflict draft");
      page.once("dialog", dialog => dialog.accept());
      await activate(panel.getByRole("button", { name: "Discard edits", exact: true }));
      await activate(panel.getByRole("button", { name: "Close details", exact: true }));
      await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Task details"]'));
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); assert.ok(noOverflow, `page fits ${viewport.width}`);
      console.log(`Verified All Work at ${viewport.width}×${viewport.height}.`);
    }
    await page.goto(`${base}/todos?q=${encodeURIComponent(prefix)}`);
    await page.locator("summary").filter({ hasText: /^Manage contacts$/ }).click();
    await page.getByRole("textbox", { name: "Search contact directory", exact: true }).fill(prefix);
    await page.getByRole("button", { name: "New contact", exact: true }).click();
    await page.getByRole("textbox", { name: "Contact name", exact: true }).fill(`${prefix} directory entry`);
    await page.getByRole("textbox", { name: "Contact company", exact: true }).fill("Synthetic directory company");
    const [contactResponse] = await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === "/api/work-contacts" && response.request().method() === "POST"), page.getByRole("button", { name: "Save contact", exact: true }).click()]);
    assert.equal(contactResponse.status(), 201); const managed = await contactResponse.json(); contacts.push(managed);
    await page.getByRole("button", { name: `Edit contact ${managed.id}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Contact name", exact: true }).fill(`${prefix} renamed directory entry`);
    await page.getByRole("button", { name: "Save contact", exact: true }).click();
    await page.getByText(`${prefix} renamed directory entry · Synthetic directory company`, { exact: false }).first().waitFor();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: `Deactivate contact ${managed.id}`, exact: true }).click();
    await page.getByRole("button", { name: `Reactivate contact ${managed.id}`, exact: true }).waitFor();
    await page.getByRole("button", { name: `Reactivate contact ${managed.id}`, exact: true }).click();
    await page.getByRole("button", { name: `Deactivate contact ${managed.id}`, exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    if (context) {
      for (const id of tasks) {
        const response = await context.request.get(`${base}/api/todos/${id}`);
        if (response.ok()) { const row = await response.json(); const removed = await context.request.delete(`${base}/api/todos/${id}`, { headers: { "Idempotency-Key": randomUUID(), "If-Match": `"${row.revision}"` } }); assert.ok(removed.ok()); }
      }
      for (const contact of contacts) { const response = await context.request.get(`${base}/api/work-contacts/${contact.id}`); if (response.ok()) { const row = await response.json(); await context.request.patch(`${base}/api/work-contacts/${row.id}`, { headers: { "Idempotency-Key": randomUUID(), "If-Match": `"${row.revision}"` }, data: { active: false } }); } }
      await context.close();
    }
    await browser.close();
  }
});
