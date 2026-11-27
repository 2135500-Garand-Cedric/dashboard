import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { dateInZone, snapshotTemplate } from "@/lib/recurrence/rules.mjs";
import { ensureSeriesWindow } from "@/lib/recurrence/engine.mjs";
import { appendTaskActivity } from "./activity-server";
import { mutation, version } from "./server";
import { attachRecurrence, repeatRule } from "./recurrence-core";
import { WorkValidationError, workBody, workId, type WorkCommand } from "./validation";
import { parseWorkDate } from "./dates";
import type { Prisma } from "@/generated/prisma";

type DB = Prisma.TransactionClient;
async function source(db: DB, kind: string, id: number) {
  const row =
    kind === "TASK"
      ? await db.todo.findFirst({
          where: { id, userId: owner },
          include: { subtasks: true, affectedPeople: true },
        })
      : await db.event.findFirst({ where: { id, userId: owner }, include: { taskLinks: true } });
  if (!row) throw new WorkValidationError("Record not found.", 404);
  return row;
}
export async function readRecurrence(kind: string, id: number) {
  const row = await source(prisma, kind, id);
  return row.recurrenceId
    ? prisma.recurrenceSeries.findFirst({ where: { id: row.recurrenceId, userId: owner } })
    : null;
}

// Only untouched, future generated copies may be replaced. Real work and
// exceptions always survive, including notes, files, links and completed items.
export async function pruneFuture(
  db: DB,
  seriesId: number,
  kind: string,
  keepId: number,
  today: string,
) {
  if (kind === "TASK") {
    const rows = await db.todo.findMany({
      where: {
        userId: owner,
        recurrenceId: seriesId,
        id: { not: keepId },
        recurrenceDate: { gt: today },
        revision: 1,
        status: "TODO",
        archivedAt: null,
        notes: { none: {} },
        attachments: { none: {} },
        followUps: { none: {} },
        keyDates: { none: {} },
        children: { none: {} },
        parentId: null,
        prerequisites: { none: {} },
        blocking: { none: {} },
        relationsAsFirst: { none: {} },
        relationsAsSecond: { none: {} },
        events: { none: {} },
        calendarLinks: { none: {} },
        eventConversions: { none: {} },
        focusRecords: { none: {} },
        subtasks: { none: { OR: [{ done: true }, { revision: { gt: 1 } }] } },
      },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    await db.subtask.deleteMany({ where: { todoId: { in: ids } } });
    await db.todoAffectedContact.deleteMany({ where: { todoId: { in: ids } } });
    await db.todo.deleteMany({ where: { id: { in: ids }, userId: owner } });
  } else {
    const rows = await db.event.findMany({
      where: {
        userId: owner,
        recurrenceId: seriesId,
        id: { not: keepId },
        recurrenceDate: { gt: today },
        recurrenceException: false,
        completed: false,
        conversions: { none: {} },
      },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    await db.eventTaskLink.deleteMany({ where: { eventId: { in: ids } } });
    await db.event.deleteMany({ where: { id: { in: ids }, userId: owner } });
  }
}
export async function saveRecurrence(
  kind: "TASK" | "EVENT",
  id: number,
  value: unknown,
  command: WorkCommand,
) {
  const body = workBody(value, ["frequency", "until", "active", "firstDeadline", "sourceRevision"]);
  if (body.active !== undefined && typeof body.active !== "boolean")
    throw new WorkValidationError("Choose a valid repeat status.");
  return mutation(`${kind}:${id}:recurrence`, body, command, (db) =>
    saveRecurrenceInTransaction(db, kind, id, body, command),
  );
}
export async function saveRecurrenceInTransaction(
  db: DB,
  kind: "TASK" | "EVENT",
  id: number,
  body: Record<string, unknown>,
  command: WorkCommand,
) {
  let row = await source(db, kind, id);
  if (!row.recurrenceId) {
    if (body.active === false) throw new WorkValidationError("This record does not repeat.");
    version(row, { ...command, revision: workId(body.sourceRevision) });
    if (body.firstDeadline !== undefined) {
      if (kind !== "TASK") throw new WorkValidationError("Only tasks have deadlines.");
      const date = parseWorkDate(body.firstDeadline, getAppTimeZone());
      await db.todo.update({
        where: { id, userId: owner },
        data: {
          deadlineDate: date.date,
          deadlineAt: date.at ? new Date(date.at) : null,
          deadlineTimeZone: date.timeZone,
        },
      });
    }
    return attachRecurrence(db, kind, id, { frequency: body.frequency, until: body.until });
  }
  if (body.firstDeadline !== undefined)
    throw new WorkValidationError(
      "Edit this occurrence's deadline before updating the repeating schedule.",
    );
  const series = await db.recurrenceSeries.findFirst({
    where: { id: row.recurrenceId, userId: owner },
  });
  if (!series) throw new WorkValidationError("Repeating schedule not found.", 404);
  version(series, command);
  version(row, { ...command, revision: workId(body.sourceRevision) });
  const today = dateInZone(new Date(), series.timeZone);
  await pruneFuture(db, series.id, kind, id, today);
  const rule =
    body.active === false
      ? { frequency: series.frequency, until: series.until }
      : repeatRule({ frequency: body.frequency, until: body.until });
  row = await source(db, kind, id);
  let snapshot: ReturnType<typeof snapshotTemplate>;
  try {
    snapshot =
      body.active === false
        ? {
            anchor: series.anchor,
            timeZone: series.timeZone,
            template: series.template as Prisma.InputJsonObject,
          }
        : snapshotTemplate(kind, row, series.timeZone);
  } catch (error) {
    throw new WorkValidationError((error as Error).message);
  }
  if (rule.until && rule.until < snapshot.anchor.slice(0, 10))
    throw new WorkValidationError("The repeat end date cannot precede the selected occurrence.");
  // A moved occurrence keeps its original identity. Its new date is already
  // represented by this record, so regeneration must not create it again.
  const anchorDate = snapshot.anchor.slice(0, 10);
  if (body.active !== false && row.recurrenceDate !== anchorDate)
    await db.recurrenceSkip.upsert({
      where: { recurrenceId_date: { recurrenceId: series.id, date: anchorDate } },
      create: { recurrenceId: series.id, date: anchorDate },
      update: {},
    });
  const updated = await db.recurrenceSeries.update({
    where: { id: series.id, userId: owner },
    data: {
      ...snapshot,
      ...rule,
      active: body.active !== false,
      generatedThrough: today,
      revision: { increment: 1 },
    },
  });
  if (updated.active) await ensureSeriesWindow(db, updated);
  const changes = {
    recurrence: {
      before: { active: series.active, frequency: series.frequency, until: series.until },
      after: { active: updated.active, frequency: updated.frequency, until: updated.until },
    },
  };
  if (kind === "TASK") await appendTaskActivity(db, id, "RECURRENCE_UPDATED", changes);
  else
    await db.workEventActivity.create({
      data: {
        userId: owner,
        actorGithubId: "89470930",
        eventId: id,
        sourceEventId: id,
        action: "RECURRENCE_UPDATED",
        changes,
      },
    });
  return updated;
}
