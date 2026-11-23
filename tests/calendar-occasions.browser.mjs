import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

test(
  "holiday/birthday settings, read-only occurrence pages, linked tasks and blank expense tax/tip work on phone and desktop",
  { skip: process.env.RUN_CALENDAR_OCCASIONS_BROWSER_TEST !== "1", timeout: 300000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "dark",
    });
    const base = "http://localhost:3002";
    const token = await encode({
      secret: "disposable-work-browser-test-secret-not-for-production",
      maxAge: 3600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    await context.route("https://www.youtube.com/**", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const prefix = `Occasion browser ${randomUUID().slice(0, 8)}`;
    const request = async (path, method = "get", data) => {
      const response = await context.request[method](base + path, {
        ...(data === undefined ? {} : { data }),
        headers: { "Idempotency-Key": randomUUID() },
      });
      assert.ok(response.ok(), `${path}: ${await response.text()}`);
      return response.json();
    };
    try {
      const anonymous = await browser.newContext();
      for (const [path, method] of [
        ["/api/settings/birthdays", "get"],
        ["/api/settings/birthdays", "post"],
        ["/api/settings/birthdays/1", "patch"],
        ["/api/settings/birthdays/1", "delete"],
        ["/api/calendar-dates/holiday/1?date=2026-12-25", "get"],
        ["/api/calendar-dates/birthday/1/tasks", "post"],
        ["/api/calendar-dates/birthday/1/tasks", "delete"],
      ])
        assert.equal((await anonymous.request[method](base + path)).status(), 401);
      await anonymous.close();
      const old = await request("/api/settings/holidays");
      for (const item of old.selected) await request(`/api/settings/holidays/${item.id}`, "delete");
      for (const item of await request("/api/settings/birthdays"))
        await request(`/api/settings/birthdays/${item.id}`, "delete");
      const ca = (await request("/api/settings/holidays?country=CA")).choices;
      const newYear = ca.find((item) => item.name.includes("New Year") && !item.state);
      await request("/api/settings/holidays", "post", {
        country: "CA",
        key: newYear.key,
        name: `${prefix} New Year`,
        type: "holiday",
      });
      await page.goto(`${base}/settings/holidays`);
      const holidayDialog = page.getByRole("dialog", { name: "Add a holiday", exact: true });
      assert.equal(await holidayDialog.isVisible(), false);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByRole("button", { name: "Add holiday", exact: true }).click();
        await holidayDialog.waitFor();
        const box = await holidayDialog.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
        await page.mouse.click(2, 2);
        await holidayDialog.waitFor({ state: "hidden" });
      }
      await page.getByRole("button", { name: "Add holiday", exact: true }).click();
      await holidayDialog.getByLabel("Holiday country", { exact: true }).selectOption("CA");
      const xmas = ca.find((item) => item.name === "Christmas Day" && !item.state);
      await holidayDialog.getByLabel("Holiday", { exact: true }).selectOption(xmas.key);
      await holidayDialog
        .getByLabel("Holiday display name", { exact: true })
        .fill(`${prefix} Christmas`);
      await holidayDialog.getByRole("button", { name: "Save holiday", exact: true }).click();
      await holidayDialog.waitFor({ state: "hidden" });
      const chosen = (await request("/api/settings/holidays")).selected;
      assert.deepEqual(
        chosen.map((item) => item.nextDate),
        [...chosen.map((item) => item.nextDate)].sort(),
      );
      const christmas = chosen.find((item) => item.key === xmas.key);
      await page.goto(`${base}/events/holidays/${christmas.id}?date=${christmas.nextDate}`);
      await page.getByRole("heading", { name: `${prefix} Christmas`, exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: /Edit event|Delete event/ }).count(), 0);
      for (const method of ["patch", "delete"])
        assert.equal(
          (
            await context.request[method](`${base}/api/calendar-dates/holiday/${christmas.id}`)
          ).status(),
          405,
        );
      await page.goto(`${base}/settings`);
      await page.getByRole("link", { name: "Birthdays", exact: true }).click();
      await page.waitForURL(`${base}/settings/birthdays`);
      await page.getByRole("button", { name: "Add birthday", exact: true }).click();
      const birthdayDialog = page.getByRole("dialog", { name: "Add birthday", exact: true });
      const birthdayDay = new Date(Date.now() + 2 * 86400000);
      await birthdayDialog.getByLabel("Person's name", { exact: true }).fill(`${prefix} Alex`);
      await birthdayDialog
        .getByLabel("Birthday month", { exact: true })
        .selectOption(String(birthdayDay.getUTCMonth() + 1));
      await birthdayDialog
        .getByLabel("Birthday day", { exact: true })
        .selectOption(String(birthdayDay.getUTCDate()));
      await birthdayDialog.getByRole("button", { name: "Save birthday", exact: true }).click();
      await birthdayDialog.waitFor({ state: "hidden" });
      const birthday = (await request("/api/settings/birthdays")).find(
        (item) => item.name === `${prefix} Alex`,
      );
      const href = `/events/birthdays/${birthday.id}?date=${birthday.nextDate}`;
      await page.getByRole("link", { name: `${prefix} Alex`, exact: true }).click();
      await page.waitForURL(base + href);
      await page.getByRole("heading", { name: `${prefix} Alex’s birthday`, exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: /Edit birthday|Delete birthday|Delete event|Edit event/ })
          .count(),
        0,
      );
      const task = await request("/api/todos", "post", { title: `${prefix} buy gift` });
      await page.getByLabel("Search tasks to link", { exact: true }).fill(`${prefix} buy gift`);
      await page.getByLabel("Existing task", { exact: true }).selectOption(String(task.id));
      await page.getByRole("button", { name: "Link task", exact: true }).click();
      await page.getByRole("link", { name: `${prefix} buy gift`, exact: true }).waitFor();
      const nextYear = Number(birthday.nextDate.slice(0, 4)) + 1;
      assert.equal(
        (
          await request(
            `/api/calendar-dates/birthday/${birthday.id}?date=${nextYear}${birthday.nextDate.slice(4)}`,
          )
        ).tasks.length,
        0,
      );
      await page.getByRole("link", { name: "New task", exact: true }).click();
      await page.getByRole("heading", { name: "New task", exact: true }).waitFor();
      assert.equal(
        await page.getByLabel("Task deadline", { exact: true }).inputValue(),
        birthday.nextDate,
      );
      await page.getByLabel("Title", { exact: true }).fill(`${prefix} Birthday card`);
      await page.getByRole("button", { name: "Create task", exact: true }).click();
      await page.waitForURL(base + href);
      await page.getByRole("link", { name: `${prefix} Birthday card`, exact: true }).waitFor();
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
      }
      const related = await request(`/api/todos/${task.id}/calendar`);
      assert.ok(related.occasionLinks.some((item) => item.href === href));
      await page.getByRole("button", { name: `Unlink ${prefix} buy gift`, exact: true }).click();
      await page
        .getByRole("link", { name: `${prefix} buy gift`, exact: true })
        .waitFor({ state: "hidden" });
      const bank = (
        await request("/api/finance/accounts", "post", {
          name: prefix,
          type: "CHEQUING",
          currency: "CAD",
        })
      ).account;
      const category = (
        await request("/api/finance/categories", "post", { name: prefix, type: "EXPENSE" })
      ).category;
      await page.goto(`${base}/finance/expenses/new`);
      await page
        .getByLabel("Description / merchant", { exact: true })
        .fill(`${prefix} cash purchase`);
      await page.getByLabel("Payment account", { exact: true }).selectOption(String(bank.id));
      await page.getByLabel("Expense category", { exact: true }).selectOption(String(category.id));
      assert.equal(await page.getByLabel("Tax (optional)", { exact: true }).inputValue(), "");
      assert.equal(await page.getByLabel("Tip (optional)", { exact: true }).inputValue(), "");
      await page.getByLabel("Subtotal", { exact: true }).fill("25");
      assert.equal(await page.getByLabel("Total", { exact: true }).inputValue(), "25.00");
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/finance/expenses") &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save expense", exact: true }).click();
      const response = await saved;
      assert.ok(response.ok(), await response.text());
      const expense = await response.json();
      assert.equal(Number(expense.receipt.tax), 0);
      assert.equal(Number(expense.receipt.tip), 0);
      assert.equal(Number(expense.receipt.total), 25);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
