import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";
const dates = loadWorkModule("src/lib/calendar-annual.ts");
test("birthday dates roll into the next year, include today, and observe February 29 on February 28", () => {
  assert.equal(dates.nextBirthdayDate(12, 25, "2026-11-19"), "2026-12-25");
  assert.equal(dates.nextBirthdayDate(1, 1, "2026-11-19"), "2027-01-01");
  assert.equal(dates.nextBirthdayDate(11, 19, "2026-11-19"), "2026-11-19");
  assert.equal(dates.birthdayDate(2, 29, 2027), "2027-02-28");
  assert.equal(dates.birthdayDate(2, 29, 2028), "2028-02-29");
});
test("annual settings lists sort by the next date, with unknown dates last and stable ties", () => {
  const list = [
    { id: 3, name: "Unknown", nextDate: null },
    { id: 2, name: "January", nextDate: "2027-01-01" },
    { id: 1, name: "Christmas", nextDate: "2026-12-25" },
  ];
  assert.deepEqual(
    list.sort(dates.compareNextDate).map((item) => item.id),
    [1, 2, 3],
  );
});
test("birthday input is validated before any database work", async () => {
  const { birthdays } = loadWorkServices({});
  for (const invalid of [
    { name: "", month: 1, day: 1 },
    { name: "Alex", month: 13, day: 1 },
    { name: "Alex", month: 4, day: 31 },
    { name: "Alex", month: 2, day: 30 },
  ])
    await assert.rejects(() => birthdays.saveBirthday(invalid));
});
