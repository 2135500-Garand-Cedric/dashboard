import { createHash } from "node:crypto";
import Holidays, { type HolidaysTypes } from "date-holidays";
import type { Prisma } from "@/generated/prisma";
import { WorkValidationError } from "./work-management/validation";
import type { HolidayOption, HolidayType } from "./holiday-types";

const source = new Holidays();
const countries = source.getCountries("en");
const supportedTypes = new Set(["public", "bank", "optional", "observance"]);
export type HolidayDefinition = HolidayOption & { rule: string; options: Prisma.InputJsonObject };
const cache = new Map<string, { year: number; choices: HolidayDefinition[] }>();

export function holidayCountries() {
  return Object.entries(countries)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function holidayCountry(value: unknown): string {
  if (typeof value !== "string" || !Object.hasOwn(countries, value))
    throw new WorkValidationError("Choose a valid holiday country.");
  return value;
}
export function holidayCalendar(country: string, state = "", region = "") {
  const calendar = new Holidays(
    { country, ...(state ? { state } : {}), ...(region ? { region } : {}) },
    { languages: ["en"], types: ["public", "bank", "optional", "observance"] },
  );
  if (country === "CA") {
    if (!calendar.getRule("easter 1"))
      calendar.setHoliday("easter 1", { name: "Easter Monday", type: "optional" });
    calendar.setHoliday("11-11 and if saturday,sunday then next monday", {
      name: "Remembrance Day",
      type: "bank",
    });
  }
  return calendar;
}
function definitions(country: string, state: string, region: string, location: string) {
  const calendar = holidayCalendar(country, state, region);
  const rules = calendar.getRules() as unknown as HolidaysTypes.HolidayRule[];
  const year = new Date().getUTCFullYear();
  return rules.flatMap((item): HolidayDefinition[] => {
    if (!item.name || !supportedTypes.has(String(item.type))) return [];
    // Do not offer old one-off commemorations or rules that have expired.
    if (/^\d{4}-/.test(item.rule) && Number(item.rule.slice(0, 4)) < year) return [];
    if (
      item.active?.length &&
      item.active.every((range) => range.to && new Date(range.to).getUTCFullYear() < year)
    )
      return [];
    const name =
      typeof item.name === "string" ? item.name : item.name.en || Object.values(item.name)[0];
    if (!name) return [];
    const { rule, ...options } = item;
    if (options.active)
      options.active = options.active.map((range) => {
        const date = (value: Date | string) =>
          value instanceof Date
            ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
            : value;
        return {
          ...(range.from ? { from: date(range.from) } : {}),
          ...(range.to ? { to: date(range.to) } : {}),
        };
      });
    return [
      {
        key: createHash("sha256")
          .update(JSON.stringify([country, state, region, rule]))
          .digest("hex"),
        country,
        state,
        region,
        location,
        rule,
        name,
        type: item.type as HolidayType,
        options: JSON.parse(JSON.stringify({ ...options, name })) as Prisma.InputJsonObject,
      },
    ];
  });
}
export function holidayChoices(value: unknown) {
  const country = holidayCountry(value);
  const year = new Date().getUTCFullYear();
  const cached = cache.get(country);
  if (cached?.year === year) return cached.choices;
  const choices = definitions(country, "", "", "National");
  const signature = (item: HolidayDefinition) =>
    JSON.stringify([item.rule, item.name, item.type, item.options]);
  const national = new Set(choices.map(signature));
  for (const [state, label] of Object.entries(source.getStates(country, "en") || {})) {
    const stateChoices = definitions(country, state, "", label);
    choices.push(...stateChoices.filter((item) => !national.has(signature(item))));
    const inherited = new Set([...national, ...stateChoices.map(signature)]);
    for (const [region, regionLabel] of Object.entries(
      source.getRegions(country, state, "en") || {},
    ))
      choices.push(
        ...definitions(country, state, region, `${label} / ${regionLabel}`).filter(
          (item) => !inherited.has(signature(item)),
        ),
      );
  }
  choices.sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  cache.set(country, { year, choices });
  return choices;
}
export function holidayOption(item: HolidayDefinition): HolidayOption {
  return {
    key: item.key,
    country: item.country,
    state: item.state,
    region: item.region,
    location: item.location,
    name: item.name,
    type: item.type,
  };
}
export function holidayCountryName(country: string) {
  return countries[country] || country;
}
export function selectedHolidayDates(
  selection: Pick<HolidayDefinition, "country" | "state" | "region" | "rule" | "options">,
  from: string,
  through: string,
) {
  const calendar = holidayCalendar(selection.country, selection.state, selection.region);
  // Retain the selected rule and its exceptions/active ranges even when a library
  // update changes the catalogue. Rules are always saved from trusted choices.
  // The library normalizes active ranges in place. Give it a fresh copy so
  // repeated year calculations never mutate stored/cache definitions.
  calendar.setHoliday(
    selection.rule,
    JSON.parse(JSON.stringify(selection.options)) as HolidaysTypes.HolidayOptions,
  );
  const dates: { date: string; name: string; type: string }[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(through.slice(0, 4)); year++)
    for (const holiday of calendar.getHolidays(year, "en"))
      if (holiday.rule === selection.rule) {
        const date = holiday.date.slice(0, 10);
        if (date >= from && date < through)
          dates.push({ date, name: holiday.name, type: holiday.type });
      }
  return dates.sort((a, b) => a.date.localeCompare(b.date));
}

// Upgrade the former whole-region preference into the equivalent individual
// choices once. This is not used to decide which holidays new users can select.
export function previousHolidayChoices(country: string, state: string, includeBank: boolean) {
  const all = holidayChoices(country);
  const calendar = holidayCalendar(country, state);
  const rules = calendar.getRules() as unknown as HolidaysTypes.HolidayRule[];
  const result: HolidayDefinition[] = [];
  for (const rule of rules) {
    if (
      !rule.name ||
      !(
        rule.type === "public" ||
        (includeBank && rule.type === "bank") ||
        (country === "CA" && rule.rule === "easter 1")
      )
    )
      continue;
    const name =
      typeof rule.name === "string" ? rule.name : rule.name.en || Object.values(rule.name)[0];
    const matches = all.filter(
      (item) => item.rule === rule.rule && item.name === name && item.type === rule.type,
    );
    const match =
      matches.find((item) => item.state === state && !item.region) ||
      matches.find((item) => !item.state);
    if (match) result.push(match);
  }
  return result;
}

export function nextHolidayDate(
  selection: Pick<HolidayDefinition, "country" | "state" | "region" | "rule" | "options">,
  today: string,
) {
  for (let year = Number(today.slice(0, 4)); year < Number(today.slice(0, 4)) + 9; year++) {
    const date = selectedHolidayDates(
      selection,
      today > `${year}-01-01` ? today : `${year}-01-01`,
      `${year + 1}-01-01`,
    )[0]?.date;
    if (date) return date;
  }
  return null;
}
