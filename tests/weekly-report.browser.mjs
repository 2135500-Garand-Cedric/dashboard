import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

const shift = (day, days) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
function fixture(query, currentWeek) {
  const week = query.get("week"),
    currency = query.get("currency") || "CAD",
    dataset = query.get("dataset") || "all";
  const item = (index) => ({
    id: `task:${index}`,
    title: `Recorded completion ${index}`,
    subtitle: "Example project",
    when: `${week}T12:00:00Z`,
    href: `/todos/${index + 1}`,
    badges: index === 0 ? ["Reopened"] : [],
  });
  const list = (items = [], total = items.length, nextCursor = null) => ({
    items,
    total,
    nextCursor,
  });
  const practice = {
    sessions: 2,
    reviews: 20,
    weak: 3,
    good: 7,
    perfect: 10,
    durationSeconds: 60,
    partialTime: true,
    impact: 1.5,
    partialImpact: true,
    list: list(),
  };
  const wrap = (data) => ({ data, error: null });
  return {
    period: {
      week,
      lastDay: shift(week, 6),
      currentWeek: currentWeek || week,
      current: week === (currentWeek || week),
      timeZone: "UTC",
      asOf: new Date().toISOString(),
      currency,
      dataset,
    },
    work: wrap({
      completed: list([0, 1, 2].map(item), 6, "fixture-cursor"),
      reopened: list([item(0)]),
      cancelled: list(),
    }),
    attention: wrap({
      tasks: list([
        {
          ...item(20),
          title: "Task needing attention",
          badges: ["Overdue deadline", "Follow-up due"],
        },
      ]),
      projects: list(),
    }),
    japanese: wrap({
      vocab: practice,
      kanji: { ...practice, durationSeconds: null, impact: null },
    }),
    knowledge: wrap({
      created: list([
        {
          ...item(30),
          title: "Troubleshooting guide",
          href: "/knowledge/1",
          subtitle: "Procedure",
        },
      ]),
      changed: list(),
    }),
    finance: wrap({
      totals: {
        income: "400.0000",
        expenses: "115.0000",
        net: "290.0000",
        adjustments: "5.0000",
        count: 4,
      },
      accountCount: 2,
      unmatched: list([
        {
          ...item(40),
          title: "Example purchase",
          href: "/finance/expenses/1",
          badges: ["Not matched to a statement"],
        },
      ]),
      overviewHref: `/finance?${new URLSearchParams({ mode: "custom", from: week, to: shift(week, 6), currency, dataset })}`,
    }),
  };
}
test(
  "weekly report shows completed-week summaries, stays responsive and recovers from section failures",
  { skip: process.env.RUN_WEEKLY_REPORT_BROWSER_TEST !== "1", timeout: 180000 },
  async () => {
    const require = createRequire(import.meta.url);
    require("@next/env").loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, {
      info() {},
      error() {},
    });
    const { chromium } = require("playwright"),
      browser = await chromium.launch({ headless: true }),
      base = "http://localhost:3000";
    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 600,
      token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
    });
    try {
      const anonymous = await browser.newContext();
      for (const path of ["/api/weekly-report", "/api/weekly-report/items?section=completed"]) {
        const response = await anonymous.request.get(base + path);
        assert.equal(response.status(), 401);
        assert.match(response.headers()["cache-control"], /no-store/);
      }
      const anonPage = await anonymous.newPage();
      await anonPage.goto(base + "/weekly-report");
      assert.match(anonPage.url(), /signin/);
      await anonymous.close();
      const other = await browser.newContext();
      await other.addCookies([
        {
          name: "next-auth.session-token",
          url: base,
          value: await encode({
            secret: process.env.NEXTAUTH_SECRET,
            maxAge: 600,
            token: { githubId: "123", provider: "github", ownerAuthVersion: 1 },
          }),
        },
      ]);
      assert.equal((await other.request.get(base + "/api/weekly-report")).status(), 403);
      await other.close();
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
        { width: 320, height: 740 },
      ]) {
        const context = await browser.newContext({ viewport, colorScheme: "dark" });
        await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
        assert.equal(
          (await context.request.get(base + "/api/weekly-report?week=not-a-date")).status(),
          400,
        );
        assert.equal(
          (await context.request.get(base + "/api/weekly-report/items?section=invalid")).status(),
          400,
        );
        let currentWeek = null;
        let financeFails = false,
          queries = [];
        await context.route("https://www.youtube.com/**", (route) => route.abort());
        await context.route(`${base}/api/**`, async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          assert.equal(request.method(), "GET", "report UI never issues a mutation");
          if (url.pathname.startsWith("/api/auth/")) return route.continue();
          if (url.pathname === "/api/notifications/inbox/count")
            return route.fulfill({ json: { unread: 0 } });
          if (url.pathname.startsWith("/api/youtube"))
            return route.fulfill({ json: { items: [] } });
          if (url.pathname === "/api/weekly-report/items") {
            assert.fail("The overview must not load individual records.");
          }
          if (url.pathname === "/api/weekly-report") {
            queries.push(Object.fromEntries(url.searchParams));
            currentWeek ??= url.searchParams.get("week");
            const data = fixture(url.searchParams, currentWeek);
            if (financeFails)
              data.finance = { data: null, error: "Finance temporarily unavailable" };
            return route.fulfill({ json: data });
          }
          return route.fulfill({ json: {} });
        });
        const page = await context.newPage(),
          errors = [];
        page.setDefaultTimeout(30000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(base + "/weekly-report");
        await page.getByRole("heading", { name: "Weekly report", exact: true }).waitFor();
        await page.getByText("Tasks completed", { exact: true }).waitFor();
        assert.equal(queries[0].dataset, "all");
        assert.equal(queries[0].currency, "CAD");
        assert.equal(await page.getByRole("combobox").count(), 0);
        assert.equal(await page.getByRole("button", { name: "Refresh", exact: true }).count(), 0);
        assert.equal(await page.getByText("Recorded CAD activity", { exact: false }).count(), 0);
        assert.equal(await page.getByText("Recorded completion 2", { exact: true }).count(), 0);
        assert.equal(await page.getByText("Troubleshooting guide", { exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "This week", exact: true }).count(), 0);
        assert.equal(await page.getByRole("region", { name: "Needs attention now" }).count(), 0);
        await page.getByText("Not recorded", { exact: true }).first().waitFor();
        await page.getByText("1m 0s (partial)", { exact: true }).waitFor();
        await page.getByText("+1.50 pp", { exact: false }).waitFor();
        const initial = await page.getByLabel("Week starting").inputValue();
        assert.equal(await page.getByRole("button", { name: "Later week" }).isDisabled(), true);
        await page.getByRole("button", { name: "Earlier week", exact: true }).click();
        await page.waitForFunction(
          (value) => document.querySelector('[aria-label="Week starting"]').value === value,
          shift(initial, -7),
        );
        await page.getByText("Tasks completed", { exact: true }).waitFor();
        assert.ok(queries.some((query) => query.week === shift(initial, -7)));
        await page.getByRole("button", { name: "Last completed week", exact: true }).click();
        await page.getByRole("region", { name: "Finance", exact: true }).waitFor();
        const href = await page
          .getByRole("link", { name: "Open finance", exact: true })
          .getAttribute("href");
        assert.match(href, /currency=CAD/);
        assert.match(href, /dataset=all/);
        financeFails = true;
        await page.getByRole("button", { name: "Earlier week", exact: true }).click();
        await page.getByText("Finance temporarily unavailable", { exact: true }).waitFor();
        assert.equal(await page.getByText("Tasks completed", { exact: true }).isVisible(), true);
        financeFails = false;
        await page.getByRole("button", { name: "Retry finance", exact: true }).click();
        await page.getByText("1 awaiting statement match", { exact: true }).waitFor();
        assert.ok(queries.every((query) => query.currency === "CAD" && query.dataset === "all"));
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({ path: `/tmp/weekly-report-${viewport.width}.png`, fullPage: true });
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
