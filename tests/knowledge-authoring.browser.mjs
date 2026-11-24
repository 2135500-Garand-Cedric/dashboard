import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import sharp from "sharp";
test(
  "Knowledge authoring supports empty formatting, custom templates, creation links and inline images",
  { skip: process.env.RUN_KNOWLEDGE_AUTHORING_BROWSER_TEST !== "1", timeout: 300000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright"),
      browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002",
      context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
      });
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(45000);
    page.on("pageerror", (error) => errors.push(error.message));
    const prefix = `Compose ${randomUUID().slice(0, 8)}`,
      png = await sharp({ create: { width: 3, height: 3, channels: 3, background: "blue" } })
        .png()
        .toBuffer();
    async function request(path, method = "get", data, revision) {
      const response = await context.request[method](base + path, {
        ...(data === undefined ? {} : { data }),
        headers: {
          "Idempotency-Key": randomUUID(),
          ...(revision ? { "If-Match": `"${revision}"` } : {}),
        },
      });
      assert.ok(response.ok(), `${path}: ${await response.text()}`);
      return response.json();
    }
    async function addImage(name) {
      await page.getByRole("button", { name: "Insert image", exact: true }).click();
      const modal = page.getByRole("dialog", { name: "Article images", exact: true });
      await modal
        .getByLabel("Inline image file", { exact: true })
        .setInputFiles({ name, mimeType: "image/png", buffer: png });
      await modal.getByRole("button", { name: "Upload and insert image", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
    }
    try {
      const anonymous = await browser.newContext();
      for (const [path, method] of [
        ["/api/knowledge/templates", "get"],
        ["/api/knowledge/templates", "post"],
        ["/api/knowledge/templates/1", "get"],
        ["/api/knowledge/templates/1", "patch"],
        ["/api/knowledge/drafts", "post"],
        [`/api/knowledge/drafts/${randomUUID()}`, "delete"],
        ["/api/knowledge/images?articleId=1", "get"],
        ["/api/knowledge/images?articleId=1", "post"],
        ["/api/knowledge/images/1", "delete"],
        ["/api/knowledge/images/1/file", "get"],
      ])
        assert.equal((await anonymous.request[method](base + path)).status(), 401);
      await anonymous.close();
      await page.goto(base + "/knowledge/templates");
      await page.getByRole("button", { name: "New template", exact: true }).click();
      let modal = page.getByRole("dialog", { name: "New template", exact: true });
      await modal.getByLabel("Template name", { exact: true }).fill(`${prefix} incident`);
      await modal.getByLabel("Template type", { exact: true }).selectOption("TROUBLESHOOTING");
      const templateBody = "## Situation\n\n## Investigation\n\n- \n\n## Solution\n";
      await modal.getByLabel("Template Markdown", { exact: true }).fill(templateBody);
      await modal.getByRole("button", { name: "Save template", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      const template = (await request(`/api/knowledge/templates?q=${encodeURIComponent(prefix)}`))
        .items[0];
      assert.ok(template.id);
      const task = await request("/api/todos", "post", { title: `${prefix} request` }),
        project = await request("/api/projects", "post", { name: `${prefix} project` });
      await page.goto(base + "/knowledge/new");
      const title = `${prefix} guide`,
        editor = page.getByRole("textbox", { name: "Article Markdown", exact: true });
      await page.getByLabel("Title", { exact: true }).fill(title);
      for (const [kind, row] of [
        ["task", task],
        ["project", project],
      ]) {
        await page.getByRole("button", { name: "Link task or project", exact: true }).click();
        modal = page.getByRole("dialog", { name: "Link related work", exact: true });
        await modal.getByLabel("Related work type", { exact: true }).selectOption(kind);
        await modal.getByLabel("Search related work", { exact: true }).fill(prefix);
        await modal
          .getByRole("button", { name: new RegExp(kind === "task" ? row.title : row.name) })
          .click();
        await modal.waitFor({ state: "hidden" });
      }
      await page.getByRole("button", { name: "Split", exact: true }).click();
      for (const [label, value, position] of [
        ["Heading", "## ", 3],
        ["Bold", "****", 2],
        ["Code", "\n```\n\n```\n", 5],
        ["Bullet list", "- ", 2],
      ]) {
        await editor.fill("");
        await editor.focus();
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.waitForFunction(
          ({ value, position }) => {
            const node = document.querySelector('textarea[aria-label="Article Markdown"]');
            return (
              node?.value === value &&
              node.selectionStart === position &&
              node === document.activeElement
            );
          },
          { value, position },
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Split", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
      }
      await page.keyboard.insertText("First point");
      await page.locator(".knowledge-markdown li").filter({ hasText: "First point" }).waitFor();
      assert.equal(await page.locator('.knowledge-markdown input[type="checkbox"]').count(), 0);
      await page.getByRole("button", { name: "Templates", exact: true }).click();
      modal = page.getByRole("dialog", { name: "Article templates", exact: true });
      await modal.getByRole("searchbox", { name: "Search templates", exact: true }).fill(prefix);
      await modal.getByRole("button", { name: template.name, exact: true }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await modal.getByRole("button", { name: "Replace article text", exact: true }).click();
      await modal.waitFor({ state: "hidden" });
      assert.equal(await editor.inputValue(), templateBody);
      await addImage("network-diagram.png");
      const markup = await editor.inputValue(),
        match = /\/api\/knowledge\/images\/(\d+)\/file/.exec(markup);
      assert.ok(match);
      const imagePath = match[0];
      await page.locator(`.knowledge-markdown img[src="${imagePath}"]`).waitFor();
      assert.equal((await context.request.get(base + imagePath)).status(), 200);
      assert.equal(
        (await request(`/api/knowledge?q=${encodeURIComponent(title)}`)).total,
        0,
        "Image upload must not publish an empty article.",
      );
      await page.getByRole("button", { name: "Save article", exact: true }).click();
      await page.waitForURL(/\/knowledge\/\d+$/);
      const id = Number(new URL(page.url()).pathname.split("/").pop());
      let saved = await request(`/api/knowledge/${id}`);
      assert.equal(saved.tasks[0].id, task.id);
      assert.equal(saved.projects[0].id, project.id);
      assert.ok(saved.body.includes(imagePath));
      await page.locator(`.knowledge-markdown img[src="${imagePath}"]`).waitFor();
      await page.getByText("Attachments", { exact: true }).click();
      await page.getByText("No attachments yet.", { exact: true }).waitFor();
      assert.equal((await request(`/api/knowledge/${id}/attachments`)).total, 0);
      await page.getByRole("link", { name: "Edit article", exact: true }).click();
      await editor.waitFor();
      await page.getByRole("button", { name: "Split", exact: true }).click();
      await addImage("second-diagram.png");
      await page.getByRole("button", { name: "Save article", exact: true }).click();
      await page.waitForURL(new RegExp(`/knowledge/${id}$`));
      saved = await request(`/api/knowledge/${id}`);
      assert.equal((saved.body.match(/!\[/g) || []).length, 2);
      const before = saved.body;
      await request(
        `/api/knowledge/templates/${template.id}`,
        "patch",
        { name: template.name, type: "TROUBLESHOOTING", body: "## Changed template\n" },
        template.revision,
      );
      assert.equal((await request(`/api/knowledge/${id}`)).body, before);
      await page.goto(base + "/knowledge/new");
      await page.getByLabel("Title", { exact: true }).fill(`${prefix} discarded`);
      await addImage("unused-image.png");
      const pending = /\/api\/knowledge\/images\/(\d+)\/file/.exec(await editor.inputValue())[0];
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("link", { name: "Back", exact: false }).click();
      await page.waitForURL(base + "/knowledge");
      let status = 200;
      for (let attempt = 0; attempt < 20 && status === 200; attempt++) {
        status = (await context.request.get(base + pending)).status();
        if (status === 200) await page.waitForTimeout(100);
      }
      assert.equal(status, 404);
      assert.equal(
        (await request(`/api/knowledge?q=${encodeURIComponent(`${prefix} discarded`)}`)).total,
        0,
      );
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(base + "/knowledge/new");
      await page.getByLabel("Title", { exact: true }).fill("Phone draft");
      await page.getByRole("button", { name: "Templates", exact: true }).click();
      modal = page.getByRole("dialog", { name: "Article templates", exact: true });
      await modal.waitFor();
      const box = await modal.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 391);
      await page.mouse.click(2, 2);
      await modal.waitFor({ state: "hidden" });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: "/tmp/knowledge-authoring-phone.png", fullPage: true });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
