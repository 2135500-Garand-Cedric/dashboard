import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";

test(
  "member settings, per-user timezone, early practice review and phone verb forms",
  { skip: process.env.RUN_ACCOUNT_PRACTICE_BROWSER_TEST !== "1", timeout: 180000 },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright"),
      browser = await chromium.launch({ headless: true });
    const fixture = JSON.parse(fs.readFileSync("/tmp/multi-browser-fixture.json", "utf8")),
      base = "http://localhost:3000";
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
      });
      await context.addCookies([
        { name: "next-auth.session-token", value: fixture.memberToken, url: base },
      ]);
      const initialized = await context.request.post(base + "/api/onboarding", {
        data: { choice: "EMPTY", name: "Partial practice tester", timeZone: "UTC" },
      });
      assert.equal(initialized.status(), 200);
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/settings");
      await page.getByRole("link", { name: "My account", exact: true }).waitFor();
      assert.equal(
        await page.getByRole("link", { name: "User management", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("link", { name: "Display timezone", exact: true }).count(),
        0,
      );
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      const nav = page.getByRole("navigation", { name: "Dashboard navigation" });
      assert.equal(await nav.getByRole("link", { name: "My account", exact: true }).count(), 0);
      assert.equal(
        await nav.getByRole("link", { name: "User management", exact: true }).count(),
        0,
      );
      await page.getByRole("button", { name: "Close navigation", exact: true }).click();
      await page.getByRole("link", { name: "My account", exact: true }).click();
      await page.waitForURL("**/settings/account");
      assert.equal(await page.getByText(/For sign-in changes/).count(), 0);
      await page.getByLabel("Timezone", { exact: true }).selectOption("Asia/Tokyo");
      const updated = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/account" && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save account", exact: true }).click();
      assert.equal((await updated).status(), 200);
      assert.equal(
        (await (await context.request.get(base + "/api/account")).json()).actor.timeZone,
        "Asia/Tokyo",
      );
      assert.equal((await context.request.get(base + "/api/settings/email")).status(), 403);
      const words = Array.from({ length: 10 }, (_, i) => ({
        id: i + 100,
        english: `Word ${i + 1}`,
        japanese: `言葉${i + 1}`,
        hiragana: "ことば",
        category_name: "Verb",
        status: "WEAK",
      }));
      let preview, save;
      const review = (input) => ({
        id: null,
        activityId: 1,
        activityName: "Kanji to English speaking",
        date: input.completedAt,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        durationSeconds: 12,
        wordCount: input.updates.length,
        weakCount: input.updates.filter((u) => u.status === "WEAK").length,
        goodCount: input.updates.filter((u) => u.status === "GOOD").length,
        perfectCount: input.updates.filter((u) => u.status === "PERFECT").length,
        averageBefore: 0,
        averageAfter: 10,
        xpEarned: 6,
        goldEarned: 1,
        hasDetails: true,
        starredOnly: false,
        selectedCategories: [],
        words: input.updates.map((u) => ({
          ...words.find((w) => w.id === u.activityVocabId),
          ...u,
          vocabId: u.activityVocabId,
          hiragana: "ことば",
          categoryName: "Verb",
          previousStatus: "WEAK",
        })),
      });
      await context.route("**/api/japanese-practice/**", async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname;
        const send = (json) => route.fulfill({ json });
        if (path.endsWith("/activities"))
          return send([{ id: 1, activity: "Kanji to English speaking" }]);
        if (path.endsWith("/categories"))
          return send({
            success: true,
            categories: [
              { id: 1, name: "Verb", kind: "VERB", isDefault: true, vocabularyCount: 0 },
              { id: 2, name: "Kanji", kind: "KANJI", isDefault: true, vocabularyCount: 0 },
            ],
          });
        if (path.endsWith("/vocabulary") && req.method() === "POST")
          return send({ success: true, words });
        if (path.endsWith("/preview")) {
          preview = req.postDataJSON();
          return send({ success: true, review: review(preview) });
        }
        if (path.endsWith("/practice-sessions") && req.method() === "POST") {
          save = req.postDataJSON();
          return send({ success: true, review: review(save) });
        }
        if (path.endsWith("/vocabulary/123"))
          return send({
            success: true,
            vocabulary: {
              id: 123,
              english: "to go (honorific)",
              japanese: "いらっしゃる",
              hiragana: "いらっしゃる",
              categoryId: 1,
              starred: false,
              verbType: "honorific",
              worst_status: "WEAK",
              percentage: "0",
              verbForms: Array.from({ length: 12 }, (_, i) => ({
                id: i + 1,
                formType: `Form ${i + 1}`,
                form: "いらっしゃいます",
                reading: "いらっしゃいます",
                worst_status: i % 2 ? "GOOD" : "WEAK",
                percentage: String(i * 5),
              })),
            },
          });
        return route.continue();
      });
      await page.goto(base + "/japanese/practice");
      await page.getByLabel("Verb (dict only)", { exact: true }).check();
      await page.getByRole("button", { name: "Start Practice", exact: true }).click();
      const finish = page.getByRole("button", { name: "Finish practice", exact: true });
      await finish.waitFor();
      assert.equal(await finish.isDisabled(), true);
      for (const status of ["GOOD", "PERFECT", "WEAK", "GOOD", "PERFECT"]) {
        await page.getByRole("button", { name: "Show Translation", exact: true }).click();
        await page.getByRole("button", { name: status, exact: true }).click();
      }
      await finish.click();
      await page.getByRole("heading", { name: "Practice overview", exact: true }).waitFor();
      assert.equal(preview.updates.length, 5);
      assert.deepEqual(preview.categories, [-1]);
      assert.deepEqual(
        preview.updates.map((u) => u.activityVocabId),
        [100, 101, 102, 103, 104],
      );
      const lists = page.getByRole("list", { name: /^(Weak|Good|Perfect) words$/ });
      assert.equal(await lists.locator("li").count(), 5);
      assert.equal(await page.getByText("Word 6", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Okay", exact: true }).click();
      await page.getByRole("button", { name: "Start Practice", exact: true }).waitFor();
      assert.deepEqual(save.updates, preview.updates);
      assert.equal(save.sessionKey, preview.sessionKey);
      await page.goto(base + "/japanese/vocabulary/123");
      assert.equal(await page.getByRole("button", { name: "Forms", exact: true }).count(), 0);
      const cards = page.getByLabel("Verb form cards", { exact: true });
      await cards.waitFor();
      assert.equal(await cards.locator("article").count(), 12);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: "/tmp/phone-verb-form-cards.png", fullPage: true });
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByRole("textbox").first().fill("Unsaved translation");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.getByText("Unsaved translation", { exact: true }).count(), 0);
      assert.equal(await cards.isVisible(), true);

      await page.setViewportSize({ width: 1440, height: 1000 });
      assert.equal(await cards.isVisible(), false);
      assert.equal(
        await page.getByRole("columnheader", { name: "Form Name", exact: true }).isVisible(),
        true,
      );
      await page.goto(base + "/japanese/categories");
      await page.getByText("Default", { exact: true }).first().waitFor();
      assert.equal(await page.getByRole("button", { name: "Edit", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Delete", exact: true }).count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
