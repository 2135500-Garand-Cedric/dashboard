import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import ts from "typescript";

test("reconciliation review, split allocations, rejects, corrections, retries, duplicates and audit work on desktop and phone", { skip: process.env.RUN_FINANCE_RECONCILIATION_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require("playwright"), base = process.env.FINANCE_RECONCILIATION_BROWSER_BASE_URL || "http://localhost:3000";
  require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  function load(file, deps = {}) {
    const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
    const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
  }
  const validation = load("../src/lib/finance/validation.ts"), transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const rules = load("../src/lib/finance/reconciliation.ts", { "./validation": validation, "./transactions": transactions });
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const accounts = [{ id: 1, name: "Chequing", currency: "CAD", type: "CHEQUING", active: true }, { id: 2, name: "Cash", currency: "CAD", type: "CASH", active: true }];
  const record = (kind, id, label, amount, patch = {}) => ({ kind, id, label, amount: Number(amount).toFixed(4), signedAmount: `-${Number(amount).toFixed(4)}`, allocated: "0.0000", remaining: Number(amount).toFixed(4), currency: "CAD", accountId: 1, account: "Chequing", date: "2026-11-06", version: "v1", type: "EXPENSE", href: "/finance/transactions/1", ...patch });
  const sources = [record("RECEIPT", 1, "Store receipt split payment", "100", { href: "/finance/receipts/1" }), record("DUPLICATE", 10, "Manual restaurant", "25"), record("REFUND", 30, "Partial refund", "10", { type: "REFUND", signedAmount: "10.0000" }), record("INCOME", 50, "Employer net pay", "1500", { type: "INCOME", signedAmount: "1500.0000", href: "/finance/income/50" })];
  const targets = [record("RECEIPT", 101, "Store debit purchase", "60"), record("RECEIPT", 102, "Store cash purchase", "40", { accountId: 2, account: "Cash" }), record("RECEIPT", 103, "Other identical store purchase", "60"), record("DUPLICATE", 20, "Restaurant statement posting", "25"), record("REFUND", 40, "Original purchase", "100"), record("INCOME", 60, "Payroll bank deposit", "1500", { type: "INCOME", signedAmount: "1500.0000" })];
  const pairs = new Map(), events = [], requests = []; let failNext = false, version = 1;
  const sourceLinks = source => [...pairs.values()].filter(link => link.kind === source.kind && link.sourceId === source.id);
  const summary = source => {
    const allocated = sourceLinks(source).filter(link => link.status === "CONFIRMED").reduce((total, link) => total + Number(link.amount), 0);
    return { ...source, allocated: allocated.toFixed(4), remaining: (Number(source.amount) - allocated).toFixed(4) };
  };
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    // Browser writes use fixtures only. Real Decimal allocation/accounting behavior is covered by the DB tests.
    await context.route(`${base}/api/finance/**`, async route => {
      const request = route.request(), url = new URL(request.url()), respond = (json, status = 200) => route.fulfill({ json, status });
      if (url.pathname.endsWith("/accounts")) return respond({ accounts });
      if (request.method() === "POST") {
        const body = rules.matchInput(request.postDataJSON()); requests.push(body);
        if (failNext) { failNext = false; return respond({ error: "Decision could not be saved. Retry this decision." }, 503); }
        const source = sources.find(row => row.id === body.sourceId && row.kind === body.kind), target = targets.find(row => row.id === body.transactionId);
        if (body.action === "CONFIRM" && source.accountId !== target.accountId && !body.acknowledgeAccountDifference) return respond({ error: "Confirm the different account for this split payment or deposit." }, 400);
        const key = `${source.kind}:${source.id}:${target.id}`, current = pairs.get(key);
        const link = { id: current?.id ?? pairs.size + 1, revision: (current?.revision ?? 0) + 1, kind: source.kind, sourceId: source.id, transactionId: target.id, sourceLabel: source.label, targetLabel: target.label, amount: body.amount, currency: "CAD", status: body.action === "CONFIRM" ? "CONFIRMED" : body.action === "REJECT" ? "REJECTED" : "UNLINKED", note: body.note, updatedAt: new Date().toISOString() };
        events.unshift({ id: events.length + 1, action: current?.status === "CONFIRMED" && body.action === "CONFIRM" ? "CORRECT" : body.action, createdAt: link.updatedAt, details: { ...body, source: { label: source.label } } });
        pairs.set(key, link); source.version = `v${++version}`; target.version = `v${++version}`;
        return respond({ replayed: false });
      }
      const selected = url.pathname.match(/\/reconciliation\/(\w+)\/(\d+)$/);
      if (selected) {
        const source = summary(sources.find(row => row.kind === selected[1] && row.id === Number(selected[2]))), links = sourceLinks(source), search = url.searchParams.get("search"), showRejected = url.searchParams.get("rejected") === "true";
        const candidates = targets.filter(target => target.kind === source.kind && (!search || String(target.id) === search || target.label.toLowerCase().includes(search.toLowerCase()))).flatMap(target => {
          const link = links.find(link => link.transactionId === target.id);
          if (link?.status === "REJECTED" && !showRejected) return [];
          return [{ transaction: target, score: 75, reasons: ["Same currency", "0 days apart", "Description similarity 50%"], amount: Math.min(Number(source.remaining), Number(target.amount)).toFixed(4), warning: source.accountId !== target.accountId ? "Different payment account: explicitly confirm this split payment." : null, link: link ?? null }];
        });
        return respond({ source, links, related: [], candidates });
      }
      const view = url.searchParams.get("view") ?? "RECEIPT";
      if (view === "AUDIT") return respond({ records: [], events, total: events.length, pageSize: 20 });
      const records = view === "TRANSACTIONS" ? [targets[0]] : sources.filter(source => source.kind === view).map(summary).filter(source => url.searchParams.get("status") !== "unmatched" || Number(source.remaining) > 0);
      return respond({ records, events: [], total: records.length, pageSize: 20 });
    });
    await context.route(`${base}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
    const visible = locator => locator.waitFor({ state: "visible", timeout: 30000 });
    const candidate = id => page.getByRole("article", { name: `Match transaction ${id}`, exact: true });
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Horizontal overflow at ${(await page.viewportSize()).width}px`);
    async function save(id, action) { await candidate(id).getByRole("button", { name: action, exact: true }).click(); await candidate(id).getByRole("button", { name: "Save decision", exact: true }).click(); }
    await page.goto(`${base}/finance/reconciliation`);
    await visible(page.getByRole("heading", { name: "Financial reconciliation", exact: true }));
    await page.getByRole("button", { name: "Review matches", exact: true }).click();
    await visible(candidate(101)); assert.equal(events.length, 0);
    await save(103, "Reject suggestion"); await candidate(103).waitFor({ state: "detached" });
    failNext = true; await save(101, "Confirm match");
    await visible(page.getByText("Decision could not be saved. Retry this decision.", { exact: true }).first());
    await save(101, "Confirm match");
    await visible(candidate(101).getByText("Confirmed", { exact: true })); assert.equal(requests.at(-1).requestKey, requests.at(-2).requestKey);
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow();
    await save(102, "Confirm match");
    await visible(page.getByText("Confirm the different account for this split payment or deposit.", { exact: true }).first());
    await candidate(102).getByLabel("Confirm different account for transaction 102").check();
    await candidate(102).getByLabel("Decision note for transaction 102").fill("Phone split payment");
    await save(102, "Confirm match"); await visible(candidate(102).getByText("Confirmed", { exact: true }));
    assert.equal(summary(sources[0]).remaining, "0.0000");
    await page.setViewportSize({ width: 320, height: 844 }); await noOverflow();
    await candidate(101).getByLabel("Allocation amount for transaction 101").fill("50");
    await save(101, "Save allocation correction");
    await page.getByText("10.0000 CAD", { exact: true }).first().waitFor(); assert.equal(summary(sources[0]).remaining, "10.0000");
    await save(101, "Unlink match");
    await visible(candidate(101).getByRole("button", { name: "Confirm match", exact: true })); assert.equal(summary(sources[0]).remaining, "60.0000");
    await page.getByLabel("Show rejected suggestions").check(); await visible(candidate(103));
    await page.getByRole("button", { name: "Manual / statement duplicates", exact: true }).click();
    await page.getByRole("button", { name: "Review matches", exact: true }).click();
    await visible(candidate(20)); await save(20, "Confirm match"); await visible(candidate(20).getByText("Confirmed", { exact: true }));
    assert.equal(summary(sources[1]).remaining, "0.0000"); await noOverflow();
    await save(20, "Unlink match"); await visible(candidate(20).getByRole("button", { name: "Confirm match", exact: true }));
    await page.getByRole("button", { name: "Refunds", exact: true }).click(); await page.getByRole("button", { name: "Review matches", exact: true }).click();
    await save(40, "Confirm match"); await visible(candidate(40).getByText("Confirmed", { exact: true }));
    await page.getByRole("button", { name: "Income deposits", exact: true }).click(); await page.getByRole("button", { name: "Review matches", exact: true }).click();
    await save(60, "Confirm match"); await visible(candidate(60).getByText("Confirmed", { exact: true }));
    await page.getByRole("button", { name: "Decision history", exact: true }).click();
    await visible(page.getByText("Phone split payment", { exact: true })); assert.ok(events.some(event => event.action === "CORRECT"));
    await noOverflow();
    await page.getByRole("button", { name: "Transactions without support", exact: true }).click();
    await page.getByRole("button", { name: "Find supporting record", exact: true }).click();
    await visible(page.getByText(/Select a receipt to review against transaction #101/));
    await page.getByRole("button", { name: "Review matches", exact: true }).click();
    await visible(candidate(101)); assert.equal(await candidate(102).count(), 0); await noOverflow();
    if (process.env.FINANCE_RECONCILIATION_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.FINANCE_RECONCILIATION_BROWSER_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []); await context.close();
  } finally { await browser.close(); }
});
