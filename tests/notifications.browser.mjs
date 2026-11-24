import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { encode } from "next-auth/jwt";
import * as webpush from "web-push";

test(
  "PWA assets and notification permission/registration/preferences/test/disable flow work on desktop and phone layouts",
  { skip: process.env.RUN_NOTIFICATION_BROWSER_TEST !== "1", timeout: 180000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const key = webpush.generateVAPIDKeys().publicKey;
    const endpoint = "https://web.push.apple.com/mock-browser-test";
    const hash = createHash("sha256").update(endpoint).digest("hex");
    try {
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        let testCalls = 0,
          registerCalls = 0;
        const model = {
          configured: true,
          publicKey: key,
          settings: {
            enabled: true,
            events: true,
            sessions: true,
            deadlines: true,
            followUps: true,
            milestones: false,
            weeklyReports: true,
            showDetails: true,
            leadMinutes: 15,
            dateOnlyTime: "09:00",
          },
          worker: { lastSeenAt: new Date().toISOString(), errorCode: null },
          devices: [],
        };
        await context.addInitScript(
          ({ endpoint, key }) => {
            let subscription = null;
            window.__permissionCalls = 0;
            const permission = { value: "default" };
            Object.defineProperty(window, "Notification", {
              configurable: true,
              value: class {
                static get permission() {
                  return permission.value;
                }
                static async requestPermission() {
                  window.__permissionCalls++;
                  permission.value = "granted";
                  return "granted";
                }
              },
            });
            Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
            const registration = {
              active: {},
              pushManager: {
                getSubscription: async () => subscription,
                subscribe: async (options) => {
                  if (!options.userVisibleOnly) throw new Error("Visible notifications required");
                  subscription = {
                    endpoint,
                    options,
                    toJSON: () => ({ endpoint, keys: { p256dh: key, auth: "mock-auth" } }),
                    unsubscribe: async () => {
                      subscription = null;
                      return true;
                    },
                  };
                  return subscription;
                },
              },
            };
            Object.defineProperty(navigator, "serviceWorker", {
              configurable: true,
              value: {
                register: async () => registration,
                getRegistration: async () => registration,
                ready: Promise.resolve(registration),
              },
            });
          },
          { endpoint, key },
        );
        await context.route("**/api/notifications**", async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (url.pathname.endsWith("/inbox/count")) return route.fulfill({ json: { unread: 0 } });
          if (url.pathname.endsWith("/subscriptions")) {
            if (request.method() === "POST") {
              registerCalls++;
              model.devices = [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  endpointHash: hash,
                  label: request.postDataJSON().label,
                  keyChanged: false,
                  lastSuccessAt: null,
                },
              ];
            } else model.devices = [];
            return route.fulfill({ json: { success: true } });
          }
          if (url.pathname.endsWith("/test")) {
            testCalls++;
            return route.fulfill({ json: { success: true } });
          }
          if (request.method() === "PATCH") Object.assign(model.settings, request.postDataJSON());
          return route.fulfill({ json: model });
        });
        await context.route("**/api/youtube**", (route) => route.fulfill({ json: { items: [] } }));
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/settings/notifications`);
        const section = page.getByRole("region", { name: "Phone and notifications" });
        await section.getByRole("button", { name: "Enable on this device" }).waitFor();
        assert.equal(
          await page.evaluate(() => window.__permissionCalls),
          0,
          "permission must never be requested automatically",
        );
        await section.getByLabel("Device name", { exact: true }).fill("Test phone");
        await section.getByRole("button", { name: "Enable on this device" }).click();
        await section.getByText("Notifications enabled on this device.", { exact: true }).waitFor();
        assert.equal(registerCalls, 1);
        assert.equal(await page.evaluate(() => window.__permissionCalls), 1);
        await section.getByRole("button", { name: "Send test notification" }).click();
        await section
          .getByText("Test notification accepted by the push service. Check this device.", {
            exact: true,
          })
          .waitFor();
        assert.equal(testCalls, 1);
        await section.getByLabel("Default reminder for timed items").selectOption("60");
        await section.getByLabel("Time for date-only items").fill("08:30");
        await section.getByRole("button", { name: "Save notification preferences" }).click();
        await section.getByText("Notification preferences saved.", { exact: true }).waitFor();
        assert.equal(model.settings.leadMinutes, 60);
        assert.equal(model.settings.dateOnlyTime, "08:30");
        page.once("dialog", (dialog) => dialog.accept());
        await section.getByRole("button", { name: "Disable device" }).click();
        await section.getByText("No devices enabled yet.", { exact: true }).waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        const manifest = await context.request.get(`${base}/manifest.webmanifest`);
        assert.equal(manifest.status(), 200);
        assert.equal((await manifest.json()).display, "standalone");
        const sw = await context.request.get(`${base}/sw.js`);
        assert.equal(sw.status(), 200);
        assert.match(sw.headers()["cache-control"], /no-store/);
        assert.equal(sw.headers()["service-worker-allowed"], "/");
        assert.equal((await context.request.get(`${base}/icons/dashboard-180.png`)).status(), 200);
        assert.deepEqual(errors, []);
        await context.close();
      }
      const ios = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 390, height: 844 },
      });
      await ios.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      const iosPage = await ios.newPage();
      await iosPage.goto(`${base}/settings/notifications`);
      await iosPage
        .getByText("Open the installed Home Screen app to enable iPhone notifications.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await iosPage.getByRole("button", { name: "Enable on this device" }).isDisabled(),
        true,
      );
      await ios.close();
      const anonymous = await browser.newContext();
      assert.equal(
        (
          await anonymous.request.post(`${base}/api/notifications/test`, {
            data: { id: "11111111-1111-4111-8111-111111111111" },
          })
        ).status(),
        401,
      );
      const redirect = await anonymous.request.get(
        `${base}/notifications/open?target=https%3A%2F%2Fevil.example`,
        { maxRedirects: 0 },
      );
      assert.equal(redirect.status(), 307);
      assert.ok(
        redirect
          .headers()
          .location.includes("callbackUrl=%2Fnotifications%2Fopen%3Ftarget%3D%252Fsettings"),
      );
      await anonymous.close();
    } finally {
      await browser.close();
    }
  },
);
