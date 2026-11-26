import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

test(
  "reimbursement tracking, combined payments, edits and unlinking work on desktop and phone",
  {
    skip: process.env.RUN_REIMBURSEMENTS_BROWSER_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    const require = createRequire(import.meta.url);
    require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, {
      info() {

      },
      error() {

      },
    });
    const { chromium } = require("playwright");
    const base = "http://localhost:3000";
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        await context.route("https://www.youtube.com/**", (route) => route.abort());
        const account = { id: 1, name: "Bank", type: "CHEQUING", currency: "CAD", active: true };
        const directory = [
          {
            id: 11,
            name: "Dad",
            company: null,
            email: null,
            phone: null,
            notes: null,
            active: true,
            revision: 1,
          },
          {
            id: 12,
            name: "Mom",
            company: null,
            email: null,
            phone: null,
            notes: null,
            active: true,
            revision: 1,
          },
        ];
        await context.route(`${base}/api/work-contacts**`, async (route) => {
          const req = route.request();
          const url = new URL(req.url());
          if (req.method() === "POST") {
            const person = {
              ...req.postDataJSON(),
              id: directory.length + 11,
              active: true,
              revision: 1,
            };
            directory.push(person);
            return route.fulfill({ json: person });
          }
          if (req.method() === "PATCH") {
            const person = directory.find(
              (person) => person.id === Number(url.pathname.split("/").pop()),
            );
            assert.equal(req.headers()["if-match"], `"${person.revision}"`);
            Object.assign(person, req.postDataJSON(), { revision: person.revision + 1 });
            return route.fulfill({ json: person });
          }
          const q = (url.searchParams.get("q") ?? "").toLowerCase();
          const items = directory.filter((person) => !q || person.name.toLowerCase().includes(q));
          return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 30 } });
        });
        const plans = new Map();
        const links = [];
        let failPlanSave = false;
        let savedCurrency = null;
        let revision = 0;
        const version = () => new Date(Date.UTC(2026, 10, 24, 12, 0, ++revision)).toISOString();
        const transaction = (id) => ({
          id,
          account,
          type: id === 5 ? "INCOME" : id === 4 ? "REFUND" : "EXPENSE",
          amount: id === 4 ? "2500.0000" : "-1000.0000",
          ledgerAmount: id === 4 ? "2500.0000" : "-1000.0000",
          currency: "CAD",
          excludedAmount: "0.0000",
          source: "MANUAL",
          description: id === 4 ? "Dad — combined payment" : `Rent ${id}`,
          date: "2026-11-24",
          category: { id: 1, name: "Rent", type: "EXPENSE", active: true },
          incomeRecords: [],
          receipts: [],
          notes: null,
          transfer: null,
          counterparty: null,
          statementMatches:
            id === 4
              ? [{ id: 77, accountId: 1, name: "Bank statement", from: null, to: null }]
              : [],
          editable: id !== 4,
          updatedAt: "2026-11-24T12:00:00.000Z",
        });
        const details = (id) => {
          const related = links.filter((link) => id === 4 || link.expenseId === id);
          const received = related.reduce((sum, link) => sum + Number(link.amount), 0);
          const expensePlans = [...plans.values()].filter((plan) => plan.expenseId === id);
          const expected = expensePlans.reduce((sum, plan) => sum + Number(plan.amount), 0);
          const status = (expected, received) =>
            received === 0 ? "AWAITING" : received < expected ? "PARTIAL" : "COMPLETE";
          return {
            transactionId: id,
            type: id === 4 ? "REFUND" : "EXPENSE",
            currency: "CAD",
            amount: id === 4 ? "2500.0000" : "1000.0000",
            available: ((id === 4 ? 2500 : 1000) - received).toFixed(4),
            summary: expensePlans.length
              ? {
                  person: expensePlans.map((plan) => plan.person).join(", "),
                  expected: expected.toFixed(4),
                  received: received.toFixed(4),
                  remaining: (expected - received).toFixed(4),
                  personalCost: (1000 - received).toFixed(4),
                  status: status(expected, received),
                }
              : null,
            plans: expensePlans.map((plan) => {
              const received = links
                .filter((link) => link.planId === plan.id)
                .reduce((sum, link) => sum + Number(link.amount), 0);
              return {
                id: plan.id,
                contactId: plan.contactId,
                person: plan.person,
                expected: plan.amount,
                received: received.toFixed(4),
                remaining: (Number(plan.amount) - received).toFixed(4),
                updatedAt: plan.updatedAt,
                status: status(Number(plan.amount), received),
              };
            }),
            planUpdatedAt: expensePlans.length === 1 ? expensePlans[0].updatedAt : null,
            links: related.map((link) => ({
              ...link,
              person: plans.get(link.planId).person,
              description: id === 4 ? `Rent ${link.expenseId}` : "Dad — combined payment",
              date: "2026-11-24",
            })),
            candidates: [...plans.values()]
              .filter((plan) => !links.some((link) => link.planId === plan.id))
              .map((plan) => ({
                id: plan.expenseId,
                planId: plan.id,
                description: `Rent ${plan.expenseId}`,
                person: plan.person,
                date: "2026-11-24",
                remaining: plan.amount,
                account: "Bank",
              })),
          };
        };
        await context.route(`${base}/api/finance/**`, async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          const path = url.pathname;
          const match = path.match(/\/activities\/(\d+)\/reimbursements$/);
          if (match) {
            const id = Number(match[1]);
            if (request.method() === "PUT") {
              const input = request.postDataJSON();
              if (failPlanSave)
                return route.fulfill({
                  status: 400,
                  json: { error: "Example reimbursement error." },
                });
              const planId = input.planId ?? revision + 1;
              if (input.remove) plans.delete(planId);
              else
                plans.set(planId, {
                  ...input,
                  person: directory.find((person) => person.id === input.contactId).name,
                  id: planId,
                  expenseId: id,
                  updatedAt: version(),
                });
            } else if (request.method() === "POST") {
              const input = request.postDataJSON();
              const existing = links.find((link) => link.planId === input.planId);
              if (existing) Object.assign(existing, { amount: input.amount, updatedAt: version() });
              else
                links.push({
                  id: revision + 1,
                  expenseId: input.expenseId,
                  planId: input.planId,
                  paymentId: id,
                  amount: input.amount,
                  updatedAt: version(),
                });
            } else if (request.method() === "DELETE") {
              links.splice(
                links.findIndex((link) => link.id === Number(url.searchParams.get("link"))),
                1,
              );
            }
            return route.fulfill({
              json: request.method() === "GET" ? details(id) : { success: true },
            });
          }
          if (
            request.method() !== "GET" &&
            ["/api/finance/expenses", "/api/finance/income"].includes(path)
          ) {
            const capture = request.postData().match(/name="details"\r\n\r\n([^\r]+)/);
            savedCurrency = JSON.parse(capture[1]).currency;
            return route.fulfill({ status: 400, json: { error: "Example currency response." } });
          }
          assert.equal(
            request.method(),
            "GET",
            "browser fixtures never write real finance records",
          );
          const data = path.endsWith("/accounts")
            ? { accounts: [account, { ...account, id: 2, name: "USD bank", currency: "USD" }] }
            : path.endsWith("/categories")
              ? { categories: [{ id: 1, name: "Rent", type: "EXPENSE", active: true }] }
              : path.endsWith("/income-sources")
                ? { sources: [{ id: 1, name: "Employer", kind: "EMPLOYMENT", active: true }] }
                : path.endsWith("/deduction-types")
                  ? { types: [] }
                  : path.match(/\/transactions\/\d+$/)
                    ? { transaction: transaction(Number(path.split("/").pop())) }
                    : {};
          await route.fulfill({ json: data });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${base}/settings/people`);
        await page.getByRole("button", { name: "New person", exact: true }).click();
        await page.getByLabel("Person name", { exact: true }).fill("Friend");
        await page.getByLabel("Person company", { exact: true }).fill("Example organization");
        await page.getByLabel("Person email", { exact: true }).fill("friend@example.com");
        await page.getByLabel("Person phone", { exact: true }).fill("555-123-4567");
        await page
          .getByLabel("Person notes", { exact: true })
          .fill("Shared across tasks and finance.");
        await page.getByRole("button", { name: "Save person", exact: true }).click();
        await page.getByRole("heading", { name: "Friend", exact: true }).waitFor();
        await page.getByRole("button", { name: "Edit Friend", exact: true }).click();
        assert.equal(
          await page.getByLabel("Person email", { exact: true }).inputValue(),
          "friend@example.com",
        );
        await page.getByLabel("Person phone", { exact: true }).fill("555-765-4321");
        await page.getByRole("button", { name: "Save person", exact: true }).click();
        await page.getByText("555-765-4321", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Deactivate Friend", exact: true }).click();
        await page
          .getByRole("dialog", { name: "Deactivate person", exact: true })
          .getByRole("button", { name: "Confirm", exact: true })
          .click();
        await page.getByRole("button", { name: "Reactivate Friend", exact: true }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.goto(`${base}/finance/settings`);
        assert.equal(
          await page.getByRole("link", { name: "People", exact: true }).getAttribute("href"),
          "/settings/people",
        );
        for (const id of [1, 2, 3]) {
          await page.goto(`${base}/finance/expenses/${id}`);
          if (viewport.width >= 768)
            await page.getByRole("tab", { name: "Reimbursements", exact: true }).click();
          await page.getByRole("button", { name: "Track reimbursement", exact: true }).click();
          const personModal = page.getByRole("dialog", {
            name: "Add reimbursement person",
            exact: true,
          });
          await personModal.waitFor();
          assert.equal(
            await personModal.getByRole("link", { name: "Manage people", exact: true }).count(),
            0,
          );
          const personBounds = await personModal.boundingBox();
          assert.ok(Math.abs(personBounds.y + personBounds.height / 2 - viewport.height / 2) < 3);
          await page.mouse.click(2, 2);
          await personModal.waitFor({ state: "hidden" });
          await page.getByRole("button", { name: "Track reimbursement", exact: true }).click();
          await page.getByLabel("Reimbursement person", { exact: true }).selectOption("11");
          assert.equal(
            await page.getByLabel("Expected reimbursement", { exact: true }).inputValue(),
            "1000.00",
          );
          assert.equal(
            await page
              .getByLabel("Reimbursement person", { exact: true })
              .getByRole("option", { name: "Friend", exact: true })
              .count(),
            0,
          );
          await page.getByRole("button", { name: "Save tracking", exact: true }).click();
          await page.getByText("Awaiting reimbursement", { exact: true }).first().waitFor();
        }
        await page.goto(`${base}/finance/expenses/1`);
        await page
          .getByLabel("Description / merchant", { exact: true })
          .fill("Unsaved description");
        if (viewport.width >= 768)
          await page.getByRole("tab", { name: "Reimbursements", exact: true }).click();
        assert.equal(
          await page.getByRole("heading", { name: "Expense details", exact: true }).count(),
          1,
        );
        assert.equal(await page.getByRole("button", { name: "Reload", exact: true }).count(), 0);
        await page.getByRole("button", { name: "Edit person", exact: true }).click();
        await page.getByLabel("Expected reimbursement", { exact: true }).fill("600");
        await page.getByRole("button", { name: "Save tracking", exact: true }).click();
        await page.getByRole("button", { name: "Add person", exact: true }).click();
        await page.getByLabel("Reimbursement person", { exact: true }).selectOption("12");
        await page.getByLabel("Expected reimbursement", { exact: true }).fill("400");
        failPlanSave = true;
        await page.getByRole("button", { name: "Save tracking", exact: true }).click();
        await page.getByText("Example reimbursement error.", { exact: true }).waitFor();
        assert.equal(
          await page
            .getByRole("region", { name: "Reimbursements", exact: true })
            .getByText("Example reimbursement error.")
            .count(),
          0,
        );
        failPlanSave = false;
        await page.getByRole("button", { name: "Save tracking", exact: true }).click();
        await page.getByText("Mom", { exact: true }).waitFor();
        if (viewport.width >= 768)
          await page.getByRole("tab", { name: "Details", exact: true }).click();
        assert.equal(
          await page.getByLabel("Description / merchant", { exact: true }).inputValue(),
          "Unsaved description",
        );
        await page.getByRole("button", { name: "Delete expense", exact: true }).click();
        const deletion = page.getByRole("dialog", { name: "Delete expense", exact: true });
        await deletion.waitFor();
        const bounds = await deletion.boundingBox();
        assert.ok(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) < 3);
        await page.mouse.click(2, 2);
        await deletion.waitFor({ state: "hidden" });
        await page.getByLabel("Payment account", { exact: true }).selectOption("2");
        assert.equal(await page.getByLabel("Receipt currency").count(), 0);
        await page.getByRole("button", { name: "Save expense", exact: true }).click();
        await page.getByText("Example currency response.", { exact: true }).first().waitFor();
        assert.equal(savedCurrency, "USD");
        await page.goto(`${base}/finance/income/deposits/5`);
        await page.getByLabel("Deposit account", { exact: true }).selectOption("2");
        assert.equal(await page.getByLabel("Income currency").count(), 0);
        await page.getByLabel("Employer / income source", { exact: true }).selectOption("1");
        await page.getByLabel("Net income", { exact: true }).fill("1000");
        await page.getByRole("button", { name: "Save income record", exact: true }).click();
        await page.getByText("Example currency response.", { exact: true }).first().waitFor();
        assert.equal(savedCurrency, "USD");
        await page.getByRole("button", { name: "Delete income", exact: true }).click();
        await page.getByRole("dialog", { name: "Delete income", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        await page
          .getByRole("dialog", { name: "Delete income", exact: true })
          .waitFor({ state: "hidden" });
        await page.goto(`${base}/finance/expenses/4`);
        let allocationCount = 0;
        for (const [id, person, amount] of [
          [1, "Dad", "600"],
          [1, "Mom", "400"],
          [2, "Dad", "1000"],
          [3, "Dad", "500"],
        ]) {
          const plan = [...plans.values()].find(
            (plan) => plan.expenseId === id && plan.person === person,
          );
          await page.getByLabel("Expense to reimburse").selectOption(String(plan.id));
          await page.getByLabel("Reimbursement allocation amount").fill(amount);
          await page.getByRole("button", { name: "Allocate reimbursement", exact: true }).click();
          await page.waitForFunction(
            (count) =>
              document.querySelectorAll('[aria-label="Reimbursements"] li').length === count,
            ++allocationCount,
          );
        }
        const panel = page.getByRole("region", { name: "Reimbursements", exact: true });
        assert.match(await panel.innerText(), /Not allocated 0\.00 CAD/);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          "refund page fits the viewport",
        );
        assert.equal(await page.getByLabel("Find reimbursement expense").count(), 0);
        assert.equal(await page.getByRole("button", { name: "Reload reimbursements" }).count(), 0);
        assert.equal(await page.getByLabel("Currency", { exact: true }).count(), 0);
        if (viewport.width >= 768) {
          const left = await page.locator("#expense-details").boundingBox();
          const right = await panel.boundingBox();
          assert.ok(right.x > left.x && Math.abs(left.width - right.width) < 3);
          const card = await page.locator("#expense-details form").boundingBox();
          assert.ok(
            Math.abs(card.y - right.y) < 3 && Math.abs(card.height - right.height) < 3,
            "refund cards align and have matching height",
          );
          const header = await page
            .getByLabel("Financial record header", { exact: true })
            .boundingBox();
          assert.ok(header.y + header.height <= card.y);
          assert.equal(
            await page.getByRole("heading", { name: "Refund details", exact: true }).count(),
            1,
          );
        }
        await page.getByRole("link", { name: "Rent 3", exact: true }).click();
        if (viewport.width >= 768)
          await page.getByRole("tab", { name: "Reimbursements", exact: true }).click();
        await page.getByText("Partially reimbursed", { exact: true }).first().waitFor();
        assert.match(await panel.innerText(), /Still owed\s+500\.00 CAD/);
        await page
          .getByRole("img", { name: "50% of expected reimbursement received", exact: true })
          .waitFor();
        await page.screenshot({
          path: `/tmp/finance-reimbursement-${viewport.width}.png`,
          fullPage: true,
        });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          "expense page fits the viewport",
        );
        await page.getByRole("link", { name: "Dad — combined payment", exact: true }).click();
        const row = panel
          .getByRole("listitem")
          .filter({ has: page.getByRole("link", { name: "Rent 3", exact: true }) });
        await row.getByRole("button", { name: "Edit", exact: true }).click();
        await page.getByLabel("Reimbursement allocation amount").fill("400");
        await page.getByRole("button", { name: "Save allocation", exact: true }).click();
        await page.waitForFunction(() =>
          document
            .querySelector('[aria-label="Reimbursements"]')
            ?.textContent.includes("Not allocated 100.00 CAD"),
        );
        await panel
          .getByRole("listitem")
          .filter({ has: page.getByRole("link", { name: "Rent 3", exact: true }) })
          .getByRole("button", { name: "Unlink", exact: true })
          .click();
        const unlink = page.getByRole("dialog", { name: "Unlink reimbursement", exact: true });
        await unlink.waitFor();
        await unlink.getByRole("button", { name: "Confirm", exact: true }).click();
        await page.getByLabel("Expense to reimburse").waitFor();
        assert.equal(links.length, 3);
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
