import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "task/project notes, stage capture, active views, minute inputs, project targets and phone finance navigation",
  {
    skip: process.env.RUN_WORK_FINANCE_REFINEMENTS_BROWSER_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
      colorScheme: "dark",
    });
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const write = async (path, data, revision, method = "post") => {
      const response = await context.request[method](base + path, {
        data,
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
      });
      assert.ok(response.ok(), `${path}: ${await response.text()}`);
      return response.json();
    };
    const read = async (path) => {
      const response = await context.request.get(base + path);
      assert.ok(response.ok(), await response.text());
      return response.json();
    };
    const prefix = `Refinements ${randomUUID().slice(0, 8)}`;
    const project = await write("/api/projects", {
      name: `${prefix} project`,
      targetDate: "2027-06-15",
    });
    const noStages = await write("/api/projects", { name: `${prefix} without stages` });
    await write(`/api/projects/${project.id}/stages`, { name: "Build" }, project.revision);
    const stage = (await read(`/api/projects/${project.id}`)).stages.find(
      (row) => row.name === "Build",
    );
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2027-06-10T16:00:00Z") });
    let task;
    try {
      await page.goto(`${base}/todos/new?project=${project.id}`);
      assert.equal(
        await page.getByPlaceholder("Search project name or reference", { exact: true }).count(),
        0,
      );
      await page.getByLabel("Project", { exact: true }).selectOption(String(noStages.id));
      await page.getByLabel("Task stage", { exact: true }).waitFor({ state: "hidden" });
      await page.getByLabel("Project", { exact: true }).selectOption(String(project.id));
      await page.getByLabel("Task stage", { exact: true }).selectOption(String(stage.id));
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const projectBox = await page.getByLabel("Project", { exact: true }).boundingBox();
        const stageBox = await page.getByLabel("Task stage", { exact: true }).boundingBox();
        assert.ok(stageBox.y >= projectBox.y + projectBox.height);
        assert.equal(await page.getByText("Project stage (optional)", { exact: true }).count(), 0);
      }
      await page.setViewportSize({ width: 390, height: 900 });
      await page.getByLabel("Title", { exact: true }).fill(`${prefix} task`);
      const created = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/todos",
      );
      await page.getByRole("button", { name: "Create task", exact: true }).click();
      task = await (await created).json();
      assert.equal(task.stageId, stage.id);
      await page.waitForURL(base + "/todos");
      await page.goto(`${base}/todos/${task.id}`);
      await page.getByRole("button", { name: "Add note", exact: true }).click();
      let modal = page.getByRole("dialog", { name: "Add note", exact: true });
      assert.equal(await modal.getByLabel("Note occurred at", { exact: true }).count(), 0);
      assert.equal(await modal.getByLabel("Documentation links", { exact: true }).count(), 0);
      await modal.getByLabel("Note text", { exact: true }).fill(`${prefix} emailed supplier`);
      const noteStatus = modal.getByLabel("Note task status", { exact: true });
      assert.equal(
        await noteStatus.locator('option[value=""]').textContent(),
        "Keep current status (New)",
      );
      assert.equal(await noteStatus.locator('option[value="NEW"]').count(), 0);
      assert.equal(await noteStatus.getAttribute("required"), null);
      assert.equal(
        await modal.getByText("Change task status (optional)", { exact: true }).count(),
        0,
      );
      await modal.getByLabel("Note task status", { exact: true }).selectOption("WAITING");
      await modal.getByRole("button", { name: "Save note", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => document.querySelector('[aria-label="Task status"]')?.value === "WAITING",
      );
      const note = (await read(`/api/todos/${task.id}/timeline?filter=notes`)).notes[0];
      assert.equal(note.occurredAt, null);
      assert.deepEqual(note.statusChange, { before: "NEW", after: "WAITING" });
      await page.getByRole("button", { name: "Add note", exact: true }).click();
      assert.equal(
        await noteStatus.locator('option[value=""]').textContent(),
        "Keep current status (Waiting)",
      );
      assert.equal(await noteStatus.locator('option[value="WAITING"]').count(), 0);
      await modal.getByRole("button", { name: "Close Add note", exact: true }).click();
      await page.goto(`${base}/projects/${project.id}`);
      const inherited = page.getByRole("article", { name: `Note ${note.id}`, exact: true });
      await inherited.getByText(`${prefix} emailed supplier`, { exact: true }).waitFor();
      await inherited.getByRole("link", { name: new RegExp(task.reference) }).waitFor();
      assert.equal(await inherited.getByRole("button", { name: "Edit", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Add note", exact: true }).click();
      modal = page.getByRole("dialog", { name: "Add note", exact: true });
      assert.equal(await modal.getByLabel("Note task status", { exact: true }).count(), 0);
      await modal.getByLabel("Note text", { exact: true }).fill(`${prefix} project update`);
      await modal.getByRole("button", { name: "Save note", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      await page.getByText(`${prefix} project update`, { exact: true }).waitFor();
      await page.screenshot({ path: "/tmp/dashboard-project-notes-phone.png", fullPage: true });

      await page.goto(`${base}/todos/${task.id}`);
      await page.getByRole("button", { name: `Edit note ${note.id}`, exact: true }).click();
      modal = page.getByRole("dialog", { name: "Edit note", exact: true });
      await modal.getByLabel("Note text", { exact: true }).fill(`${prefix} supplier replied`);
      await modal.getByRole("button", { name: "Save note", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      await page.goto(`${base}/projects/${project.id}`);
      await inherited.getByText(`${prefix} supplier replied`, { exact: true }).waitFor();
      assert.equal(await page.getByText(`${prefix} emailed supplier`, { exact: true }).count(), 0);

      task = await read(`/api/todos/${task.id}`);
      task = await write(`/api/todos/${task.id}`, { status: "DONE" }, task.revision, "patch");
      await page.goto(`${base}/todos?q=${encodeURIComponent(task.title)}`);
      await page.locator(`[data-open-task="${task.id}"]`).waitFor();
      await page.getByRole("button", { name: "Show search and filters", exact: true }).click();
      const views = page.getByLabel("Work views", { exact: true });
      assert.deepEqual(await views.getByRole("button").allTextContents(), ["Active", "Archived"]);
      task = await write(`/api/todos/${task.id}`, { archived: true }, task.revision, "patch");
      await page.reload();
      assert.equal(await page.locator(`[data-open-task="${task.id}"]`).count(), 0);

      await page.goto(`${base}/events?project=${project.id}`);
      await page
        .locator("[data-mobile-month]")
        .getByRole("button", { name: "June 15, 2027, 1 event", exact: true })
        .click();
      const day = page.getByRole("region", { name: "Selected day events", exact: true });
      await day.getByText("Project target", { exact: false }).waitFor();
      await day.getByText(project.name, { exact: true }).waitFor();
      await page.getByRole("button", { name: "New event / session", exact: true }).click();
      modal = page.getByRole("dialog", { name: "New event or work session", exact: true });
      await modal.getByLabel("Event timing", { exact: true }).selectOption("TIMED");
      for (const name of ["Start date and time", "End date and time"]) {
        assert.equal(await modal.getByLabel(name, { exact: true }).getAttribute("step"), "60");
        await modal.getByLabel(name, { exact: true }).fill("2027-06-15T10:30");
        assert.equal((await modal.getByLabel(name, { exact: true }).inputValue()).length, 16);
      }
      page.once("dialog", (dialog) => dialog.accept());
      await modal
        .getByRole("button", { name: "Close New event or work session", exact: true })
        .click();
      await modal.waitFor({ state: "hidden" });
      await page.goto(base + "/finance/expenses/new");
      const currency = page.getByLabel("Receipt currency", { exact: true });
      await currency.waitFor();
      assert.deepEqual(await currency.locator("option").allTextContents(), [
        "CAD ($)",
        "USD ($)",
        "EUR (€)",
        "GBP (£)",
        "JPY (¥)",
      ]);
      assert.deepEqual(
        await currency
          .locator("option")
          .evaluateAll((options) => options.map((option) => option.value)),
        ["CAD", "USD", "EUR", "GBP", "JPY"],
      );
      await page.getByLabel("Subtotal", { exact: true }).fill("10");
      await page.getByLabel("Tax (optional)", { exact: true }).fill("1.25");
      await page.getByLabel("Tip (optional)", { exact: true }).fill(".5");
      await currency.focus();
      assert.equal(await page.getByLabel("Subtotal", { exact: true }).inputValue(), "10.00");
      assert.equal(await page.getByLabel("Tip (optional)", { exact: true }).inputValue(), "0.50");
      assert.equal(await page.getByLabel("Total", { exact: true }).inputValue(), "11.75");
      await page.getByLabel("Total", { exact: true }).fill("12");
      await currency.focus();
      assert.equal(await page.getByLabel("Total", { exact: true }).inputValue(), "12.00");
      await page.getByText(/Difference: 0.25/).waitFor();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const nav = page.getByRole("navigation", { name: "Finance navigation", exact: true });
        for (const link of await nav.getByRole("link").all()) {
          const box = await link.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width, `Navigation visible at ${width}px`);
        }
        if (width === 390) await page.screenshot({ path: "/tmp/dashboard-finance-tabs-phone.png" });
      }
      assert.deepEqual(errors, []);
      console.log(
        "Verified stage capture, atomic note status UI, project-wide linked notes, active/archived views, minute-only event inputs, project targets and five-currency/two-decimal phone finance controls.",
      );
    } catch (error) {
      await page
        .screenshot({ path: "/tmp/dashboard-refinements-failure.png", fullPage: true })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
