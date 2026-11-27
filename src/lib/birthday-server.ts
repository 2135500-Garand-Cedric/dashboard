import { auditedCommand } from "@/lib/audit/command";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "./owner-policy";
import { workTransaction } from "./work-management/server";
import { workBody, workId, workText, WorkValidationError } from "./work-management/validation";
import { calendarDate, localToday, nextCalendarDate } from "./work-management/dates";
import { getAppTimeZone } from "./time-zone-context";
import { birthdayDate, nextBirthdayDate, compareNextDate, occasionHref } from "./calendar-annual";
import { appendTaskActivity } from "./work-management/activity-server";

export async function listBirthdays(now = new Date()) {
  const today = localToday(now, getAppTimeZone());
  const rows = await prisma.calendarBirthday.findMany({ where: { userId: owner } });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      month: row.month,
      day: row.day,
      nextDate: nextBirthdayDate(row.month, row.day, today),
    }))
    .sort(compareNextDate);
}
function birthdayInput(value: unknown) {
  const body = workBody(value, ["name", "month", "day"]);
  const name = workText(body.name, "person's name", 200)!.normalize("NFC");
  const month = workId(body.month),
    day = workId(body.day);
  calendarDate(`2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  return { name, month, day };
}
export async function saveBirthday(value: unknown, id?: number) {
  const data = birthdayInput(value);
  return workTransaction(async (db) => {
    return auditedCommand(
      db,
      {
        model: "calendarBirthday",
        category: "SETTINGS",
        entityType: "birthday",
        label: "Birthday",
        id: id,
      },
      async () => {
        const previous = id
          ? await db.calendarBirthday.findFirst({ where: { id, userId: owner } })
          : null;
        if (id && !previous) throw new WorkValidationError("Birthday not found.", 404);
        const duplicate = await db.calendarBirthday.findFirst({
          where: {
            userId: owner,
            name: { equals: data.name, mode: "insensitive" },
            month: data.month,
            day: data.day,
            ...(id ? { id: { not: id } } : {}),
          },
        });
        if (duplicate) {
          if (!id) return duplicate;
          throw new WorkValidationError("This person and birthday are already in your list.", 409);
        }
        const row = id
          ? await db.calendarBirthday.update({ where: { id, userId: owner }, data })
          : await db.calendarBirthday.create({ data: { userId: owner, ...data } });
        if (previous && (previous.month !== row.month || previous.day !== row.day)) {
          const links = await db.calendarOccasionTaskLink.findMany({
            where: { userId: owner, birthdayId: row.id },
          });
          for (const link of links) {
            const date = birthdayDate(row.month, row.day, Number(link.date.slice(0, 4)));
            await db.calendarOccasionTaskLink.update({ where: { id: link.id }, data: { date } });
            await db.todo.update({
              where: { id: link.todoId, userId: owner },
              data: { revision: { increment: 1 } },
            });
            await appendTaskActivity(db, link.todoId, "CALENDAR_DATE_RESCHEDULED", {
              calendarDate: {
                before: { kind: "birthday", id: row.id, date: link.date },
                after: { kind: "birthday", id: row.id, date },
              },
            });
          }
        }
        return row;
      },
    );
  });
}
export async function deleteBirthday(id: number) {
  return workTransaction(async (db) => {
    return auditedCommand(
      db,
      {
        model: "calendarBirthday",
        category: "SETTINGS",
        entityType: "birthday",
        label: "Birthday",
        id: id,
      },
      async () => {
        const result = await db.calendarBirthday.deleteMany({ where: { id, userId: owner } });
        if (!result.count) throw new WorkValidationError("Birthday not found.", 404);
        return { ok: true };
      },
    );
  });
}
export async function birthdayItems(
  db: Prisma.TransactionClient,
  from: string,
  through: string,
  onlyIds?: number[],
) {
  const rows = await db.calendarBirthday.findMany({
    where: { userId: owner, ...(onlyIds ? { id: { in: onlyIds } } : {}) },
    orderBy: { id: "asc" },
  });
  const items = [];
  for (const row of rows)
    for (let year = Number(from.slice(0, 4)); year <= Number(through.slice(0, 4)); year++) {
      const date = birthdayDate(row.month, row.day, year);
      if (date < from || date >= through) continue;
      items.push({
        id: `birthday:${row.id}:${date}`,
        title: `✧ ${row.name}’s birthday`,
        start: date,
        end: nextCalendarDate(date),
        allDay: true,
        editable: false,
        backgroundColor: "#db2777",
        borderColor: "#db2777",
        extendedProps: {
          layer: "birthdays",
          kind: "BIRTHDAY",
          plainTitle: `${row.name}’s birthday`,
          activityType: "Birthday",
          href: occasionHref("birthday", row.id, date),
        },
      });
    }
  return items;
}
