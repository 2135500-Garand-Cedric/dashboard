import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

// Read-only live checks: requires the development example dataset. No financial writes.
test("live finance reports, filters, charts, examples, private previews and phone layouts", { skip: process.env.RUN_FINANCE_REPORT_BROWSER_TEST !== "1", timeout: 240000 }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require("playwright"), base = process.env.FINANCE_REPORT_BROWSER_BASE_URL || "http://localhost:3000";
  require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route(`${base}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const get = async route => { const response = await context.request.get(base + route); assert.equal(response.status(), 200, route); assert.match(response.headers()["cache-control"], /no-store/); return response.json(); };
    const initial = await get("/api/finance/reports"); assert.ok(initial.coverage.hasExamples, "Run seed:finance-examples in development first"); assert.ok(initial.totals.count > 0);
    const { accounts } = await get("/api/finance/accounts"), { categories } = await get("/api/finance/categories");
    const bank = accounts.find(row => row.name.startsWith("[Example]") && row.type === "CHEQUING"), food = categories.find(row => row.name === "[Example] Groceries"); assert.ok(bank && food);
    const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
    const visible = locator => locator.waitFor({ state: "visible", timeout: 30000 });
    const noOverflow = async () => { await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth + 1, null, { timeout: 5000 }).catch(async () => { const oversized = await page.evaluate(() => [...document.querySelectorAll("main *")].filter(node => node.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(node => ({ tag: node.tagName, class: node.getAttribute("class"), width: node.getBoundingClientRect().width }))); assert.fail(`Horizontal overflow at ${page.viewportSize().width}px: ${JSON.stringify(oversized)}`); }); };
    const money = (value, currency) => { const negative = value.startsWith("-"), [whole, decimal = ""] = (negative ? value.slice(1) : value).split("."); return `${negative ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal.padEnd(2, "0").replace(/0+$/, "").padEnd(2, "0")} ${currency}`; };
    const checkReport = async report => {
      await visible(page.locator("[data-finance-report]"));
      for (const [title, key] of [["Income deposits", "income"], ["Net expenses", "expenses"], ["Net cash flow", "net"]]) assert.equal(await page.locator(`[data-total="${title}"]`).innerText(), money(report.totals[key], report.filters.currency));
      await noOverflow();
    };
    const change = async action => { const response = page.waitForResponse(response => response.url().includes("/api/finance/reports?") && response.status() === 200); await action(); const report = await (await response).json(); await checkReport(report); return report; };
    await page.goto(`${base}/finance`); await visible(page.getByRole("heading", { name: "Financial overview", exact: true })); await checkReport(initial);
    for (const width of [1920, 1440, 390, 320]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const title of ["Income versus expenses", "Spending by category", "Spending by merchant", "Spending by account", "Income deposits by source"]) await visible(page.getByRole("heading", { name: title, exact: true }));
    const firstChart = page.getByRole("img", { name: /^Income versus expenses,/ }); await firstChart.scrollIntoViewIfNeeded();
    const bounds = await firstChart.boundingBox(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const tooltip = page.locator(".recharts-tooltip-wrapper").filter({ has: page.getByText(/^Net cash flow:/) }).first();
    await visible(tooltip); assert.equal(await tooltip.locator("p").first().evaluate(node => getComputedStyle(node).color), "rgb(255, 255, 255)");
    await page.getByText("View exact amounts", { exact: true }).first().click(); await visible(page.getByRole("columnheader", { name: "Period", exact: true }).first());
    const year = await change(() => page.getByRole("button", { name: "Year", exact: true }).click()); assert.equal(year.interval, "month"); assert.equal(year.timeline.length, 12);
    await change(() => page.getByRole("button", { name: "Custom range", exact: true }).click());
    await page.getByLabel("Report from date").fill(`${initial.filters.from.slice(0, 4)}-01-01`); await page.getByLabel("Report to date").fill(initial.filters.to);
    await page.getByLabel("Report account", { exact: true }).selectOption(String(bank.id)); await page.getByLabel("Report category", { exact: true }).selectOption(String(food.id));
    const filtered = await change(() => page.getByRole("button", { name: "Apply filters", exact: true }).click()); assert.equal(filtered.filters.accountId, bank.id); assert.equal(filtered.filters.categoryId, food.id); assert.equal(filtered.totals.income, "0.0000"); assert.ok(filtered.spendingByCategory.every(row => row.key === String(food.id)));
    await page.getByLabel("Report category", { exact: true }).selectOption(""); await page.getByLabel("Report currency", { exact: true }).selectOption("USD");
    const usd = await change(() => page.getByRole("button", { name: "Apply filters", exact: true }).click()); assert.equal(usd.filters.currency, "USD"); assert.equal(usd.filters.accountId, null);
    await page.getByLabel("Report data", { exact: true }).selectOption("personal");
    const personal = await change(() => page.getByRole("button", { name: "Apply filters", exact: true }).click()); assert.equal(personal.coverage.examplesIncluded, false); assert.equal(await page.getByText(/^Example data is included/).count(), 0);
    await page.getByLabel("Report from date").fill("1900-01-01"); await page.getByLabel("Report to date").fill("1900-01-02");
    const empty = await change(() => page.getByRole("button", { name: "Apply filters", exact: true }).click()); assert.equal(empty.totals.count, 0); await visible(page.getByText("No transactions in this selection.", { exact: true }));
    let failNext = true; await page.route("**/api/finance/reports?**", async route => { if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: "Reporting is temporarily unavailable. Please retry." } }); } return route.continue(); });
    await page.getByRole("button", { name: "Apply filters", exact: true }).click(); await visible(page.getByRole("alert").filter({ hasText: /\S/ })); await change(() => page.getByRole("button", { name: "Retry", exact: true }).click());
    await page.unroute("**/api/finance/reports?**");
    for (const [route, heading] of [["accounts", "Financial accounts"], ["categories", "Income & expense categories"], ["transactions", "Transaction history"], ["receipts", "Receipt history"], ["income", "Income history"], ["imports", "Statement imports"], ["reconciliation", "Financial reconciliation"]]) {
      await page.goto(`${base}/finance/${route}`); await visible(page.getByRole("heading", { name: heading, exact: true }));
      await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /^Loading/.test(node.textContent))); assert.equal(await page.getByRole("alert").filter({ hasText: /\S/ }).count(), 0, route);
      await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(); await page.setViewportSize({ width: 1440, height: 1000 });
    }
    const receipts = await get("/api/finance/receipts"), income = await get("/api/finance/income"), imports = await get("/api/finance/imports");
    const previewCases = [
      ["receipts", receipts.receipts.find(row => row.document?.mimeType === "image/png")],
      ["receipts", receipts.receipts.find(row => row.document?.mimeType === "application/pdf")],
      ["income", income.records.find(row => row.document?.mimeType === "application/pdf")],
    ];
    for (const [kind, sample] of previewCases) {
      assert.ok(sample, `Example ${kind} private document`);
      await page.goto(`${base}/finance/${kind}/${sample.id}`); await visible(page.getByRole("heading", { name: kind === "receipts" ? "Receipt details" : "Income details", exact: true }));
      await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /^Loading/.test(node.textContent)));
      if (sample.document.mimeType === "application/pdf") { await visible(page.locator('canvas[role="img"]')); await page.getByText("Loading PDF preview…", { exact: true }).waitFor({ state: "detached" }); }
      else await page.waitForFunction(() => [...document.querySelectorAll('img[alt$="preview"]')].some(image => image.complete && image.naturalWidth > 0));
      assert.equal(await page.getByRole("alert").filter({ hasText: /\S/ }).count(), 0);
      const original = await context.request.get(`${base}/api/finance/${kind}/${sample.id}/document`); assert.equal(original.status(), 200); assert.ok((await original.body()).length > 100); assert.match(original.headers()["cache-control"], /no-store/);
    }
    const exampleImports = imports.batches.filter(row => row.originalName?.startsWith("[Example]"));
    assert.ok(exampleImports.some(row => row.status === "DRAFT") && exampleImports.some(row => row.status === "COMPLETED"));
    for (const batch of exampleImports) {
      const detail = await get(`/api/finance/imports/${batch.id}`); assert.ok(detail);
      await page.goto(`${base}/finance/imports/${batch.id}`); await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(node => /^Loading/.test(node.textContent))); assert.equal(await page.getByRole("alert").filter({ hasText: /\S/ }).count(), 0);
      const original = await context.request.get(`${base}/api/finance/imports/${batch.id}/document`); assert.equal(original.status(), 200); assert.match(original.headers()["content-disposition"], /attachment/); assert.ok((await original.body()).length > 100);
    }
    await page.goto(`${base}/finance`); await visible(page.locator("[data-finance-report]")); await page.setViewportSize({ width: 1440, height: 1000 });
    if (process.env.FINANCE_REPORT_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.FINANCE_REPORT_BROWSER_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []); await context.close();
  } finally { await browser.close(); }
});
