import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { encode } from "next-auth/jwt";

test(
  "calendar agenda shows every upcoming layer with matching colors, filters and a live cutoff",
  {
    skip: process.env.RUN_CALENDAR_AGENDA_BROWSER_TEST !== "1",
    timeout: 180000,
  },
  async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const browser = await chromium.launch({ headless: true });
    const base = "http://localhost:3002";
    try {
      const context = await browser.newContext({ colorScheme: "dark" });
      const token = await encode({
        secret: "disposable-work-browser-test-secret-not-for-production",
        maxAge: 3600,
        token: { githubId: "89470930", provider: "github", ownerAuthVersion: 1 },
      });
      await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      const errors = [];
      for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 390, height: 844 },
        { width: 320, height: 740 },
      ]) {
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize(viewport);
        await page.clock.install({ time: new Date("2026-11-15T16:00:00Z") });
        const item = (id, title, layer, start, color, allDay = false) => ({
          id,
          title,
          start,
          allDay,
          backgroundColor: layer === "events" || layer === "sessions" ? color : "transparent",
          borderColor: color,
          ...(allDay
            ? {
                display: "list-item",
                classNames: [
                  "calendar-marker",
                  `calendar-${layer === "deadlines" ? "deadline" : layer === "followups" ? "followup" : "milestone"}`,
                ],
              }
            : {}),
          extendedProps: {
            layer,
            plainTitle: title,
            href: `/${layer === "events" || layer === "sessions" ? "events" : "todos"}/902`,
            ...(layer === "events" || layer === "sessions"
              ? { eventId: 902, revision: 1, completed: false }
              : { marker: true }),
          },
        });
        let rows = [
          item("past", "Past appointment", "events", "2026-11-14T12:00:00Z", "#3b82f6"),
          item("ongoing", "Already started", "events", "2026-11-15T15:00:00Z", "#3b82f6"),
          item("soon", "Disappears after starting", "events", "2026-11-15T16:10:00Z", "#3b82f6"),
          item("session", "Study session", "sessions", "2026-11-15T17:00:00Z", "#8b5cf6"),
          item("deadline", "Submit assignment", "deadlines", "2026-11-16", "#15803d", true),
          item("followup", "Contact the requester", "followups", "2026-11-17", "#f59e0b", true),
          item("milestone", "Project launch", "milestones", "2026-11-18", "#38bdf8", true),
          {
            ...item("custom", "Customized activity", "events", "2026-11-19T12:00:00Z", "#16a34a"),
            extendedProps: {
              layer: "events",
              plainTitle: "Customized activity",
              activityType: "School",
              href: "/events/903",
            },
          },
          ...Array.from({ length: 45 }, (_, i) =>
            item(
              `extra${i}`,
              `Future appointment ${i}`,
              "events",
              "2026-11-20T12:00:00Z",
              "#3b82f6",
            ),
          ),
        ];
        if (viewport.width < 768) {
          rows.push({
            ...item("trip", "Multi-day visit", "events", "2026-11-15", "#ec4899", true),
            end: "2026-11-17",
          });
        }
        await page.route("**/api/work-calendar?*", (route) => {
          const params = new URL(route.request().url()).searchParams;
          const layers = (params.get("layers") || "").split(",");
          return route.fulfill({
            json: {
              timeZone: "UTC",
              items: rows.filter((row) => layers.includes(row.extendedProps.layer)),
              tbd: [{ id: 9999, title: "No date yet", date: null, allDayStart: null }],
              tbdTotal: 1,
              tbdPage: 1,
              tbdPageSize: 30,
            },
          });
        });
        await page.route("**/api/events/902", (route) => {
          const body = route.request().postDataJSON();
          rows = rows.map((row) =>
            row.extendedProps.eventId === 902
              ? { ...row, extendedProps: { ...row.extendedProps, completed: body.completed } }
              : row,
          );
          return route.fulfill({ json: {} });
        });
        try {
          await page.goto(base + "/events");
          if (viewport.width < 768) {
            const month = page.locator("[data-mobile-month]");
            const selected = page.getByRole("region", { name: "Selected day events", exact: true });
            await selected.getByText("Study session", { exact: true }).waitFor();
            await selected.getByText("Multi-day visit", { exact: true }).waitFor();
            await month
              .getByRole("button", { name: "November 16, 2026, 2 events", exact: true })
              .click();
            await selected.getByText("Submit assignment", { exact: true }).waitFor();
            await selected.getByText("Multi-day visit", { exact: true }).waitFor();
            await page.screenshot({
              path: `/tmp/calendar-mobile-events-${viewport.width}.png`,
              fullPage: true,
            });
            await month
              .getByRole("button", { name: "November 17, 2026, 1 event", exact: true })
              .click();
            assert.equal(await selected.getByText("Multi-day visit", { exact: true }).count(), 0);
            await month
              .getByRole("button", { name: "November 16, 2026, 2 events", exact: true })
              .click();
            assert.equal(
              await selected
                .locator('[data-calendar-item="deadline"]')
                .evaluate((node) => getComputedStyle(node).borderLeftColor),
              "rgb(21, 128, 61)",
            );
            await month
              .getByRole("button", { name: "November 14, 2026, 1 event", exact: true })
              .click();
            await selected.getByText("Past appointment", { exact: true }).waitFor();
            await month
              .getByRole("button", { name: "November 22, 2026, 0 events", exact: true })
              .click();
            await selected.getByText("No events for this day.", { exact: true }).waitFor();
            assert.equal(await page.locator(".fullcalendar-theme").isVisible(), false);
            assert.equal(
              await page.getByText("Unscheduled events (1)", { exact: true }).isVisible(),
              false,
            );
            assert.equal(
              await page
                .getByRole("region", { name: "Upcoming calendar items", exact: true })
                .isVisible(),
              false,
            );
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            );
            await page.screenshot({
              path: `/tmp/calendar-mobile-${viewport.width}.png`,
              fullPage: true,
            });
            await page.getByRole("button", { name: "Next calendar range", exact: true }).click();
            await selected
              .getByRole("heading", { name: "Tuesday, December 1, 2026", exact: true })
              .waitFor();
            await page.getByRole("button", { name: "Week", exact: true }).click();
            await page.locator(".fc-timeGridWeek-view").waitFor();
            assert.equal(await page.locator(".fullcalendar-theme").isVisible(), true);
            assert.equal(await month.count(), 0);
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.getByRole("button", { name: "Month", exact: true }).click();
            await page.locator(".fc-dayGridMonth-view").waitFor();
            assert.equal(await page.locator("[data-mobile-month]").isVisible(), false);
            assert.ok((await page.locator(".fc-dayGridMonth-view").boundingBox()).width > 500);
            console.log(
              `Verified compact month, day selection, colors, empty dates, navigation and week view at ${viewport.width}px.`,
            );
            continue;
          }
          const agenda = page.getByRole("region", { name: "Upcoming calendar items", exact: true });
          await agenda.getByText("Submit assignment", { exact: true }).waitFor();
          assert.equal(await agenda.locator("[data-calendar-item]").count(), 51);
          assert.equal(await agenda.getByText("Past appointment", { exact: true }).count(), 0);
          assert.equal(await agenda.getByText("Already started", { exact: true }).count(), 0);
          for (const [id, label, color] of [
            ["deadline", "Deadline", "rgb(21, 128, 61)"],
            ["followup", "Follow-up", "rgb(245, 158, 11)"],
            ["milestone", "Milestone", "rgb(56, 189, 248)"],
            ["session", "Work session", "rgb(139, 92, 246)"],
            ["custom", "Event", "rgb(22, 163, 74)"],
          ]) {
            const card = agenda.locator(`[data-calendar-item="${id}"]`);
            await card.getByText(label, { exact: false }).waitFor();
            assert.equal(
              await card.evaluate((node) => getComputedStyle(node).borderLeftColor),
              color,
            );
            const calendarEvent = page
              .locator(
                `.fc-event[aria-label^="${label} · ${rows.find((row) => row.id === id).title}"]`,
              )
              .first();
            await calendarEvent.waitFor();
            const actualColor = await calendarEvent.evaluate(
              (node, marker) =>
                marker
                  ? getComputedStyle(node).borderLeftColor
                  : getComputedStyle(node).backgroundColor,
              ["deadline", "followup", "milestone"].includes(id),
            );
            assert.equal(actualColor, color);
          }
          assert.equal(await agenda.getByText("No date yet", { exact: true }).count(), 0);
          const unscheduled = page
            .locator("details")
            .filter({ has: page.locator("summary", { hasText: "Unscheduled events" }) });
          assert.equal(await unscheduled.evaluate((node) => !!node.closest("aside")), false);
          assert.equal(await page.getByRole("list", { name: "Calendar color legend" }).count(), 0);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          );
          await page.screenshot({
            path: `/tmp/calendar-agenda-${viewport.width}.png`,
            fullPage: true,
          });
          await page.clock.fastForward(11 * 60000);
          await agenda.locator('[data-calendar-item="soon"]').waitFor({ state: "detached" });
          await agenda
            .locator('[data-calendar-item="session"]')
            .getByRole("button", { name: "Mark completed", exact: true })
            .click();
          await agenda
            .locator('[data-calendar-item="session"]')
            .getByText("✓ Completed", { exact: true })
            .waitFor();
          await page.getByRole("button", { name: "Show search and filters", exact: true }).click();
          // Refresh changes an existing marker's color without remounting it.
          rows = rows.map((row) =>
            row.id === "deadline" ? { ...row, borderColor: "#a855f7" } : row,
          );
          await page.getByRole("button", { name: "Refresh calendar", exact: true }).click();
          await page.waitForFunction(() => {
            const marker = document.querySelector(
              '.fc-event[aria-label^="Deadline · Submit assignment"]',
            );
            return marker && getComputedStyle(marker).borderLeftColor === "rgb(168, 85, 247)";
          });
          const followupFilter = page.getByRole("checkbox", { name: "↻ Follow-ups", exact: true });
          await followupFilter.uncheck();
          await agenda.locator('[data-calendar-item="followup"]').waitFor({ state: "detached" });
          await followupFilter.check();
          await agenda.locator('[data-calendar-item="followup"]').waitFor();
          console.log(
            `Verified all layers, 51 upcoming rows, matching colors, custom activity colors, live cutoff and completion at ${viewport.width}px.`,
          );
        } catch (error) {
          await page
            .screenshot({ path: "/tmp/calendar-agenda-failure.png", fullPage: true, timeout: 5000 })
            .catch(() => {});
          throw error;
        } finally {
          await page.close();
        }
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
