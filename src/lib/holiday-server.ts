import { compareNextDate, occasionHref } from "./calendar-annual";
import { prisma } from "@/lib/prisma";
import type { Prisma, CalendarHoliday } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "./owner-policy";
import { workTransaction } from "./work-management/server";
import { HOLIDAY_DISPLAY_TYPES, holidayDisplayType } from "./holiday-types";
import { workBody, workText, WorkValidationError } from "./work-management/validation";
import { getAppTimeZone } from "./time-zone-context";
import { localToday } from "./work-management/date-format";
import { nextCalendarDate } from "./work-management/dates";
import {
  holidayChoices,
  holidayOption,
  nextHolidayDate,
  holidayCountries,
  holidayCountryName,
  previousHolidayChoices,
  selectedHolidayDates,
  type HolidayDefinition,
} from "./holidays";

function columns(choice: HolidayDefinition) {
  return { userId: owner, ...choice };
}
export async function initializeHolidaySelections() {
  const current = await prisma.user.findUnique({
    where: { id: owner },
    select: { holidaySelectionConfigured: true },
  });
  if (!current || current.holidaySelectionConfigured) return;
  await workTransaction(async (db) => {
    const user = await db.user.findUnique({ where: { id: owner } });
    if (!user || user.holidaySelectionConfigured) return;
    const choices = user.holidayCountry
      ? previousHolidayChoices(user.holidayCountry, user.holidayRegion || "", user.holidayBanks)
      : [];
    if (choices.length)
      await db.calendarHoliday.createMany({ data: choices.map(columns), skipDuplicates: true });
    await db.user.update({
      where: { id: owner },
      data: {
        holidaySelectionConfigured: true,
        holidayCountry: null,
        holidayRegion: null,
        holidayBanks: false,
      },
    });
  });
}
function definition(row: CalendarHoliday) {
  return {
    country: row.country,
    state: row.state,
    region: row.region,
    rule: row.rule,
    options: row.options as Prisma.InputJsonObject,
  };
}
export async function selectedHolidays(now = new Date()) {
  const rows = await prisma.calendarHoliday.findMany({
    where: { userId: owner },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const today = localToday(now, getAppTimeZone());
  return rows
    .map((row) => {
      const source = definition(row);
      const nextDate = nextHolidayDate(source, today);
      return {
        id: row.id,
        key: row.key,
        country: row.country,
        countryName: holidayCountryName(row.country),
        state: row.state,
        region: row.region,
        location: row.location,
        name: row.name,
        type: holidayDisplayType(row.type),
        sourceName: typeof source.options.name === "string" ? source.options.name : row.name,
        nextDate,
      };
    })
    .sort(compareNextDate);
}
export async function holidayOverview(country?: string | null) {
  await initializeHolidaySelections();
  return {
    countries: holidayCountries(),
    choices: country ? holidayChoices(country).map(holidayOption) : [],
    selected: await selectedHolidays(),
  };
}
export async function addHoliday(value: unknown) {
  const body = workBody(value, ["country", "key", "name", "type"]);
  const appearance = holidayAppearance(body);
  if (typeof body.key !== "string" || !/^[a-f0-9]{64}$/.test(body.key))
    throw new WorkValidationError("Choose a holiday to add.");
  const choice = holidayChoices(body.country).find((item) => item.key === body.key);
  if (!choice)
    throw new WorkValidationError(
      "This holiday does not belong to the selected country. Choose it again.",
    );
  await initializeHolidaySelections();
  return workTransaction((db) =>
    db.calendarHoliday.upsert({
      where: { userId_key: { userId: owner, key: choice.key } },
      create: { ...columns(choice), ...appearance },
      update: {},
    }),
  );
}
function holidayAppearance(body: Record<string, unknown>) {
  const data: { name?: string; type?: string } = {};
  if (body.name !== undefined) data.name = workText(body.name, "display name", 500)!;
  if (body.type !== undefined) {
    if (typeof body.type !== "string" || !Object.hasOwn(HOLIDAY_DISPLAY_TYPES, body.type))
      throw new WorkValidationError("Choose Holiday, Bank holiday or Important date.");
    data.type = body.type;
  }
  return data;
}
export async function updateHoliday(id: number, value: unknown) {
  const body = workBody(value, ["name", "type"]);
  const data = holidayAppearance(body);
  if (!Object.keys(data).length)
    throw new WorkValidationError("Enter a display name or choose a type.");
  return workTransaction(async (db) => {
    const result = await db.calendarHoliday.updateMany({ where: { id, userId: owner }, data });
    if (!result.count) throw new WorkValidationError("Selected holiday not found.", 404);
    return db.calendarHoliday.findFirst({ where: { id, userId: owner } });
  });
}
export async function removeHoliday(id: number) {
  await initializeHolidaySelections();
  return workTransaction(async (db) => {
    const result = await db.calendarHoliday.deleteMany({ where: { id, userId: owner } });
    if (!result.count) throw new WorkValidationError("Selected holiday not found.", 404);
    return { ok: true };
  });
}
export async function holidayItems(
  db: Prisma.TransactionClient,
  from: string,
  through: string,
  onlyIds?: number[],
) {
  const rows = await db.calendarHoliday.findMany({
    where: { userId: owner, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    orderBy: { id: "asc" },
  });
  const unique = new Map<string, { id: number; date: string; name: string; type: string }>();
  for (const row of rows)
    for (const date of selectedHolidayDates(definition(row), from, through)) {
      const type = holidayDisplayType(row.type);
      const key = `${date.date}:${row.name}:${type}`;
      if (!unique.has(key)) unique.set(key, { id: row.id, date: date.date, name: row.name, type });
    }
  return [...unique.values()].map((holiday) => ({
    id: `holiday:${holiday.id}:${holiday.date}`,
    title: `✦ ${holiday.name}`,
    start: holiday.date,
    end: nextCalendarDate(holiday.date),
    allDay: true,
    editable: false,
    backgroundColor: HOLIDAY_DISPLAY_TYPES[holidayDisplayType(holiday.type)].color,
    borderColor: HOLIDAY_DISPLAY_TYPES[holidayDisplayType(holiday.type)].color,
    extendedProps: {
      layer: "holidays",
      kind: "HOLIDAY",
      plainTitle: holiday.name,
      activityType: HOLIDAY_DISPLAY_TYPES[holidayDisplayType(holiday.type)].label,
      href: occasionHref("holiday", holiday.id, holiday.date),
    },
  }));
}
