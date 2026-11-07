import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import sharp from "sharp";
test("finance exports, retained search, error recovery and phone capture/entry work without financial writes", { skip: process.env.RUN_FINANCE_USABILITY_BROWSER_TEST !== "1", timeout: 180000 }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require("playwright"), base = process.env.FINANCE_USABILITY_BROWSER_BASE_URL || "http://localhost:3000";
  require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", acceptDownloads: true });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route(`${base}/api/youtube**`, route => route.fulfill({ json: { items: [] } })); await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
    const visible = locator => locator.waitFor({ state: "visible", timeout: 30000 });
    const settled = async () => { await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /^Loading/.test(node.textContent))); };
    const noOverflow = () => page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
    await page.goto(`${base}/finance/transactions?search=Grocery`); await visible(page.getByLabel("Search transactions")); await settled(); assert.equal(await page.getByLabel("Search transactions").inputValue(), "Grocery");
    await page.getByLabel("Search transactions").fill("[Example]"); await page.getByRole("button", { name: "Apply filters", exact: true }).click(); await settled(); assert.equal(new URL(page.url()).searchParams.get("search"), "[Example]");
    await page.getByRole("link", { name: /View \/ edit|View transaction/ }).first().click(); await page.waitForURL(/\/finance\/transactions\/\d+$/); await settled(); await page.goBack(); await visible(page.getByLabel("Search transactions")); assert.equal(await page.getByLabel("Search transactions").inputValue(), "[Example]");
    const original = await context.request.get(`${base}/api/finance/exports/transactions?search=${encodeURIComponent("[Example]")}`); assert.equal(original.status(), 200); const csv = await original.text(); assert.ok(csv.includes("Counted amount")); assert.ok(csv.split("\r\n").length > 25);
    for (const [kind, searchLabel] of [["transactions", "Search transactions"], ["receipts", "Search receipts"], ["income", "Search income"]]) {
      await page.goto(`${base}/finance/${kind}?search=${encodeURIComponent("[Example]")}`); await visible(page.getByLabel(searchLabel)); await settled(); await noOverflow();
      const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV", exact: true }).click(); const download = await pending; assert.equal(download.suggestedFilename(), `finance-${kind}.csv`); assert.equal(await download.failure(), null);
    }
    let fail = true; await page.route("**/api/finance/exports/income?**", route => { if (fail) { fail = false; return route.fulfill({ status: 413, json: { error: "Narrow the date range for this export." } }); } return route.continue(); });
    await page.getByRole("button", { name: "Export CSV", exact: true }).click(); await visible(page.getByText("Narrow the date range for this export.", { exact: true }));
    const retry = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV", exact: true }).click(); assert.equal(await (await retry).failure(), null);
    await page.goto(`${base}/finance/receipts/new`); await visible(page.getByLabel("Take receipt photo", { exact: true })); await settled(); assert.equal(await page.getByLabel("Take receipt photo", { exact: true }).getAttribute("capture"), "environment");
    await page.getByLabel("Choose receipt file", { exact: true }).setInputFiles({ name: "camera.heic", mimeType: "image/heic", buffer: Buffer.from("invalid") }); await visible(page.getByText(/Export HEIC photos as JPEG\./, { exact: false }).last());
    const png = await sharp({ create: { width: 400, height: 1000, channels: 3, background: "white" } }).png().toBuffer();
    await page.getByLabel("Take receipt photo", { exact: true }).setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: png }); await visible(page.getByAltText("Receipt preview"));
    assert.ok((await page.getByAltText("Receipt preview").boundingBox()).height <= 844 * .4 + 1);
    for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(); }
    await page.goto(`${base}/finance/transactions/new`); await visible(page.getByRole("button", { name: "Save transaction", exact: true })); await settled();
    await page.setViewportSize({ width: 320, height: 844 }); await noOverflow();
    assert.ok(Number.parseFloat(await page.getByLabel("Description", { exact: true }).evaluate(node => getComputedStyle(node).fontSize)) >= 16);
    assert.ok((await page.getByRole("button", { name: "Save transaction", exact: true }).boundingBox()).height >= 44);
    await page.getByLabel("Description", { exact: true }).fill("Unsaved phone test"); await page.getByLabel("Transaction type", { exact: true }).selectOption("TRANSFER"); await visible(page.getByLabel("To account", { exact: true })); await noOverflow();
    const anonymous = await browser.newContext(); assert.equal((await anonymous.request.get(`${base}/api/finance/exports/transactions`)).status(), 401); await anonymous.close();
    assert.deepEqual(errors, []); await context.close();
  } finally { await browser.close(); }
});
