import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { samplePng, samplePdf } from "./helpers/work-support.mjs";

test(
  "Phase 04 real notes, revisions, private image/PDF uploads, phone capture, conflicts and safe rendering",
  { skip: process.env.RUN_WORK_SUPPORT_BROWSER_TEST !== "1" },
  async () => {
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright"),
      base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true }),
      created = [];
    let context;
    try {
      context = await browser.newContext({
        colorScheme: "dark",
        hasTouch: true,
        timezoneId: "America/Toronto",
      });
      await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      await context.route(`${base}/api/youtube**`, (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      await context.route("https://www.youtube.com/**", (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const request = context.request;
      async function command(path, method, body, revision) {
        const response = await request.fetch(base + path, {
          method,
          headers: {
            "Idempotency-Key": randomUUID(),
            ...(revision ? { "If-Match": `"${revision}"` } : {}),
          },
          ...(body === undefined ? {} : { data: body }),
        });
        assert.ok(response.ok(), `${method} ${path}: ${response.status()}`);
        return response.json();
      }
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
      ]) {
        const activate = (locator) => (viewport.width < 1024 ? locator.tap() : locator.click());
        const task = await command("/api/todos", "POST", {
          title: `Isolated Phase 04 ${viewport.width} ${randomUUID().slice(0, 8)}`,
        });
        created.push(task.id);
        await page.setViewportSize(viewport);
        await page.goto(`${base}/todos?q=${task.reference}`);
        await activate(page.locator(`[data-open-task="${task.id}"]`));
        const panel = page.getByRole("dialog", { name: "Task details", exact: true });
        await panel.getByRole("heading", { name: task.title, exact: true }).waitFor();
        const notes = panel.getByRole("region", { name: "Notes and activity", exact: true }),
          attachments = panel.getByRole("region", { name: "Task attachments", exact: true });
        await activate(notes.getByRole("button", { name: "Add note", exact: true }));
        const body = `<script>window.workInjected = true</script>\n${"Progress 日本語 ".repeat(70)}`;
        await notes.getByRole("textbox", { name: "Note text", exact: true }).fill(body);
        await activate(notes.locator("summary").filter({ hasText: "Links and occurred-at time" }));
        await notes
          .getByRole("textbox", { name: "Documentation links", exact: true })
          .fill("https://example.com/guide");
        await notes.getByLabel("Note occurred at", { exact: true }).fill("2026-10-30T19:00");
        page.once("dialog", (dialog) => dialog.dismiss());
        await activate(panel.getByRole("button", { name: "Close details", exact: true }));
        assert.equal(
          await notes.getByRole("textbox", { name: "Note text", exact: true }).inputValue(),
          body,
        );
        const [savedResponse] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === `/api/todos/${task.id}/notes` &&
              response.request().method() === "POST",
          ),
          activate(notes.getByRole("button", { name: "Save note", exact: true })),
        ]);
        assert.equal(savedResponse.status(), 201);
        const saved = await savedResponse.json();
        assert.equal(saved.occurredAt, "2026-10-30T23:00:00.000Z");
        let card = notes.getByRole("article", { name: `Note ${saved.id}`, exact: true });
        await card.waitFor();
        assert.equal(await page.evaluate(() => !!window.workInjected), false);
        assert.ok((await card.getByRole("link").getAttribute("rel")).includes("noopener"));
        await activate(card.getByRole("button", { name: `Edit note ${saved.id}`, exact: true }));
        await notes
          .getByRole("textbox", { name: "Note text", exact: true })
          .fill("Updated progress note");
        await activate(notes.getByRole("button", { name: "Save note", exact: true }));
        await notes.getByText("Note saved.", { exact: true }).waitFor();
        card = notes.getByRole("article", { name: `Note ${saved.id}`, exact: true });
        await activate(
          card.getByRole("button", { name: `Revisions for note ${saved.id}`, exact: true }),
        );
        await card.getByText(body, { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => !!window.workInjected), false);
        await activate(notes.getByRole("button", { name: "All activity", exact: true }));
        await notes.getByText("created", { exact: true }).waitFor();
        await activate(notes.getByRole("button", { name: "Notes only", exact: true }));
        card = notes.getByRole("article", { name: `Note ${saved.id}`, exact: true });
        await activate(card.getByRole("button", { name: `Edit note ${saved.id}`, exact: true }));
        await notes
          .getByRole("textbox", { name: "Note text", exact: true })
          .fill("Retained stale note draft");
        const current = (
          await (await request.get(`${base}/api/todos/${task.id}/timeline`)).json()
        ).notes.find((note) => note.id === saved.id);
        await command(
          `/api/todos/${task.id}/notes/${saved.id}`,
          "PATCH",
          { body: "Changed in another tab", documentationUrls: [], occurredAt: null },
          current.revision,
        );
        await activate(notes.getByRole("button", { name: "Save note", exact: true }));
        await notes.getByRole("alert").filter({ hasText: "changed in another window" }).waitFor();
        assert.equal(
          await notes.getByRole("textbox", { name: "Note text", exact: true }).inputValue(),
          "Retained stale note draft",
        );
        page.once("dialog", (dialog) => dialog.accept());
        await activate(notes.getByRole("button", { name: "Cancel note edit", exact: true }));
        await activate(notes.getByRole("button", { name: "Reload timeline", exact: true }));
        await notes.getByText("Changed in another tab", { exact: true }).first().waitFor();
        assert.equal(
          await attachments
            .getByLabel("Attachment camera", { exact: true })
            .getAttribute("capture"),
          "environment",
        );
        await attachments
          .getByLabel("Attachment file", { exact: true })
          .setInputFiles({
            name: "broken.png",
            mimeType: "image/png",
            buffer: Buffer.from("not a real image"),
          });
        await activate(attachments.getByRole("button", { name: "Upload attachment", exact: true }));
        await attachments.getByRole("alert").filter({ hasText: "Choose a valid JPEG" }).waitFor();
        assert.ok(
          await attachments
            .getByRole("button", { name: "Upload attachment", exact: true })
            .isVisible(),
        );
        await attachments
          .getByLabel("Attachment file", { exact: true })
          .setInputFiles({ name: "phone-photo.png", mimeType: "image/png", buffer: samplePng });
        await attachments
          .getByLabel("Attachment file", { exact: true })
          .setInputFiles({
            name: "unsafe.svg",
            mimeType: "image/svg+xml",
            buffer: Buffer.from("<svg><script>alert(1)</script></svg>"),
          });
        await attachments
          .getByRole("alert")
          .filter({ hasText: "previous selection was kept" })
          .waitFor();
        page.once("dialog", (dialog) => dialog.dismiss());
        await activate(panel.getByRole("button", { name: "Close details", exact: true }));
        const [uploadResponse] = await Promise.all([
          page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === `/api/todos/${task.id}/attachments` &&
              response.request().method() === "POST",
          ),
          activate(attachments.getByRole("button", { name: "Upload attachment", exact: true })),
        ]);
        assert.equal(uploadResponse.status(), 201);
        const image = await uploadResponse.json();
        await activate(
          attachments.getByRole("button", { name: `Preview attachment ${image.id}`, exact: true }),
        );
        const preview = attachments.getByRole("img", {
          name: "Attachment preview: phone-photo.png",
          exact: true,
        });
        await preview.waitFor();
        await page.waitForFunction(() =>
          [...document.images].some(
            (image) =>
              image.alt === "Attachment preview: phone-photo.png" && image.naturalWidth > 0,
          ),
        );
        const originalFile = await request.get(
          `${base}/api/todos/${task.id}/attachments/${image.id}/file?download=1`,
        );
        assert.equal(originalFile.status(), 200);
        assert.deepEqual(await originalFile.body(), samplePng);
        assert.match(originalFile.headers()["content-disposition"], /^attachment/);
        assert.match(originalFile.headers()["cache-control"], /no-store/);
        assert.match(originalFile.headers()["content-security-policy"], /sandbox/);
        assert.equal(
          (await request.get(`${base}/api/todos/2147483000/attachments/${image.id}/file`)).status(),
          404,
        );
        const chooserPromise = page.waitForEvent("filechooser");
        await activate(
          attachments.getByRole("button", { name: `Choose replacement ${image.id}`, exact: true }),
        );
        const chooser = await chooserPromise;
        await chooser.setFiles({
          name: "scan.pdf",
          mimeType: "application/pdf",
          buffer: samplePdf(),
        });
        await activate(
          attachments.getByRole("button", { name: "Replace attachment", exact: true }),
        );
        await attachments.getByText("Attachment saved.", { exact: true }).waitFor();
        await activate(
          attachments.getByRole("button", { name: `Preview attachment ${image.id}`, exact: true }),
        );
        await attachments
          .getByRole("img", { name: "scan.pdf PDF preview, page 1", exact: true })
          .waitFor();
        page.once("dialog", (dialog) => dialog.accept());
        await activate(
          attachments.getByRole("button", { name: `Remove attachment ${image.id}`, exact: true }),
        );
        await attachments.getByText("Attachment removed.", { exact: true }).waitFor();
        assert.equal(
          (await request.get(`${base}/api/todos/${task.id}/attachments/${image.id}/file`)).status(),
          404,
        );
        await attachments
          .getByLabel("Attachment file", { exact: true })
          .setInputFiles({
            name: "recovery-original.png",
            mimeType: "image/png",
            buffer: samplePng,
          });
        await activate(attachments.getByRole("button", { name: "Upload attachment", exact: true }));
        await attachments.getByText("Attachment saved.", { exact: true }).waitFor();
        await activate(notes.getByRole("button", { name: "Notes only", exact: true }));
        card = notes.getByRole("article", { name: `Note ${saved.id}`, exact: true });
        page.once("dialog", (dialog) => dialog.accept());
        await activate(card.getByRole("button", { name: `Remove note ${saved.id}`, exact: true }));
        await notes
          .getByText("Note removed. Earlier versions remain in revision history.", { exact: true })
          .waitFor();
        assert.equal(
          await panel.getByRole("button", { name: "Delete task", exact: true }).isDisabled(),
          true,
        );
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        );
        if (viewport.width === 1440)
          await page.screenshot({ path: "/tmp/work-phase04-desktop.png" });
        await activate(panel.getByRole("button", { name: "Close details", exact: true }));
        await panel.waitFor({ state: "hidden" });
        console.log(`Verified notes and attachments at ${viewport.width}×${viewport.height}.`);
      }
      assert.deepEqual(errors, []);
    } finally {
      if (context) {
        for (const id of created) {
          const response = await context.request.get(`${base}/api/todos/${id}`);
          if (response.ok()) {
            const task = await response.json();
            await context.request.patch(`${base}/api/todos/${id}`, {
              headers: { "Idempotency-Key": randomUUID(), "If-Match": `"${task.revision}"` },
              data: { archived: true },
            });
          }
        }
        await context.close();
      }
      await browser.close();
    }
  },
);
