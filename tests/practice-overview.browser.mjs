import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

// Optional real-layout regression: install Playwright separately, then run with
// RUN_PRACTICE_BROWSER_TEST=1 (NODE_PATH may point to a temporary installation).
test("desktop word lists scroll independently while phones scroll the whole overview", { skip: process.env.RUN_PRACTICE_BROWSER_TEST !== "1" }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(fileURLToPath(new URL("../", import.meta.url)), true, { info() {}, error() {} });
  assert.ok(process.env.NEXTAUTH_SECRET, "The local development auth secret is required; do not print it.");
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET, maxAge: 300, token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 } });
  const base = "http://localhost:3000";
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    const context = await browser.newContext({ colorScheme: "dark" });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
    // Fixtures stay in the browser: no database records or practice ratings change.
    const words = Array.from({ length: 10 }, (_, index) => ({
      activityVocabId: index + 1, vocabId: index + 1, english: `Example word ${index + 1}`, japanese: "学校", hiragana: "がっこう", categoryName: "Vocabulary", previousStatus: "WEAK", status: index === 0 ? "WEAK" : index < 8 ? "GOOD" : "PERFECT",
    }));
    const review = { id: 987654, activityId: 1, activityName: "Kanji to English speaking", date: "2026-11-05T17:00:00Z", startedAt: "2026-11-05T16:59:00Z", completedAt: "2026-11-05T17:00:00Z", durationSeconds: 60, wordCount: 10, weakCount: 1, goodCount: 7, perfectCount: 2, averageBefore: 50.86, averageAfter: 51.10, hasDetails: true, selectedCategories: [], starredOnly: false, words };
    await context.route(`${base}/api/japanese-practice/practice-sessions/987654`, route => route.fulfill({ json: { review } }));
    await context.route(`${base}/api/youtube**`, route => route.fulfill({ json: { items: [] } }));
    await context.route("https://www.youtube.com/**", route => route.abort());
    const page = await context.newPage();
    for (const viewport of [{ width: 1920, height: 955 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}/japanese/practice/history/987654`);
      const good = page.getByRole("list", { name: "Good words" });
      await good.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const root = document.querySelector(".practice-overview");
        return root?.style.getPropertyValue("--practice-overview-height");
      });
      if (viewport.width < 1024) {
        for (const label of ["Weak words", "Good words", "Perfect words"]) {
          const list = page.getByRole("list", { name: label });
          const size = await list.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight, overflow: getComputedStyle(element).overflowY }));
          assert.equal(size.overflow, "visible", "phone lists must grow with their words");
          assert.equal(size.height, size.content, "phone lists must not need internal scrolling");
        }
        const positions = await page.evaluate(() => ["Weak", "Good", "Perfect"].map(status => document.querySelector(`[aria-label="${status} words"]`).getBoundingClientRect().top));
        assert.ok(positions[0] < positions[1] && positions[1] < positions[2], "phone sections must be stacked Weak, Good, Perfect");
        await good.scrollIntoViewIfNeeded();
        const before = await page.evaluate(() => window.scrollY);
        const box = await good.boundingBox();
        await page.mouse.move(box.x + box.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, 200);
        await page.waitForFunction(previous => window.scrollY > previous, before);
        assert.equal(await good.evaluate(element => element.scrollTop), 0, "scrolling over Good on a phone must move the page");
        await page.getByRole("list", { name: "Perfect words" }).locator("li").last().scrollIntoViewIfNeeded();
        console.log(`Verified whole-page scrolling at ${viewport.width}×${viewport.height}.`);
        continue;
      }
      const dimensions = await good.evaluate(element => {
        const root = document.querySelector(".practice-overview");
        return { height: element.clientHeight, content: element.scrollHeight, root: root.getBoundingClientRect().height, rootHeight: getComputedStyle(root).height, rootInline: root.getAttribute("style"), section: element.closest("section").getBoundingClientRect().height, grid: element.closest("section").parentElement.getBoundingClientRect().height };
      });
      assert.ok(dimensions.height > 0 && dimensions.content > dimensions.height, `${viewport.width}×${viewport.height}: Good must have bounded height and overflow, ${JSON.stringify(dimensions)}`);
      assert.ok(await good.evaluate(element => element.offsetWidth > element.clientWidth), "the overflowing list must have its own visible scrollbar");
      assert.equal(await good.evaluate(element => getComputedStyle(element).scrollbarWidth), "thin");
      await good.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      const box = await good.boundingBox();
      await page.mouse.move(box.x + box.width / 2, Math.max(0, box.y) + Math.min(box.height, viewport.height - Math.max(0, box.y)) / 2);
      await page.mouse.wheel(0, 150);
      await page.waitForFunction(() => document.querySelector('[aria-label="Good words"]').scrollTop > 0);
      assert.equal(await page.evaluate(() => window.scrollY), before, "wheel over Good must move its own words, not the page");
      await good.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const lastWordVisible = await good.evaluate(element => element.lastElementChild.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom + 1);
      assert.ok(lastWordVisible, "all seven Good words must be reachable inside the card");
      for (const label of ["Weak words", "Perfect words"]) assert.equal(await page.getByRole("list", { name: label }).evaluate(element => element.scrollTop), 0);
      if (viewport.width >= 1024) {
        const bottom = await page.locator(".practice-overview").evaluate(element => element.getBoundingClientRect().bottom);
        assert.ok(bottom <= viewport.height, "desktop overview must fit inside the viewport");
      }
      if (viewport.width === 1920 && process.env.PRACTICE_BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.PRACTICE_BROWSER_SCREENSHOT });
      console.log(`Verified independent list scrolling at ${viewport.width}×${viewport.height}.`);
    }
  } finally { await browser.close(); }
});
