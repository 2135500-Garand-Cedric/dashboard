import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
test(
  "Phase 05 real owner UI: independent child, multiple prerequisites, stale closure and recorded overrides at four viewport sizes",
  { skip: process.env.RUN_WORK_RELATIONSHIPS_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright"),
      base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 1800,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true }),
      context = await browser.newContext({ colorScheme: "dark", hasTouch: true });
    const ids = [],
      errors = [];
    let page;
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route(`${base}/api/youtube**`, (route) => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const read = async (id) => {
      const response = await context.request.get(`${base}/api/todos/${id}`);
      assert.equal(response.status(), 200);
      return response.json();
    };
    const write = async (id, body, suffix = "", method = "patch") => {
      const row = await read(id);
      const response = await context.request[method](`${base}/api/todos/${id}${suffix}`, {
        headers: { "Idempotency-Key": randomUUID(), "If-Match": `"${row.revision}"` },
        data: body,
      });
      assert.equal(response.status(), 200, await response.text());
      return response.json();
    };
    const create = async (title) => {
      const response = await context.request.post(`${base}/api/todos`, {
        headers: { "Idempotency-Key": randomUUID() },
        data: { title },
      });
      assert.equal(response.status(), 201, await response.text());
      const row = await response.json();
      ids.push(row.id);
      return row;
    };
    try {
      page = await context.newPage();
      page.setDefaultTimeout(25000);
      page.on("pageerror", (error) => errors.push(error.message));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        const activate = (locator) => (viewport.width < 1024 ? locator.tap() : locator.click());
        const prefix = `Phase 05 browser ${viewport.width} ${randomUUID().slice(0, 8)}`,
          root = await create(prefix),
          first = await create(`${prefix} prerequisite one`),
          second = await create(`${prefix} prerequisite two`);
        await page.setViewportSize(viewport);
        await page.goto(`${base}/todos/${root.id}`);
        const relations = page.getByRole("region", { name: "Task relationships", exact: true });
        await activate(relations.getByRole("button", { name: "Create child task", exact: true }));
        await relations
          .getByRole("textbox", { name: "Child task title", exact: true })
          .fill(`${prefix} child`);
        assert.equal(
          await page.getByRole("button", { name: "Edit", exact: true }).isDisabled(),
          true,
        );
        const [created] = await Promise.all([
          page.waitForResponse(
            (r) => new URL(r.url()).pathname === "/api/todos" && r.request().method() === "POST",
          ),
          activate(relations.getByRole("button", { name: "Create child", exact: true })),
        ]);
        assert.equal(created.status(), 201);
        const child = await created.json();
        ids.push(child.id);
        assert.equal(child.parentId, root.id);
        await relations.getByRole("link", { name: new RegExp(child.reference) }).waitFor();
        for (const prerequisite of [first, second]) {
          await activate(
            relations.getByRole("button", { name: "Link existing task", exact: true }),
          );
          await relations
            .getByRole("combobox", { name: "Relationship type", exact: true })
            .selectOption("blocked-by");
          await relations
            .getByRole("textbox", { name: "Find relationship task", exact: true })
            .fill(prerequisite.reference);
          await page.waitForFunction(
            (id) =>
              [...document.querySelector('[aria-label="Relationship task"]').options].some(
                (item) => item.value === String(id),
              ),
            prerequisite.id,
          );
          await relations
            .getByRole("combobox", { name: "Relationship task", exact: true })
            .selectOption(String(prerequisite.id));
          await activate(relations.getByRole("button", { name: "Save relationship", exact: true }));
          await relations
            .getByRole("button", { name: "Link existing task", exact: true })
            .waitFor();
        }
        assert.equal((await read(root.id)).dependencyCount, 2);
        await activate(relations.getByRole("button", { name: "Blocked by", exact: true }));
        await relations.getByRole("link", { name: new RegExp(first.reference) }).waitFor();
        await page
          .getByRole("combobox", { name: "Task status", exact: true })
          .selectOption("WAITING");
        await page.waitForFunction(
          () => document.querySelector('[aria-label="Task status"]')?.value === "WAITING",
        );
        await page
          .getByRole("combobox", { name: "Task status", exact: true })
          .selectOption("IN_PROGRESS");
        let dialog = page.getByRole("dialog", { name: "Start task", exact: true });
        await dialog.waitFor();
        await dialog
          .getByRole("textbox", { name: "Override reason", exact: true })
          .fill("Explicit start despite prerequisites");
        await dialog
          .getByRole("checkbox", {
            name: "I explicitly override these current prerequisites.",
            exact: true,
          })
          .check();
        await activate(dialog.getByRole("button", { name: "Start task", exact: true }));
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("DONE");
        dialog = page.getByRole("dialog", { name: "Complete task", exact: true });
        await dialog.waitFor();
        await dialog
          .getByRole("textbox", { name: "Override reason", exact: true })
          .fill("Reviewed close despite prerequisites");
        await dialog
          .getByRole("checkbox", {
            name: "I explicitly override these current prerequisites.",
            exact: true,
          })
          .check();
        await dialog
          .getByRole("checkbox", {
            name: "Close this parent while leaving its unfinished children unchanged.",
            exact: true,
          })
          .check();
        await write(first.id, { status: "CANCELLED" });
        const [stale] = await Promise.all([
          page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === `/api/todos/${root.id}` &&
              r.request().method() === "PATCH",
          ),
          activate(dialog.getByRole("button", { name: "Complete task", exact: true })),
        ]);
        assert.equal(stale.status(), 409);
        await dialog.getByText(/Review this action again/).waitFor();
        await activate(dialog.getByRole("button", { name: "Refresh review", exact: true }));
        await dialog.getByText(new RegExp(`${first.reference}.*CANCELLED`)).waitFor();
        assert.equal(
          await dialog
            .getByRole("checkbox", {
              name: "I explicitly override these current prerequisites.",
              exact: true,
            })
            .isChecked(),
          false,
        );
        await dialog
          .getByRole("checkbox", {
            name: "I explicitly override these current prerequisites.",
            exact: true,
          })
          .check();
        await dialog
          .getByRole("checkbox", {
            name: "Close this parent while leaving its unfinished children unchanged.",
            exact: true,
          })
          .check();
        await activate(dialog.getByRole("button", { name: "Complete task", exact: true }));
        await dialog.waitFor({ state: "hidden" });
        assert.equal((await read(root.id)).status, "DONE");
        assert.equal((await read(child.id)).status, "NEW");
        await activate(relations.getByRole("button", { name: "Child tasks", exact: true }));
        const childLink = relations.getByRole("link", { name: new RegExp(child.reference) });
        await childLink.focus();
        await page.keyboard.press("Enter");
        await page.waitForURL((url) => url.pathname === `/todos/${child.id}`);
        await page
          .getByRole("region", { name: "Task relationships", exact: true })
          .getByRole("link", { name: new RegExp(root.reference) })
          .waitFor();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          "relationships must fit viewport width",
        );
        const history = await (
          await context.request.get(`${base}/api/todos/${root.id}/activity`)
        ).json();
        assert.equal(history.filter((entry) => entry.action === "BLOCKED_OVERRIDE").length, 2);
        assert.equal(
          history.filter((entry) => entry.action === "UNFINISHED_CHILDREN_ACKNOWLEDGED").length,
          1,
        );
        if (viewport.width === 1440)
          await page.screenshot({ path: "/tmp/work-phase05-desktop.png", fullPage: true });
        console.log(
          `Verified relationship selection, child navigation, start/closure and stale review at ${viewport.width}×${viewport.height}.`,
        );
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      console.log("Browser runtime errors", errors);
      if (page) {
        await page.screenshot({ path: "/tmp/work-phase05-failure.png", fullPage: true });
        console.log("Visible errors", await page.getByRole("alert").allTextContents());
        console.log(
          "Form state",
          JSON.stringify(
            await page
              .locator('form[aria-label="Relationship editor"]')
              .evaluateAll((forms) =>
                forms.map((form) => ({
                  valid: form.checkValidity(),
                  elements: [...form.elements].map((el) => ({
                    name: el.getAttribute("aria-label"),
                    value: el.value,
                    disabled: el.disabled,
                    validity: el.validationMessage,
                  })),
                })),
              ),
          ),
        );
      }
      throw error;
    } finally {
      if (page) await page.close();
      for (const id of ids) {
        const row = await read(id);
        if (row.archivedAt) await write(id, { archived: false });
        if (row.parentId)
          await write(id, { kind: "parent", targetId: row.parentId }, "/relationships", "delete");
        for (const section of ["blocked-by", "related"]) {
          const data = await (
            await context.request.get(`${base}/api/todos/${id}/relationships?section=${section}`)
          ).json();
          for (const item of data.items)
            await write(id, { kind: section, targetId: item.task.id }, "/relationships", "delete");
        }
      }
      for (const id of ids) {
        const row = await read(id);
        const response = await context.request.delete(`${base}/api/todos/${id}`, {
          headers: { "Idempotency-Key": randomUUID(), "If-Match": `"${row.revision}"` },
        });
        assert.equal(response.status(), 200, await response.text());
      }
      await browser.close();
    }
  },
);
