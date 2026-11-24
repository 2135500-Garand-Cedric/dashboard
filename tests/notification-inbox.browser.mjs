import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "inbox desktop/phone preview, actions, snoozing, errors, source opening and auth work",
  { skip: process.env.RUN_NOTIFICATION_BROWSER_TEST !== "1", timeout: 240000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    try {
      const anonymous = await browser.newContext();
      const uuid = randomUUID();
      for (const [path, method] of [
        ["/api/notifications/inbox", "get"],
        ["/api/notifications/inbox/count", "get"],
        [`/api/notifications/inbox/${uuid}`, "get"],
        [`/api/notifications/inbox/${uuid}`, "patch"],
        [`/api/notifications/inbox/${uuid}/snooze`, "post"],
        ["/api/notifications/inbox/read-all", "post"],
      ]) {
        const response = await anonymous.request[method](base + path, { data: {} });
        assert.equal(response.status(), 401, path);
        assert.match(response.headers()["cache-control"], /no-store/);
      }
      const page = await anonymous.newPage();
      await page.goto(
        `${base}/notifications/open?target=${encodeURIComponent(`/notifications/${uuid}`)}`,
      );
      assert.match(page.url(), /signin/);
      assert.ok(
        new URL(page.url()).searchParams.get("callbackUrl").includes("/notifications/open?target="),
      );
      await anonymous.close();
      const foreign = await browser.newContext();
      await foreign.addCookies([
        {
          name: "next-auth.session-token",
          value: await encode({
            secret: "disposable-work-browser-test-secret-not-for-production",
            maxAge: 600,
            token: { githubId: "123", provider: "github", ownerAuthVersion: 1 },
          }),
          url: base,
        },
      ]);
      assert.equal((await foreign.request.get(`${base}/api/notifications/inbox`)).status(), 403);
      await foreign.close();
      const csrf = await browser.newContext();
      await csrf.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      assert.equal(
        (
          await csrf.request.patch(`${base}/api/notifications/inbox/${uuid}`, {
            headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
            data: { action: "read" },
          })
        ).status(),
        403,
      );
      await csrf.close();

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        const id = randomUUID();
        const item = {
          id,
          revision: 1,
          titleSnapshot: "Call the supplier",
          labelSnapshot: "Follow-up",
          category: "followUps",
          targetAt: new Date().toISOString(),
          dueAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          sourceDate: null,
          lifecycle: "ACTIVE",
          retiredReason: null,
          readAt: null,
          dismissedAt: null,
          snoozedUntil: null,
          color: "#10b981",
          url: "/settings/notifications",
          deliveries: [
            { status: "SENT", sentAt: new Date().toISOString(), generation: 0, device: "Phone" },
          ],
        };
        let mutations = 0,
          fail = false;
        await context.route("https://www.youtube.com/**", (route) => route.abort());
        await context.route("**/api/notifications/inbox**", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (request.method() !== "GET") {
            if (fail) {
              fail = false;
              return route.fulfill({ status: 503, json: { error: "Unable to save. Try again." } });
            }
            mutations++;
            const body = request.postDataJSON();
            if (url.pathname.endsWith("/read-all") || body.action === "read")
              item.readAt = new Date().toISOString();
            else if (body.action === "unread") item.readAt = null;
            else if (body.action === "dismiss") item.dismissedAt = new Date().toISOString();
            else if (body.action === "undo") item.dismissedAt = null;
            else if (url.pathname.endsWith("/snooze"))
              item.snoozedUntil = new Date(Date.now() + 3600000).toISOString();
            item.revision++;
            return route.fulfill({ json: { ok: true } });
          }
          const unread = !item.readAt && !item.dismissedAt && !item.snoozedUntil ? 1 : 0;
          if (url.pathname.endsWith("/count")) return route.fulfill({ json: { unread } });
          if (url.pathname.endsWith(id)) return route.fulfill({ json: item });
          const view = url.searchParams.get("view") || "active";
          const eligible =
            view === "history"
              ? !!item.dismissedAt
              : view === "snoozed"
                ? !!item.snoozedUntil
                : !item.dismissedAt && !item.snoozedUntil && (view !== "unread" || !item.readAt);
          return route.fulfill({
            json: {
              items: eligible ? [item] : [],
              unread,
              cutoff: new Date().toISOString(),
              nextCursor: null,
            },
          });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(45000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/notifications`);
        await page.getByRole("heading", { name: "Call the supplier" }).waitFor();
        const bell = page
          .getByRole("button", { name: "Notifications, 1 unread", exact: true })
          .filter({ visible: true });
        await bell.click();
        await page.getByRole("region", { name: "Recent notifications" }).waitFor();
        assert.equal(mutations, 0, "opening preview does not mark anything read");
        const bounds = await page
          .getByRole("region", { name: "Recent notifications" })
          .boundingBox();
        assert.ok(
          bounds.x >= 0 && bounds.x + bounds.width <= viewport.width,
          "preview fits viewport",
        );
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Mark read", exact: true }).click();
        await page.getByRole("button", { name: "Mark unread", exact: true }).waitFor();
        await page.getByRole("button", { name: "Mark unread", exact: true }).click();
        await page.getByRole("button", { name: "Mark read", exact: true }).waitFor();
        fail = true;
        await page.getByRole("button", { name: "Dismiss", exact: true }).click();
        await page
          .getByRole("alert")
          .getByText("Unable to save. Try again.", { exact: false })
          .waitFor();
        await page.getByRole("button", { name: "Dismiss", exact: true }).click();
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        await page.getByRole("heading", { name: "Call the supplier" }).waitFor();
        await page.getByRole("button", { name: "Remind me later", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Remind me later", exact: true });
        await dialog.waitFor();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Remind me later", exact: true }).click();
        await dialog.getByRole("button", { name: "In one hour", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "snoozed", exact: true }).click();
        await page.getByRole("heading", { name: "Call the supplier" }).waitFor();
        await page.getByText("Remind me", { exact: false }).first().waitFor();
        await page.getByText("Push delivery details", { exact: true }).click();
        await page.getByText("Accepted by push service on Phone", { exact: false }).waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.goto(
          `${base}/notifications/open?target=${encodeURIComponent(`/notifications/${id}`)}`,
        );
        await page.waitForURL("**/settings/notifications");
        assert.ok(item.readAt, "push opening explicitly marks one item read");
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
