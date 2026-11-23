import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { FREQUENCIES, snapshotTemplate, dateInZone, shiftDate } from "@/lib/recurrence/rules.mjs";
import { ensureSeriesWindow } from "@/lib/recurrence/engine.mjs";
import { calendarDate } from "./dates";
import { WorkValidationError, workBody } from "./validation";

type DB = Prisma.TransactionClient;
export function repeatRule(value: unknown) {
  const body = workBody(value, ["frequency", "until"]);
  if (!FREQUENCIES.includes(String(body.frequency)))
    throw new WorkValidationError("Choose daily, weekly, monthly or yearly repeat.");
  return {
    frequency: String(body.frequency),
    until: body.until == null || body.until === "" ? null : calendarDate(body.until),
  };
}
export async function attachRecurrence(db: DB, kind: "TASK" | "EVENT", id: number, value: unknown) {
  const rule = repeatRule(value);
  const row =
    kind === "TASK"
      ? await db.todo.findFirst({
          where: { id, userId: owner },
          include: { subtasks: true, affectedPeople: true },
        })
      : await db.event.findFirst({ where: { id, userId: owner }, include: { taskLinks: true } });
  if (!row) throw new WorkValidationError("Record not found.", 404);
  if (row.recurrenceId)
    throw new WorkValidationError("This record already belongs to a repeating schedule.", 409);
  let snapshot: ReturnType<typeof snapshotTemplate>;
  try {
    snapshot = snapshotTemplate(kind, row, getAppTimeZone());
  } catch (error) {
    throw new WorkValidationError((error as Error).message);
  }
  if (rule.until && rule.until < snapshot.anchor.slice(0, 10))
    throw new WorkValidationError("The repeat end date cannot precede the first occurrence.");
  const today = dateInZone(new Date(), snapshot.timeZone);
  const first = snapshot.anchor.slice(0, 10);
  const series = await db.recurrenceSeries.create({
    data: {
      userId: owner,
      kind,
      ...rule,
      ...snapshot,
      generatedThrough: first > today ? shiftDate(first, -1) : shiftDate(today, -1),
    },
  });
  const data = { recurrenceId: series.id, recurrenceDate: first, revision: { increment: 1 } };
  if (kind === "TASK") await db.todo.update({ where: { id, userId: owner }, data });
  else await db.event.update({ where: { id, userId: owner }, data });
  await ensureSeriesWindow(db, series);
  return series;
}
export async function skipOccurrence(
  db: DB,
  row: { recurrenceId: number | null; recurrenceDate: string | null },
) {
  if (row.recurrenceId && row.recurrenceDate)
    await db.recurrenceSkip.upsert({
      where: { recurrenceId_date: { recurrenceId: row.recurrenceId, date: row.recurrenceDate } },
      create: { recurrenceId: row.recurrenceId, date: row.recurrenceDate },
      update: {},
    });
}
