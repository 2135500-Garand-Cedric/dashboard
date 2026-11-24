import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import sharp from "sharp";

test(
  "Knowledge library supports phone/desktop authoring, private files, links, revisions and task integration",
  { skip: process.env.RUN_KNOWLEDGE_BROWSER_TEST !== "1", timeout: 300000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002",
      secret = "disposable-work-browser-test-secret-not-for-production";
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "dark",
    });
    const token = await encode({
      secret,
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    await context.route("https://www.googleapis.com/**", (route) => route.abort());
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(45000);
    page.on("pageerror", (error) => errors.push(error.message));
    const title = `VPN browser ${randomUUID().slice(0, 8)}`;
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
    try {
      const anonymous = await browser.newContext();
      for (const [path, method] of [
        ["/api/knowledge", "get"],
        ["/api/knowledge", "post"],
        ["/api/knowledge/1", "get"],
        ["/api/knowledge/1", "patch"],
        ["/api/knowledge/1/links", "post"],
        ["/api/knowledge/1/revisions", "get"],
        ["/api/knowledge/tags", "get"],
        ["/api/knowledge/work", "get"],
        ["/api/knowledge/export", "get"],
        ["/api/knowledge/1/attachments", "get"],
        ["/api/knowledge/1/attachments", "post"],
        ["/api/knowledge/1/attachments/1", "patch"],
        ["/api/knowledge/1/attachments/1", "delete"],
        ["/api/knowledge/1/attachments/1/file", "get"],
        ["/api/knowledge/1/attachments/1/cleanup", "post"],
      ])
        assert.equal((await anonymous.request[method](base + path)).status(), 401);
      const forbiddenToken = await encode({
        secret,
        maxAge: 60,
        token: { githubId: "9999", provider: "github", ownerAuthVersion: 1 },
      });
      await anonymous.addCookies([
        { name: "next-auth.session-token", value: forbiddenToken, url: base },
      ]);
      assert.equal((await anonymous.request.get(base + "/api/knowledge")).status(), 403);
      await anonymous.close();
      assert.equal(
        (
          await context.request.post(base + "/api/knowledge", {
            headers: { Origin: "https://evil.example" },
            data: { title: "Rejected" },
          })
        ).status(),
        403,
      );
      const task = await request("/api/todos", "post", { title: `${title} incident` });
      await request(`/api/todos/${task.id}/notes`, "post", {
        body: "Restarted service, then verified connectivity.",
      });
      await page.goto(`${base}/knowledge/new?taskId=${task.id}&title=${encodeURIComponent(title)}`);
      await page.getByLabel("Title", { exact: true }).fill(title);
      await page.getByLabel("Article type", { exact: true }).selectOption("TROUBLESHOOTING");
      await page.getByLabel("Tags", { exact: false }).fill("VPN, Windows");
      await page.getByRole("button", { name: "Templates", exact: true }).click();
      const templateDialog = page.getByRole("dialog", { name: "Article templates", exact: true });
      await templateDialog
        .getByRole("button", { name: "Troubleshooting template", exact: true })
        .click();
      await templateDialog
        .getByRole("button", { name: "Replace article text", exact: true })
        .click();
      await page
        .getByLabel("Article Markdown")
        .fill(
          "## Recovery\n\nFix ERR_VPN-0x800.\n\n- [x] Verified\n\n```sh\nrestart-service vpn\n```",
        );
      await page.getByRole("button", { name: "Include selected task notes" }).click();
      const notes = page.getByRole("dialog", { name: "Include selected task notes" });
      await notes.getByRole("checkbox").check();
      await notes.getByRole("button", { name: /Include 1 selected/ }).click();
      assert.ok(
        (await page.getByLabel("Article Markdown").inputValue()).includes("Restarted service"),
      );
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await page.getByRole("heading", { name: "Recovery", exact: true }).waitFor();
      await page.getByRole("button", { name: "Save article", exact: true }).click();
      await page.waitForURL(/\/knowledge\/\d+$/);
      const articleId = Number(new URL(page.url()).pathname.split("/").pop());
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
      await page.getByRole("button", { name: "Copy", exact: true }).waitFor();
      await page.getByText("Attachments", { exact: true }).click();
      const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } })
        .png()
        .toBuffer();
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: "vpn-screenshot.png", mimeType: "image/png", buffer: png });
      await page.getByRole("button", { name: "Upload file", exact: true }).click();
      // The article revision changes after an attachment mutation.
      await page.getByRole("heading", { name: title, exact: true }).waitFor();

      await page.getByText("vpn-screenshot.png", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Open", exact: true }).click();
      const fileDialog = page.getByRole("dialog", { name: "vpn-screenshot.png", exact: true });
      await fileDialog.waitFor();
      assert.ok(await fileDialog.locator("img").getAttribute("src"));
      await page.mouse.click(2, 2);
      await fileDialog.waitFor({ state: "hidden" });
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export article", exact: true }).click();
      assert.ok((await download).suggestedFilename().endsWith(".zip"));
      assert.equal(Number(new URL(page.url()).pathname.split("/").pop()), articleId);
      await page.goto(`${base}/todos/${task.id}`);
      const documentation = page.getByRole("region", { name: "Documentation", exact: true });
      await documentation.getByRole("link", { name: title, exact: true }).waitFor();
      await documentation.getByRole("link", { name: title, exact: true }).click();
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
      const reference = await request("/api/knowledge", "post", {
        title: `${title} reference`,
        body: `[Recovery](/knowledge/${articleId})`,
      });
      await page.goto(`${base}/knowledge/${articleId}`);
      await page.getByText("Article links & backlinks", { exact: true }).click();
      await page.getByRole("link", { name: reference.title, exact: true }).waitFor();
      await page.getByRole("link", { name: "Edit article", exact: true }).click();
      await page.getByLabel("Article Markdown").fill("Changed content");
      await page.getByRole("button", { name: "Insert article link", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "Choose an article", exact: true });
      await picker
        .getByRole("searchbox", { name: "Search articles", exact: true })
        .fill(reference.title);
      await picker.getByRole("button", { name: new RegExp(reference.title) }).click();
      assert.ok(
        (await page.getByLabel("Article Markdown").inputValue()).includes(
          `/knowledge/${reference.id}`,
        ),
      );
      await page.getByRole("link", { name: "Back", exact: false }).click({ trial: true });
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.getByRole("link", { name: "Back", exact: false }).click();
      assert.ok(page.url().endsWith("/edit"));
      await page.getByRole("button", { name: "Save article", exact: true }).click();
      await page.waitForURL(new RegExp(`/knowledge/${articleId}$`));
      await page.getByText("Revision history", { exact: true }).click();
      await page.getByRole("button", { name: /Revision 1 · CREATED/ }).click();
      const history = page.getByRole("dialog", { name: "Revision 1", exact: true });
      await history.waitFor();
      page.once("dialog", (dialog) => dialog.accept());
      await history.getByRole("button", { name: "Restore this content", exact: true }).click();
      await page.getByRole("heading", { name: "Recovery", exact: true }).waitFor();
      for (const width of [390, 768, 1440, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(350); // Let the existing responsive navigation transition settle.
        if (width === 390)
          await page.screenshot({ path: "/tmp/knowledge-phone.png", fullPage: true });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      }
      await page.screenshot({ path: "/tmp/knowledge-desktop.png", fullPage: true });
      await page.goto(`${base}/knowledge`);
      await page.getByRole("searchbox", { name: "Search knowledge" }).fill("ERR_VPN-0x800");
      await page
        .getByRole("link")
        .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
        .waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
