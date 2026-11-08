import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

// UI fixtures are intercepted in the browser; no vocabulary or practice is written.
test("Kanji readings can be added/removed/edited, all readings appear and validate in practice, history has daily totals on desktop and phone", { skip: process.env.RUN_KANJI_READINGS_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright"), { loadEnvConfig } = require("@next/env");
  loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 600, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const base = "http://localhost:3000", browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ colorScheme: "dark" });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    const categories = [{ id: 1, name: "Verb" }, { id: 2, name: "Kanji" }];
    const word = { id: 987654, english: "day", japanese: "日", hiragana: "にち", readings: ["にち", "ひ", "か"], category_name: "Kanji", read_hiragana: false, status: "WEAK", categoryId: 2, starred: false, percentage: "0", worst_status: "WEAK" };
    let added, edited;
    await context.route(`${base}/api/japanese-practice/categories`, route => route.fulfill({ json: { success: true, categories } }));
    await context.route(`${base}/api/japanese-practice/activities`, route => route.fulfill({ json: [1, 2, 3, 4, 5].map(id => ({ id, activity: `Activity ${id}` })) }));
    await context.route(`${base}/api/japanese-practice/vocabulary/add`, route => { added = route.request().postDataJSON(); return route.fulfill({ json: { success: true, vocabulary: word } }); });
    await context.route(`${base}/api/japanese-practice/vocabulary/987654`, route => { if (route.request().method() === "PATCH") edited = route.request().postDataJSON(); return route.fulfill({ json: { success: true, vocabulary: word } }); });
    await context.route(`${base}/api/japanese-practice/vocabulary`, route => route.fulfill({ json: route.request().method() === "POST" ? { success: true, words: [word] } : [word] }));
    const session = { id: 987654, activityId: 3, activityName: "English to Japanese writing", date: "2026-11-08T17:00:00Z", durationSeconds: 125, wordCount: 1, weakCount: 0, goodCount: 0, perfectCount: 1, averageBefore: 10, averageAfter: 10.25, hasDetails: true };
    await context.route(`${base}/api/japanese-practice/practice-sessions?*`, route => route.fulfill({ json: { sessions: [session, { ...session, id: 987655, durationSeconds: 65, averageBefore: 40, averageAfter: 40.5 }] } }));
    await context.route(`${base}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}/japanese/add-vocabulary`);
      await page.locator("select").selectOption("2");
      assert.equal(await page.getByRole("button", { name: /Remove reading/ }).count(), 0);
      await page.getByRole("textbox").nth(0).fill("day");
      await page.getByRole("textbox").nth(1).fill("日");
      await page.getByRole("textbox", { name: "Reading 1", exact: true }).fill("にち");
      await page.getByRole("button", { name: "+ Add reading", exact: true }).click();
      await page.getByRole("textbox", { name: "Reading 2", exact: true }).fill("ひ");
      await page.getByRole("button", { name: "+ Add reading", exact: true }).click();
      await page.getByRole("button", { name: "Remove reading 3", exact: true }).click();
      await page.getByRole("button", { name: "Add Vocabulary", exact: true }).click();
      await page.getByText("Vocabulary added successfully!", { exact: true }).waitFor();
      assert.deepEqual(added.readings, ["にち", "ひ"]);
      await page.goto(`${base}/japanese/vocabulary/987654`);
      await page.getByText("にち / ひ / か", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByRole("button", { name: "+ Add reading", exact: true }).click();
      await page.getByRole("textbox", { name: "Reading 4", exact: true }).fill("じつ");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Vocabulary updated successfully!", { exact: true }).waitFor();
      assert.deepEqual(edited.readings, ["にち", "ひ", "か", "じつ"]);
      for (const activity of [1, 2, 3, 4, 5]) {
        await page.goto(`${base}/japanese/practice`);
        await page.locator("select").nth(1).selectOption(String(activity));
        await page.getByRole("button", { name: "Start Practice", exact: true }).click();
        await page.locator(".practice-session").getByText("Kanji", { exact: true }).waitFor();
        if (activity === 3) await page.getByPlaceholder("Type the Japanese word").fill("ひ");
        await page.getByRole("button", { name: "Show Translation", exact: true }).click();
        await page.getByText("にち / ひ / か", { exact: true }).waitFor();
        if (activity === 3) assert.match(await page.getByPlaceholder("Type the Japanese word").getAttribute("class"), /border-green-500/);
      }
      await page.goto(`${base}/japanese/practice/history?date=2026-11-08&kind=vocab&range=day`);
      await page.getByText("Time practiced: 3m 10s", { exact: true }).waitFor();
      await page.getByText("Improvement: +0.75 percentage points", { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal overflow");
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
