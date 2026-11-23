import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
const { holidays } = loadWorkServices({});

test("country choices include regional and bank holidays with stable identifiers", () => {
  const ca = holidays.holidayChoices("CA");
  assert.ok(ca.some((item) => item.state === "QC" && item.rule === "06-24"));
  assert.ok(ca.some((item) => item.state === "BC" && item.name.includes("British Columbia")));
  assert.ok(ca.some((item) => item.type === "bank" && item.name === "Remembrance Day"));
  assert.equal(new Set(ca.map((item) => item.key)).size, ca.length);
  assert.deepEqual(
    ca.map((item) => item.key),
    holidays.holidayChoices("CA").map((item) => item.key),
  );
  assert.throws(() => holidays.holidayChoices("__proto__"), /valid holiday country/);
  assert.throws(() => holidays.holidayChoices("INVALID"), /valid holiday country/);
});
test("selected moving holidays compute their next date after today and through year boundaries", () => {
  const choice = holidays
    .holidayChoices("CA")
    .find((item) => !item.state && item.name === "Easter Monday");
  assert.equal(holidays.nextHolidayDate(choice, "2026-04-06"), "2026-04-06");
  assert.equal(holidays.nextHolidayDate(choice, "2026-04-07"), "2027-03-29");
  assert.equal(holidays.nextHolidayDate(choice, "2026-12-31"), "2027-03-29");
});
test("old Quebec preferences migrate the holidays that were enabled without enabling all observances", () => {
  const withoutBank = holidays.previousHolidayChoices("CA", "QC", false);
  const withBank = holidays.previousHolidayChoices("CA", "QC", true);
  assert.ok(withoutBank.some((item) => item.name === "Easter Monday"));
  assert.ok(withoutBank.some((item) => item.rule === "06-24" && item.state === "QC"));
  assert.ok(!withoutBank.some((item) => item.type === "bank"));
  assert.ok(withBank.some((item) => item.name === "Remembrance Day" && item.type === "bank"));
  assert.ok(!withBank.some((item) => item.name === "Halloween"));
});

test("active-date rules remain reusable across year calculations", () => {
  const jp = holidays.holidayChoices("JP").find((item) => item.name === "Coming of Age Day");
  const before = JSON.stringify(jp.options);
  assert.equal(holidays.nextHolidayDate(jp, "2026-12-31"), "2027-01-11");
  assert.equal(holidays.nextHolidayDate(jp, "2027-12-31"), "2028-01-10");
  assert.equal(JSON.stringify(jp.options), before);
});
