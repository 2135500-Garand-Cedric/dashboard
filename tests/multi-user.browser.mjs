import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
const enabled = process.env.RUN_MULTI_USER_BROWSER_TEST === "1";
test(
  "invite-only member setup, isolated APIs, owner management, permissions and responsive UI",
  { skip: !enabled, timeout: 180000 },
  async () => {
    const fixture = JSON.parse(fs.readFileSync("/tmp/multi-browser-fixture.json", "utf8"));
    const require = createRequire(import.meta.url),
      { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3000";
    const caps = [
      "japanese.vocabulary.read",
      "japanese.vocabulary.manage",
      "japanese.practice",
      "japanese.statistics.read",
      "japanese.history.read",
    ];
    let invitationId;
    try {
      const owner = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        colorScheme: "dark",
      });
      await owner.addCookies([
        { name: "next-auth.session-token", value: fixture.ownerToken, url: base },
      ]);
      const op = await owner.newPage();
      const errors = [];
      op.on("pageerror", (e) => errors.push(e.message));
      const ownerBefore = await (await owner.request.get(base + "/api/account")).json();
      assert.equal(ownerBefore.actor.id, 1);
      await op.goto(base + "/admin/users");
      await op.getByRole("heading", { name: "User management", exact: true }).waitFor();
      await op.getByRole("button", { name: "Invite someone", exact: true }).click();
      await op.getByLabel("Invitation label", { exact: true }).fill(fixture.tag + "-UI");
      await op.getByRole("button", { name: "Create invitation link", exact: true }).click();
      const link = op.getByLabel("Invitation link", { exact: true });
      await link.waitFor();
      const url = await link.inputValue();
      assert.match(url, /#token=/);
      await op.keyboard.press("Escape");
      const invites = await (await owner.request.get(base + "/api/admin/users")).json();
      invitationId = invites.invitations.find((i) => i.label === fixture.tag + "-UI").id;
      const anon = await browser.newContext();
      const ip = await anon.newPage();
      await ip.goto(url);
      await ip.getByRole("link", { name: "Continue to sign in", exact: true }).waitFor();
      assert.equal(new URL(ip.url()).hash, "");
      const denied = await anon.request.get(base + "/api/admin/users");
      assert.equal(denied.status(), 401);
      await anon.close();
      const member = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
      });
      await member.addCookies([
        { name: "next-auth.session-token", value: fixture.memberToken, url: base },
      ]);
      const mp = await member.newPage();
      mp.on("pageerror", (e) => errors.push(e.message));
      const forbiddenRequests = [];
      mp.on("request", (r) => {
        if (/\/api\/(notifications|search|finance|weekly-report)/.test(r.url()))
          forbiddenRequests.push(r.url());
      });
      await mp.goto(base + "/onboarding");
      if (new URL(mp.url()).pathname === "/onboarding") {
        await mp.getByRole("heading", { name: "Set up Japanese practice", exact: true }).waitFor();
        await mp.getByLabel("Display name", { exact: true }).fill("Browser Learner");
        await mp.getByRole("button", { name: "Start learning", exact: true }).click();
      }
      await mp.waitForURL("**/japanese/practice", { timeout: 60000 });
      await mp.getByRole("button", { name: "Start Practice", exact: true }).waitFor();
      const openNavigation = mp.getByRole("button", { name: "Open navigation", exact: true });
      await openNavigation.click();
      const navigation = mp.getByRole("navigation", { name: "Dashboard navigation" });
      await navigation.getByRole("link", { name: "Japanese Statistics", exact: true }).waitFor();
      await mp.waitForFunction(() => {
        const nav = document.getElementById("dashboard-navigation");
        return nav?.parentElement?.parentElement?.getBoundingClientRect().left === 0;
      });
      await mp.screenshot({ path: "/tmp/member-navigation-phone.png" });
      await navigation.getByRole("link", { name: "Japanese Practice", exact: true }).click();
      await openNavigation.waitFor();
      assert.equal(await mp.getByRole("link", { name: "Finance", exact: true }).count(), 0);
      assert.deepEqual(forbiddenRequests, []);
      assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      for (const path of [
        "/api/finance/accounts",
        "/api/todos",
        "/api/admin/users",
        "/api/notifications/inbox",
      ])
        assert.equal((await member.request.get(base + path)).status(), 403, path);
      assert.equal((await member.request.post(base + "/api/logs", { data: {} })).status(), 403);
      const words = await (
        await member.request.get(base + "/api/japanese-practice/vocabulary")
      ).json();
      assert.ok(words.length > 0);
      const own = words[0];
      assert.equal(
        (
          await member.request.patch(`${base}/api/japanese-practice/vocabulary/${own.id}`, {
            data: { starred: true },
          })
        ).status(),
        200,
      );
      const count = await (
        await member.request.get(base + "/api/japanese-practice/vocabulary/starred")
      ).json();
      assert.equal(count.count, 1);
      const changed = await member.request.post(base + "/api/account", {
        data: {
          action: "profile",
          name: "Browser Learner",
          timeZone: "Asia/Tokyo",
          userId: 1,
          role: "OWNER",
        },
      });
      assert.equal(changed.status(), 200);
      const after = await (await owner.request.get(base + "/api/account")).json();
      assert.equal(after.actor.name, ownerBefore.actor.name);
      assert.equal(after.actor.timeZone, ownerBefore.actor.timeZone);
      const noPractice = caps.filter((c) => c !== "japanese.practice");
      assert.equal(
        (
          await owner.request.post(base + "/api/admin/users", {
            data: {
              action: "update",
              userId: fixture.memberId,
              permissions: noPractice,
              active: true,
            },
          })
        ).status(),
        200,
      );
      assert.equal(
        (
          await member.request.post(base + "/api/japanese-practice/vocabulary", {
            data: { activity: 1, nbWords: 10 },
          })
        ).status(),
        403,
      );
      await mp.goto(base + "/japanese/practice");
      await mp.waitForURL("**/settings/account?denied=1");
      assert.equal(
        (
          await owner.request.post(base + "/api/admin/users", {
            data: { action: "update", userId: fixture.memberId, permissions: caps, active: true },
          })
        ).status(),
        200,
      );
      await mp.goto(base + "/japanese/vocabulary");
      await mp.getByRole("link", { name: "Add Vocabulary", exact: true }).waitFor();
      const cards = mp.getByRole("region", { name: "Vocabulary cards" });
      await cards.locator("article").first().waitFor();
      assert.equal(await mp.locator(".vocabulary-table").isVisible(), false);
      assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const percentageSort = cards.getByRole("button", {
        name: "Sort by Percentage, ascending",
        exact: true,
      });
      await percentageSort.click();
      assert.equal(
        await cards
          .getByRole("button", { name: "Sort by Percentage, descending", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await mp.getByRole("button", { name: "Filters", exact: true }).click();
      assert.equal(await mp.locator("#vocabulary-category-filters").isVisible(), true);
      await mp.getByRole("button", { name: "Hide filters", exact: true }).click();
      assert.equal(await mp.locator("#vocabulary-category-filters").isVisible(), false);
      const star = cards.getByRole("button", { name: /^Star / }).first();
      await star.click();
      await mp.waitForFunction(
        () => document.querySelectorAll('[aria-label^="Unstar "]').length >= 2,
      );
      await mp.screenshot({ path: "/tmp/member-vocabulary-phone.png" });
      await cards.locator("article a").first().click();
      await mp.waitForURL(/\/japanese\/vocabulary\/\d+$/);
      await op.goto(base + "/japanese/vocabulary");
      await op.locator(".vocabulary-table tbody tr").first().waitFor();
      assert.equal(await op.locator(".vocabulary-table").isVisible(), true);
      await op.setViewportSize({ width: 375, height: 812 });
      await op
        .getByRole("region", { name: "Vocabulary cards" })
        .locator("article")
        .first()
        .waitFor();
      assert.equal(await op.locator(".vocabulary-table").isVisible(), false);
      assert.ok(await op.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await mp.goto(base + "/settings/account");
      await mp.getByRole("heading", { name: "My account", exact: true }).waitFor();
      await mp.getByRole("button", { name: "Sign out", exact: true }).click();
      await mp.waitForURL("**/signin");
      assert.equal((await member.request.get(base + "/api/account")).status(), 401);
      assert.deepEqual(errors, []);
      await member.close();
      await owner.close();
    } finally {
      await browser.close();
      if (invitationId)
        fs.writeFileSync("/tmp/multi-browser-invitation-id", invitationId, { mode: 0o600 });
    }
  },
);
