import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import sharp from "sharp";

test(
  "income, expenses, transfers and CSV matching form one coherent workflow on desktop and phone",
  { skip: process.env.RUN_FINANCE_ACTIVITY_BROWSER_TEST !== "1", timeout: 180000 },
  async () => {
    const base = "http://localhost:3002",
      prefix = `BrowserFinanceActivity ${randomUUID()}`;
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
      });
      const token = await encode({
        secret: "disposable-work-browser-test-secret-not-for-production",
        maxAge: 600,
        token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
      });
      await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      const request = async (path, method = "GET", data) => {
        const response = await context.request.fetch(`${base}/api/finance/${path}`, {
          method,
          ...(data === undefined ? {} : { data }),
        });
        const result = await response.json();
        assert.ok(response.ok(), `${method} ${path}: ${result.error ?? response.status()}`);
        return result;
      };
      const account = async (type) =>
        (await request("accounts", "POST", { name: `${prefix} ${type}`, type, currency: "CAD" }))
          .account;
      const bank = await account("CHEQUING"),
        savings = await account("SAVINGS"),
        card = await account("CREDIT_CARD");
      const category = (await request("categories", "POST", { name: prefix, type: "EXPENSE" }))
        .category;
      const source = (await request("income-sources", "POST", { name: prefix, kind: "GIFT" }))
        .source;
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/finance/expenses/new`);
      await page.getByLabel("Description / merchant", { exact: true }).fill(`${prefix} purchase`);
      await page.getByLabel("Purchase date", { exact: true }).fill("2026-11-06");
      await page.getByLabel("Payment account", { exact: true }).selectOption(String(bank.id));
      await page.getByLabel("Expense category", { exact: true }).selectOption(String(category.id));
      assert.equal(await page.getByLabel("Subtotal", { exact: true }).isVisible(), false);
      assert.equal(await page.getByLabel("Associated transaction", { exact: true }).count(), 0);
      await page.getByLabel("Total", { exact: true }).fill("40.20");
      await page.getByRole("button", { name: "Save expense", exact: true }).click();
      await page.waitForURL(/\/finance\/expenses\/\d+$/);
      const expenseId = Number(new URL(page.url()).pathname.split("/").pop());
      await page.getByRole("heading", { name: "Expense details", exact: true }).waitFor();
      assert.equal((await request(`transactions/${expenseId}`)).transaction.amount, "-40.2000");
      await page.getByLabel("Total", { exact: true }).fill("50.30");
      await page.getByRole("button", { name: "Save expense", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector('[aria-label="Total"]')?.value === "50.3000",
      );
      assert.equal((await request(`transactions/${expenseId}`)).transaction.amount, "-50.3000");
      const png = await sharp({
        create: {
          width: 60,
          height: 80,
          channels: 3,
          background: `#${randomUUID().replaceAll("-", "").slice(0, 6)}`,
        },
      })
        .png()
        .toBuffer();
      await page
        .getByLabel("Choose receipt file", { exact: true })
        .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
      await page.getByAltText("Receipt preview", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Save expense", exact: true }).click();
      await page.getByText(/receipt.png ·/).waitFor();
      const expense = (await request(`transactions/${expenseId}`)).transaction;
      assert.equal(expense.receipts.length, 1);
      assert.equal(
        (
          await context.request.get(
            `${base}/api/finance/receipts/${expense.receipts[0].id}/document`,
          )
        ).status(),
        200,
      );
      await page.goto(`${base}/finance/income/new`);
      await page
        .getByLabel("Employer / income source", { exact: true })
        .selectOption(String(source.id));
      await page.getByLabel("Income description", { exact: true }).fill(`${prefix} gift`);
      await page.getByLabel("Pay date", { exact: true }).fill("2026-11-06");
      await page.getByLabel("Net income", { exact: true }).fill("100");
      await page.getByLabel("Deposit account", { exact: true }).selectOption(String(bank.id));
      await page.getByRole("button", { name: "Save income record", exact: true }).click();
      await page.waitForURL(/\/finance\/income\/deposits\/\d+$/);
      const incomeId = Number(new URL(page.url()).pathname.split("/").pop());
      await page.getByRole("heading", { name: "Income details", exact: true }).waitFor();
      await page.getByLabel("Net income", { exact: true }).fill("105");
      await page.getByRole("button", { name: "Save income record", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector('[aria-label="Net income"]')?.value === "105.0000",
      );
      assert.equal((await request(`transactions/${incomeId}`)).transaction.amount, "105.0000");
      const payStub = await sharp({
        create: {
          width: 65,
          height: 85,
          channels: 3,
          background: `#${randomUUID().replaceAll("-", "").slice(0, 6)}`,
        },
      })
        .png()
        .toBuffer();
      await page
        .getByLabel("Choose pay stub file", { exact: true })
        .setInputFiles({ name: "pay-stub.png", mimeType: "image/png", buffer: payStub });
      await page.getByAltText("Pay stub preview", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Save income record", exact: true }).click();
      await page.getByText(/pay-stub.png ·/).waitFor();
      for (const [destination, amount] of [
        [savings, "20"],
        [card, "25"],
      ]) {
        await page.goto(`${base}/finance/transfers/new`);
        await page.getByLabel("From account", { exact: true }).selectOption(String(bank.id));
        assert.equal(await page.getByLabel("Transaction type", { exact: true }).count(), 0);
        await page.getByLabel("To account", { exact: true }).selectOption(String(destination.id));
        await page.getByLabel("Date", { exact: true }).fill("2026-11-06");
        await page
          .getByLabel("Description", { exact: true })
          .fill(`${prefix} transfer ${destination.id}`);
        await page.getByLabel("Amount sent", { exact: true }).fill(amount);
        await page.getByRole("button", { name: "Save transfer", exact: true }).click();
        await page.waitForURL(`${base}/finance/transfers`);
      }
      await page.goto(`${base}/finance/expenses/refunds/new`);
      await page.getByLabel("Account", { exact: true }).selectOption(String(bank.id));
      await page.getByLabel("Category", { exact: true }).selectOption(String(category.id));
      await page.getByLabel("Date", { exact: true }).fill("2026-11-06");
      await page.getByLabel("Description", { exact: true }).fill(`${prefix} refund`);
      await page.getByLabel("Amount", { exact: true }).fill("5");
      await page.getByRole("button", { name: "Save refund", exact: true }).click();
      await page.waitForURL(`${base}/finance/expenses`);
      assert.equal((await request(`transactions?activity=expenses&account=${bank.id}`)).total, 2);
      assert.equal((await request(`transactions?activity=income&account=${bank.id}`)).total, 1);
      assert.equal((await request(`transactions?activity=transfers&account=${bank.id}`)).total, 2);
      const csv = `date,ref #,description,amount\n2026-11-06,00001,${prefix} purchase,-50.30\n2026-11-06,00002,${prefix} gift,105\n2026-11-06,00003,${prefix} savings transfer,-20\n`;
      const ownedTransfers = await request(`transactions?activity=transfers&account=${bank.id}`);
      const savingsTransfer = ownedTransfers.transactions.find((row) => row.amount === "-20.0000");
      const invalidUpload = await context.request.post(`${base}/api/finance/imports`, {
        multipart: {
          details: JSON.stringify({ accountId: bank.id }),
          file: { name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
        },
      });
      assert.equal(invalidUpload.status(), 400);
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.goto(`${base}/finance/imports/new`);
      await page.getByLabel("Statement account", { exact: true }).selectOption(String(bank.id));
      await page.getByLabel("Statement from", { exact: true }).fill("2026-11-01");
      await page.getByLabel("Statement to", { exact: true }).fill("2026-11-30");
      await page
        .getByLabel("Statement CSV file", { exact: true })
        .setInputFiles({ name: "activities.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole("button", { name: "Upload and match rows", exact: true }).click();
      await page.waitForURL(/\/finance\/imports\/\d+$/);
      const { batch } = await request(`imports/${page.url().split("/").at(-1)}`);
      assert.equal(batch.rows[0].review.matchId, null);
      assert.equal(batch.rows[1].review.matchId, null);
      await page.goto(`${base}/finance/imports/${batch.id}`);
      await page.getByRole("article", { name: "Statement row 1", exact: true }).waitFor();
      const firstRow = page.getByRole("article", { name: "Statement row 1", exact: true });
      // New records opened from statement rows carry source values without saving automatically.
      for (const [rowNumber, label, description, amount] of [
        [1, "expense", `${prefix} purchase`, "50.3000"],
        [2, "income", `${prefix} gift`, "105.0000"],
      ]) {
        const row = page.getByRole("article", { name: `Statement row ${rowNumber}`, exact: true });
        const popupPromise = context.waitForEvent("page");
        await row.getByRole("link", { name: `Add ${label}`, exact: true }).click();
        const popup = await popupPromise;
        await popup.waitForLoadState();
        assert.equal(
          await popup
            .getByLabel(label === "expense" ? "Description / merchant" : "Income description", {
              exact: true,
            })
            .inputValue(),
          description,
        );
        assert.equal(
          await popup
            .getByLabel(label === "expense" ? "Purchase date" : "Pay date", { exact: true })
            .inputValue(),
          "2026-11-06",
        );
        assert.equal(
          await popup
            .getByLabel(label === "expense" ? "Total" : "Net income", { exact: true })
            .inputValue(),
          amount,
        );
        await popup.close();
      }
      await page.getByLabel("Row 1 match", { exact: true }).selectOption(String(expenseId));
      assert.match(await firstRow.getAttribute("class"), /border-emerald/);
      await page.getByRole("button", { name: "Save matches", exact: true }).click();
      await page.getByText("Saved", { exact: true }).waitFor();
      await page.getByText("1 matched · 2 remaining", { exact: true }).waitFor();
      await page.goto(`${base}/finance/imports?account=${bank.id}`);
      await page.getByText("1 matched · 2 remaining", { exact: true }).waitFor();
      await page.goto(`${base}/finance/imports/${batch.id}`);
      await page.getByLabel("Row 2 match", { exact: true }).selectOption(String(incomeId));
      await page.getByLabel("Row 3 type", { exact: true }).selectOption("TRANSFER");
      await page
        .getByLabel("Row 3 match", { exact: true })
        .selectOption(String(savingsTransfer.id));
      await page.getByRole("button", { name: "Save matches", exact: true }).click();
      await page.getByText("3 matched · 0 remaining", { exact: true }).waitFor();
      for (const [recordId, kind, field] of [
        [incomeId, "income/deposits", "Net income"],
        [expenseId, "expenses", "Total"],
      ]) {
        await page.goto(`${base}/finance/${kind}/${recordId}`);
        await page.getByLabel("Activity notes", { exact: true }).waitFor();
        assert.equal(await page.getByLabel(field, { exact: true }).isDisabled(), true);
        assert.equal(await page.getByLabel("Activity notes", { exact: true }).isEnabled(), true);
        assert.equal(await page.getByText("Notes remain editable", { exact: true }).count(), 0);
        const notesSection = page
          .getByLabel("Activity notes", { exact: true })
          .locator("xpath=ancestor::section[1]");
        await notesSection
          .getByRole("heading", {
            name: kind === "expenses" ? "Receipt information" : "Income information",
            exact: true,
          })
          .waitFor();
        const form = page
          .getByLabel("Activity notes", { exact: true })
          .locator("xpath=ancestor::form[1]");
        assert.equal(
          await form.locator("input:enabled,select:enabled,textarea:enabled").count(),
          1,
        );
        const headingRow = page
          .getByRole("heading", {
            name: kind === "expenses" ? "Expense details" : "Income details",
            exact: true,
          })
          .locator("..")
          .locator("..");
        await headingRow.getByText(`Record #${recordId}`, { exact: true }).waitFor();
        await headingRow.getByRole("link", { name: "Matched to statement", exact: true }).waitFor();
        await headingRow.getByRole("button", { name: "Reload", exact: true }).waitFor();
        await page
          .getByLabel("Activity notes", { exact: true })
          .fill("Updated note after statement matching");
        await page.getByRole("button", { name: "Save notes", exact: true }).click();
        await page.getByText("Notes saved.", { exact: true }).waitFor();
        assert.equal(
          (await request(`transactions/${recordId}`)).transaction.notes,
          "Updated note after statement matching",
        );
      }
      await page.goto(`${base}/finance/imports/${batch.id}`);
      await firstRow.getByRole("button", { name: "Change match", exact: true }).click();
      await page.getByLabel("Row 1 match", { exact: true }).selectOption("");
      await page.getByRole("button", { name: "Save matches", exact: true }).click();
      await page.getByText("2 matched · 1 remaining", { exact: true }).waitFor();
      assert.equal(
        (await request(`transactions/${expenseId}`)).transaction.statementMatches.length,
        0,
      );
      await page.getByLabel("Row 1 match", { exact: true }).selectOption(String(expenseId));
      await page.getByRole("button", { name: "Save matches", exact: true }).click();
      await page.getByText("3 matched · 0 remaining", { exact: true }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Matches & corrections", exact: true }).count(),
        0,
      );
      await request(`imports/${batch.id}/commit`, "POST", { expectedRevision: batch.revision });
      assert.equal((await request(`transactions?activity=expenses&account=${bank.id}`)).total, 2);
      assert.equal((await request(`transactions?activity=income&account=${bank.id}`)).total, 1);
      assert.equal(
        (await request(`transactions/${expenseId}`)).transaction.statementMatches[0].id,
        batch.id,
      );
      assert.equal(
        (await request(`transactions/${incomeId}`)).transaction.statementMatches[0].id,
        batch.id,
      );
      const report = await request(
        `reports?mode=custom&from=2026-11-01&to=2026-11-30&account=${bank.id}&currency=CAD`,
      );
      assert.equal(report.totals.income, "105.0000");
      assert.equal(report.totals.expenses, "45.3000");
      assert.equal(report.totals.net, "59.7000");
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const kind of ["expenses", "income", "transfers"]) {
          await page.goto(`${base}/finance/${kind}?account=${bank.id}`);
          await page
            .getByRole("link", { name: /View \/ edit|View record|View \/ notes/ })
            .first()
            .waitFor();
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          if (kind !== "transfers") {
            await page
              .getByRole("link", { name: "Matched to statement", exact: true })
              .first()
              .waitFor();
            assert.equal(
              await page.getByRole("link", { name: /Earlier (income|receipt)/ }).count(),
              0,
            );
          }
          assert.equal(
            await page
              .getByRole("navigation", { name: "Finance navigation" })
              .getByRole("link", { name: "Reconciliation", exact: true })
              .count(),
            0,
          );
        }
      }
      const anonymous = await browser.newContext();
      assert.equal((await anonymous.request.post(`${base}/api/finance/expenses`)).status(), 401);
      assert.equal(
        (await anonymous.request.delete(`${base}/api/finance/activities/${incomeId}`)).status(),
        401,
      );
      await anonymous.close();
      assert.deepEqual(errors, []);
      console.log(
        "Verified optional receipt, same-record money edits, payroll deposit, savings/card transfers, CSV matching and retry, mobile layout and protected APIs in the isolated app.",
      );
    } finally {
      await browser.close();
    }
  },
);
