import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
test(
  "Knowledge folder navigation and formatting work on desktop and phone",
  { skip: process.env.RUN_KNOWLEDGE_FOLDERS_BROWSER_TEST !== "1", timeout: 240000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "dark",
    });
    const base = "http://localhost:3002",
      token = await encode({
        secret: "disposable-work-browser-test-secret-not-for-production",
        maxAge: 3600,
        token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
      });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(30000);
    const prefix = `Browse ${randomUUID().slice(0, 8)}`;
    async function request(path, method = "get", data, revision) {
      const response = await context.request[method](base + path, {
        ...(data === undefined ? {} : { data }),
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
      });
      assert.ok(response.ok(), await response.text());
      return response.json();
    }
    try {
      const anonymous = await browser.newContext();
      for (const [path, method] of [
        ["/api/knowledge/folders", "get"],
        ["/api/knowledge/folders", "post"],
        ["/api/knowledge/folders/1", "patch"],
      ])
        assert.equal((await anonymous.request[method](base + path)).status(), 401);
      await anonymous.close();
      await page.goto(base + "/knowledge");
      await page
        .getByRole("navigation", { name: "Knowledge folders", exact: true })
        .getByRole("button", { name: "All articles", exact: true })
        .click();
      await page.getByRole("button", { name: "New folder", exact: true }).first().click();
      let dialog = page.getByRole("dialog", { name: "New folder", exact: true });
      await dialog.getByLabel("Folder name", { exact: true }).fill(`${prefix} Work`);
      await dialog.getByRole("button", { name: "Save folder", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const work = (await request("/api/knowledge/folders")).find(
        (row) => row.name === `${prefix} Work`,
      );
      await page
        .getByRole("navigation", { name: "Folder breadcrumbs" })
        .getByRole("button", { name: work.name, exact: true })
        .waitFor();
      await page.getByRole("button", { name: "New folder", exact: true }).first().click();
      dialog = page.getByRole("dialog", { name: "New folder", exact: true });
      assert.equal(
        await dialog.getByLabel("Parent folder", { exact: true }).inputValue(),
        String(work.id),
      );
      await dialog.getByLabel("Folder name", { exact: true }).fill(`${prefix} VPN`);
      await dialog.getByLabel("Folder icon", { exact: true }).selectOption("server");
      await dialog.getByRole("button", { name: "Save folder", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const child = (await request("/api/knowledge/folders")).find(
        (row) => row.name === `${prefix} VPN`,
      );
      await page
        .getByRole("navigation", { name: "Folder breadcrumbs" })
        .getByRole("button", { name: child.name, exact: true })
        .waitFor();
      await page.getByRole("link", { name: "New article", exact: true }).click();
      assert.equal(
        await page.getByRole("combobox", { name: "Article folder", exact: true }).inputValue(),
        String(child.id),
      );
      await page.getByLabel("Title", { exact: true }).fill(`${prefix} Guide`);
      await page.getByRole("button", { name: "Split", exact: true }).click();
      const editor = page.getByRole("textbox", { name: "Article Markdown", exact: true });
      for (const [label, suffix] of [
        ["Bold", "**"],
        ["Code", "\n```\n"],
        ["Heading", ""],
        ["Bullet list", ""],
      ]) {
        await editor.fill("Intro ");
        await editor.press("Control+End");
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.waitForFunction((suffix) => {
          const node = document.querySelector('textarea[aria-label="Article Markdown"]');
          return (
            node &&
            node.value.slice(node.selectionStart) === suffix &&
            document.activeElement === node
          );
        }, suffix);

        assert.equal(
          await page
            .getByRole("button", { name: "Split", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
        assert.equal(
          await editor.evaluate((node) => node.value.slice(node.selectionStart)),
          suffix,
        );
        assert.ok(await editor.evaluate((node) => node === document.activeElement));
      }
      await editor.fill("selected words");
      await editor.press("Control+a");
      await page.getByRole("button", { name: "Bold", exact: true }).click();
      assert.equal(await editor.inputValue(), "**selected words**");
      await page.keyboard.insertText(" added");
      assert.equal(await editor.inputValue(), "**selected words added**");
      await page.getByRole("button", { name: "Save article", exact: true }).click();
      await page.waitForURL(/\/knowledge\/\d+$/);
      const id = Number(new URL(page.url()).pathname.split("/").pop());
      assert.equal((await request(`/api/knowledge/${id}`)).folderId, child.id);
      await page
        .getByRole("navigation", { name: "Article location" })
        .getByRole("link", { name: child.name, exact: true })
        .click();
      await page.getByRole("heading", { name: `${prefix} Guide`, exact: true }).waitFor();
      const school = await request("/api/knowledge/folders", "post", {
        name: `${prefix} School`,
        icon: "book",
      });
      await page.getByRole("button", { name: "Manage folder", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Manage folder", exact: true });
      // Folder options are refreshed by navigation, so reload before moving to a newly created folder.
      await dialog.getByRole("button", { name: "Close Manage folder", exact: true }).click();
      await page.reload();
      await page.getByRole("button", { name: "Manage folder", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Manage folder", exact: true });
      await dialog.getByLabel("Folder name", { exact: true }).fill(`${prefix} Renamed VPN`);
      await dialog.getByLabel("Parent folder", { exact: true }).selectOption(String(school.id));
      await dialog.getByRole("button", { name: "Save folder", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page
        .getByRole("navigation", { name: "Folder breadcrumbs" })
        .getByRole("button", { name: school.name, exact: true })
        .waitFor();
      assert.equal((await request(`/api/knowledge/${id}`)).folderId, child.id);
      await page.getByRole("button", { name: "Manage folder", exact: true }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("dialog", { name: "Manage folder", exact: true })
        .getByRole("button", { name: "Archive folder", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Manage folder", exact: true })
        .waitFor({ state: "hidden" });
      assert.equal((await request(`/api/knowledge/${id}`)).folderArchived, true);
      await page.getByRole("button", { name: "Manage folder", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Manage folder", exact: true })
        .getByRole("button", { name: "Restore folder", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Manage folder", exact: true })
        .waitFor({ state: "hidden" });
      assert.equal((await request(`/api/knowledge/${id}`)).folderArchived, false);
      await page.goto(`${base}/knowledge/${id}/edit`);
      await page
        .getByRole("combobox", { name: "Article folder", exact: true })
        .selectOption(String(school.id));
      await page.getByRole("button", { name: "Save article", exact: true }).click();
      await page.waitForURL(new RegExp(`/knowledge/${id}$`));
      assert.equal((await request(`/api/knowledge/${id}`)).folderId, school.id);
      await page.goto(`${base}/knowledge?folder=${child.id}`);
      await page
        .getByRole("navigation", { name: "Folder breadcrumbs" })
        .getByRole("button", { name: `${prefix} Renamed VPN`, exact: true })
        .waitFor();
      for (const width of [390, 768, 1440, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(350);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        if (width === 390) {
          await page.getByRole("button", { name: "Folders", exact: true }).click();
          const nav = page.getByRole("dialog", { name: "Folders", exact: true });
          await nav.waitFor();
          await page.mouse.click(2, 2);
          await nav.waitFor({ state: "hidden" });
          await page.getByRole("button", { name: "Folders", exact: true }).click();
          await page
            .getByRole("dialog", { name: "Folders", exact: true })
            .getByRole("button", { name: "Unfiled", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Folders", exact: true })
            .waitFor({ state: "hidden" });
          await page.screenshot({ path: "/tmp/knowledge-folders-phone.png", fullPage: true });
        }
      }
      // Global and folder-specific searches should keep their visible scope switch.
      await page.goto(`${base}/knowledge?folder=${work.id}`);
      const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
      await search.fill(`${prefix} Guide`);
      await page.getByRole("heading", { name: `${prefix} Guide`, exact: true }).waitFor();
      await page
        .getByRole("checkbox", { name: "Search only this folder and its subfolders" })
        .check();
      await page.getByRole("heading", { name: "No matching articles", exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
