import { shiftDay, monday } from "./calendar";
export { shiftDay, monday } from "./calendar";
import { calendarDate, dayStart, localToday } from "@/lib/work-management/dates";
import { CURRENCIES } from "@/lib/finance/validation";

export class WeeklyInputError extends Error {}
export const ITEM_SECTIONS = [
  "completed",
  "reopened",
  "cancelled",
  "attention",
  "projects",
  "vocab",
  "kanji",
  "created",
  "changed",
  "unmatched",
] as const;
export type ItemSection = (typeof ITEM_SECTIONS)[number];
export function weeklyPeriod(params: URLSearchParams, timeZone: string, actualNow = new Date()) {
  let now = actualNow;
  if (params.has("asOf")) {
    now = new Date(params.get("asOf") || "");
    if (
      !Number.isFinite(now.getTime()) ||
      now > actualNow ||
      actualNow.getTime() - now.getTime() > 86400000
    )
      throw new WeeklyInputError("Refresh the report to load more records.");
  }
  const today = localToday(now, timeZone),
    currentWeek = monday(today);
  const latestWeek = shiftDay(currentWeek, -7);
  let week = params.get("week") || latestWeek;
  try {
    week = calendarDate(week);
  } catch {
    throw new WeeklyInputError("Choose a valid Monday date.");
  }
  if (monday(week) !== week || week > latestWeek)
    throw new WeeklyInputError("Choose a completed week (Monday to Sunday).");
  const currency = params.get("currency") || "CAD",
    dataset = params.get("dataset") || "all";
  if (!CURRENCIES.includes(currency) || !["personal", "examples", "all"].includes(dataset))
    throw new WeeklyInputError("Choose a valid currency and finance dataset.");
  const endDay = shiftDay(week, 7);
  if (endDay > "9999-12-31") throw new WeeklyInputError("Choose an earlier week.");
  const start = dayStart(week, timeZone),
    end = dayStart(endDay, timeZone);
  const current = false;
  return {
    week,
    endDay,
    lastDay: shiftDay(week, 6),
    start,
    end,
    cutoff: end,
    now,
    today,
    currentWeek,
    current,
    timeZone,
    currency,
    dataset: dataset as "personal" | "examples" | "all",
    financeTo: shiftDay(week, 6),
  };
}
export type WeeklyPeriod = ReturnType<typeof weeklyPeriod>;
export type ReportItem = {
  id: string;
  title: string;
  subtitle: string | null;
  when: string | null;
  href: string | null;
  badges: string[];
};
export type ReportList = { total: number; items: ReportItem[]; nextCursor: string | null };
export function cursorFor(offset: number, section: ItemSection, period: WeeklyPeriod) {
  return Buffer.from(
    JSON.stringify({
      offset,
      section,
      week: period.week,
      timeZone: period.timeZone,
      currency: period.currency,
      dataset: period.dataset,
      asOf: period.now.toISOString(),
    }),
  ).toString("base64url");
}
export function readCursor(params: URLSearchParams, timeZone: string, now = new Date()) {
  const section = params.get("section") as ItemSection;
  if (!ITEM_SECTIONS.includes(section))
    throw new WeeklyInputError("Choose a valid report section.");
  let offset = 0;
  if (params.has("cursor")) {
    try {
      const value = JSON.parse(Buffer.from(params.get("cursor") || "", "base64url").toString());
      if (
        !Number.isSafeInteger(value.offset) ||
        value.offset < 0 ||
        value.offset > 1000000 ||
        value.section !== section ||
        value.week !== params.get("week") ||
        value.timeZone !== timeZone ||
        value.currency !== (params.get("currency") || "CAD") ||
        value.dataset !== (params.get("dataset") || "all") ||
        typeof value.asOf !== "string"
      )
        throw new Error();
      offset = value.offset;
      params = new URLSearchParams(params);
      params.set("asOf", value.asOf);
    } catch {
      throw new WeeklyInputError("Invalid report page. Refresh and try again.");
    }
  }
  return { section, offset, period: weeklyPeriod(params, timeZone, now) };
}
export function reportList(
  total: number,
  items: ReportItem[],
  offset: number,
  section: ItemSection,
  period: WeeklyPeriod,
): ReportList {
  return {
    total,
    items,
    nextCursor:
      offset + items.length < total ? cursorFor(offset + items.length, section, period) : null,
  };
}
