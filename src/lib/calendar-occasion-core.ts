import { auditRecordChange } from "./audit/server";
import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "./owner-policy";
import { workBody, workId, WorkValidationError } from "./work-management/validation";
import { calendarDate, localToday, nextCalendarDate } from "./work-management/dates";
import { getAppTimeZone } from "./time-zone-context";
import { HOLIDAY_DISPLAY_TYPES, holidayDisplayType } from "./holiday-types";
import { selectedHolidayDates, nextHolidayDate } from "./holidays";
import {
  birthdayDate,
  nextBirthdayDate,
  occasionHref,
  type OccasionTarget,
} from "./calendar-annual";
import { appendTaskActivity } from "./work-management/activity-server";

type DB = Prisma.TransactionClient;
export function occasionTarget(value: unknown): OccasionTarget {
  const body = workBody(value, ["kind", "id", "date"]);
  if (body.kind !== "holiday" && body.kind !== "birthday")
    throw new WorkValidationError("Choose a holiday or birthday.");
  return { kind: body.kind, id: workId(body.id), date: calendarDate(body.date) };
}
export async function occasionSource(
  db: DB,
  kind: string,
  id: number,
  requestedDate?: string | null,
) {
  const today = localToday(new Date(), getAppTimeZone());
  if (kind === "holiday") {
    const row = await db.calendarHoliday.findFirst({ where: { id, userId: owner } });
    if (!row) throw new WorkValidationError("Holiday not found.", 404);
    const source = { ...row, options: row.options as Prisma.InputJsonObject };
    const date = requestedDate ? calendarDate(requestedDate) : nextHolidayDate(source, today);
    if (!date || !selectedHolidayDates(source, date, nextCalendarDate(date)).length)
      throw new WorkValidationError("This date is not an occurrence of the selected holiday.", 404);
    const display = HOLIDAY_DISPLAY_TYPES[holidayDisplayType(row.type)];
    return {
      kind: "holiday" as const,
      id,
      date,
      title: row.name,
      type: display.label,
      color: display.color,
      sourceName: typeof source.options.name === "string" ? source.options.name : row.name,
    };
  }
  if (kind !== "birthday") throw new WorkValidationError("Choose a holiday or birthday.");
  const row = await db.calendarBirthday.findFirst({ where: { id, userId: owner } });
  if (!row) throw new WorkValidationError("Birthday not found.", 404);
  const date = requestedDate
    ? calendarDate(requestedDate)
    : nextBirthdayDate(row.month, row.day, today);
  if (date !== birthdayDate(row.month, row.day, Number(date.slice(0, 4))))
    throw new WorkValidationError("This date is not an occurrence of the selected birthday.", 404);
  return {
    kind: "birthday" as const,
    id,
    date,
    title: `${row.name}’s birthday`,
    type: "Birthday",
    color: "#db2777",
  };
}
export async function linkOccasionTask(db: DB, value: unknown, todoId: number) {
  const target = occasionTarget(value);
  const source = await occasionSource(db, target.kind, target.id, target.date);
  const task = await db.todo.findFirst({ where: { id: todoId, userId: owner } });
  if (!task) throw new WorkValidationError("Task not found.", 404);
  const parent = target.kind === "holiday" ? { holidayId: target.id } : { birthdayId: target.id };
  const where = { ...parent, userId: owner, todoId, date: target.date };
  if (!(await db.calendarOccasionTaskLink.findFirst({ where }))) {
    await db.calendarOccasionTaskLink.create({ data: where });
    await auditRecordChange(
      db,
      {
        category: "CALENDAR",
        action: "occasion.task_linked",
        entityType: target.kind,
        entityId: target.id,
        summary: "Task linked to calendar date",
        related: [{ type: "task", id: todoId }],
      },
      null,
      { date: target.date },
    );
    await db.todo.update({ where: { id: todoId }, data: { revision: { increment: 1 } } });
    await appendTaskActivity(db, todoId, "CALENDAR_DATE_LINKED", {
      calendarDate: { before: null, after: { ...target, title: source.title } },
    });
  }
  return source;
}
export async function taskOccasions(db: DB, todoId: number) {
  const rows = await db.calendarOccasionTaskLink.findMany({
    where: { userId: owner, todoId },
    include: { holiday: true, birthday: true },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => {
    const kind = row.holiday ? ("holiday" as const) : ("birthday" as const);
    const id = row.holidayId ?? row.birthdayId!;
    return {
      kind,
      id,
      date: row.date,
      title: row.holiday?.name || `${row.birthday!.name}’s birthday`,
      href: occasionHref(kind, id, row.date),
    };
  });
}
