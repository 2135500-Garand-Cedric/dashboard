import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner, OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { appendTaskActivity } from "./activity-server";
import { graphStub, ownedGraphTask, taskStubSelect } from "./graph";
import { parseWorkDate, calendarDate } from "./dates";
import { WorkValidationError, workBody, workId, workText } from "./validation";
import { validateEventDates } from "@/lib/event-dates";
type DB = Prisma.TransactionClient;
export const EVENT_FIELDS = [
  "title",
  "description",
  "type",
  "date",
  "endDate",
  "completed",
  "linkedTodoId",
  "kind",
  "busy",
  "timing",
  "links",
];
export const eventInclude = {
  taskLinks: {
    include: {
      todo: {
        select: { ...taskStubSelect, contextId: true, activityTypeId: true, activityType: true },
      },
    },
    orderBy: { todoId: "asc" as const },
  },
  conversions: { where: { active: true }, orderBy: { id: "desc" as const }, take: 1 },
};
export type CalendarEventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;
export function eventDTO(row: CalendarEventRow) {
  const { taskLinks, conversions, ...fields } = row;
  const sole = taskLinks.length === 1 ? taskLinks[0].todo : null;
  return {
    ...fields,
    linkedTodoId: sole?.id ?? null,
    linkedTodo: sole?.userId === owner ? graphStub(sole) : null,
    taskLinks: taskLinks.map((link) => ({
      todoId: link.todoId,
      role: link.role,
      origin: link.origin,
      reviewReason: link.legacyReviewReason,
      task: graphStub(link.todo),
      contextId: link.todo.userId === owner ? link.todo.contextId : null,
    })),
    legacyLinkWritable: taskLinks.length <= 1,
    conversion: conversions[0] ?? null,
    superseded: conversions[0]?.mode === "PLACEHOLDER",
    appTimeZone: getAppTimeZone(),
  };
}
export async function eventRow(db: DB, id: number) {
  const row = await db.event.findFirst({ where: { id, userId: owner }, include: eventInclude });
  if (!row) throw new WorkValidationError("Event not found.", 404);
  return row;
}
export async function appendEventActivity(db: DB, id: number, action: string, changes: unknown) {
  await db.workEventActivity.create({
    data: {
      eventId: id,
      sourceEventId: id,
      userId: owner,
      actorGithubId: OWNER_GITHUB_ID,
      action,
      changes: JSON.parse(JSON.stringify(changes)),
    },
  });
}
type EventData = {
  title?: string;
  description?: string | null;
  type?: string | null;
  date?: Date | null;
  endDate?: Date | null;
  completed?: boolean;
  kind?: string;
  busy?: boolean | null;
  timeZone?: string | null;
  allDayStart?: string | null;
  allDayEnd?: string | null;
};
export function parseEventFields(body: Record<string, unknown>) {
  const data: EventData = {};
  if (body.title !== undefined) data.title = workText(body.title, "event title", 500)!;
  if (body.description !== undefined)
    data.description = workText(body.description, "description", 50000, true);
  if (body.type !== undefined) data.type = workText(body.type, "event label", 100, true);
  if (body.kind !== undefined) {
    if (!["ORDINARY", "INFORMATIONAL", "WORK_SESSION"].includes(String(body.kind)))
      throw new WorkValidationError("Choose an event, informational event or work session.");
    data.kind = String(body.kind);
  }
  for (const key of ["completed", "busy"] as const)
    if (body[key] !== undefined) {
      if (
        (body[key] !== null && typeof body[key] !== "boolean") ||
        (key === "completed" && body[key] === null)
      )
        throw new WorkValidationError("Choose a valid completion/availability value.");
      Object.assign(data, { [key]: body[key] });
    }
  if (body.timing !== undefined) {
    if (body.date !== undefined || body.endDate !== undefined)
      throw new WorkValidationError("Send one timing source, not both timing and legacy dates.");
    const timing = workBody(body.timing, ["kind", "start", "end", "startDate", "endExclusive"]);
    if (timing.kind === "TBD") {
      if (Object.keys(timing).length !== 1)
        throw new WorkValidationError("TBD events cannot have dates.");
      Object.assign(data, {
        date: null,
        endDate: null,
        timeZone: null,
        allDayStart: null,
        allDayEnd: null,
      });
    } else if (timing.kind === "ALL_DAY") {
      if (timing.start !== undefined || timing.end !== undefined)
        throw new WorkValidationError("All-day events use calendar dates only.");
      const start = calendarDate(timing.startDate),
        end = calendarDate(timing.endExclusive);
      if (end <= start)
        throw new WorkValidationError("The exclusive end date must follow the start date.");
      Object.assign(data, {
        date: null,
        endDate: null,
        timeZone: null,
        allDayStart: start,
        allDayEnd: end,
      });
    } else if (timing.kind === "TIMED") {
      if (timing.startDate !== undefined || timing.endExclusive !== undefined)
        throw new WorkValidationError("Timed events use exact times only.");
      const start = parseWorkDate(timing.start, getAppTimeZone()),
        end = timing.end == null ? null : parseWorkDate(timing.end, getAppTimeZone());
      if (!start.at || (end && !end.at))
        throw new WorkValidationError("Choose exact start/end times for a timed event.");
      if (end && end.timeZone !== start.timeZone)
        throw new WorkValidationError("Use the same time zone for the event start and end.");
      Object.assign(data, {
        date: start.at,
        endDate: end?.at ?? null,
        timeZone: start.timeZone,
        allDayStart: null,
        allDayEnd: null,
      });
    } else throw new WorkValidationError("Choose TBD, all-day or timed dates.");
  } else
    for (const key of ["date", "endDate"] as const)
      if (body[key] !== undefined) {
        const error = validateEventDates(body[key], null);
        if (error) throw new WorkValidationError(error);
        Object.assign(data, { [key]: body[key] === null ? null : new Date(body[key] as string) });
      }
  return data;
}
export function checkEventTimes(row: {
  kind: string;
  date: Date | null;
  endDate: Date | null;
  allDayStart: string | null;
  allDayEnd: string | null;
  timeZone: string | null;
}) {
  if (row.allDayStart) {
    if (row.date || row.endDate || !row.allDayEnd || row.allDayEnd <= row.allDayStart)
      throw new WorkValidationError("All-day and timed dates cannot be mixed.");
  } else {
    const error = validateEventDates(
      row.date?.toISOString() ?? null,
      row.endDate?.toISOString() ?? null,
    );
    if (error) throw new WorkValidationError(error);
  }
  if (
    row.kind === "WORK_SESSION" &&
    (!row.date || !row.endDate || !row.timeZone || row.allDayStart)
  )
    throw new WorkValidationError(
      "A work session needs exact start/end times, a time zone and one session task.",
    );
}
export type EventLinkInput = { todoId: number; role: string; revision?: number };
export function parseEventLinks(value: unknown): EventLinkInput[] {
  if (!Array.isArray(value) || value.length > 30)
    throw new WorkValidationError("Link at most 30 tasks to one event.");
  const links = value.map((raw) => {
    const row = workBody(raw, ["todoId", "role", "revision"]);
    if (!["RELATED", "SESSION_TARGET"].includes(String(row.role)))
      throw new WorkValidationError("Choose a related task or session target.");
    return {
      todoId: workId(row.todoId),
      role: String(row.role),
      ...(row.revision === undefined ? {} : { revision: workId(row.revision) }),
    };
  });
  if (new Set(links.map((link) => link.todoId)).size !== links.length)
    throw new WorkValidationError("Link each task only once.");
  return links;
}
export async function syncEventMirror(db: DB, id: number) {
  const links = await db.eventTaskLink.findMany({
    where: { eventId: id },
    take: 2,
    orderBy: { todoId: "asc" },
  });
  await db.event.update({
    where: { id },
    data: { linkedTodoId: links.length === 1 ? links[0].todoId : null },
  });
}
export async function writeEventLinks(db: DB, id: number, links: EventLinkInput[], kind: string) {
  const targets = links.filter((link) => link.role === "SESSION_TARGET");
  if (kind === "WORK_SESSION" ? targets.length !== 1 : targets.length !== 0)
    throw new WorkValidationError(
      "Only a work session has a session target, and it must have exactly one.",
    );
  const previous = await db.eventTaskLink.findMany({
    where: { eventId: id },
    include: { todo: { select: taskStubSelect } },
  });
  for (const link of links) {
    const task = await ownedGraphTask(db, link.todoId);
    if (
      link.role === "SESSION_TARGET" &&
      task.archivedAt &&
      !previous.some((old) => old.todoId === link.todoId && old.role === link.role)
    )
      throw new WorkValidationError("Restore the task before scheduling new work on it.", 409);
    if (link.revision !== undefined && task.revision !== link.revision)
      throw new WorkValidationError(
        "A linked task changed. Reload the task selection before saving.",
        409,
      );
  }
  const affected = new Set([
    ...previous
      .filter((old) => !links.some((link) => link.todoId === old.todoId && link.role === old.role))
      .map((old) => old.todoId),
    ...links
      .filter(
        (link) => !previous.some((old) => old.todoId === link.todoId && old.role === link.role),
      )
      .map((link) => link.todoId),
  ]);
  for (const old of previous)
    if (!links.some((link) => link.todoId === old.todoId && link.role === old.role))
      await db.eventTaskLink.delete({
        where: { eventId_todoId: { eventId: id, todoId: old.todoId } },
      });
  for (const link of links)
    if (!previous.some((old) => old.todoId === link.todoId && old.role === link.role))
      await db.eventTaskLink.create({
        data: { eventId: id, todoId: link.todoId, role: link.role },
      });
  await syncEventMirror(db, id);
  if (affected.size) {
    const facts = {
      eventTasks: {
        before: previous.map((row) => ({ todoId: row.todoId, role: row.role })),
        after: links.map((row) => ({ todoId: row.todoId, role: row.role })),
      },
    };
    await appendEventActivity(db, id, "TASK_LINKS_CHANGED", facts);
    for (const todoId of affected)
      if (await db.todo.count({ where: { id: todoId, userId: owner } })) {
        await db.todo.update({ where: { id: todoId }, data: { revision: { increment: 1 } } });
        await appendTaskActivity(db, todoId, "EVENT_LINK_CHANGED", {
          event: {
            before: { id },
            after: { id, role: links.find((link) => link.todoId === todoId)?.role ?? null },
          },
        });
      }
  }
}
export async function legacyEventLink(db: DB, row: CalendarEventRow, target: number | null) {
  if (row.taskLinks.length > 1)
    throw new WorkValidationError(
      "This event has multiple task links. Use the calendar task-link editor; the legacy field cannot replace them.",
      409,
    );
  if (row.kind === "WORK_SESSION") {
    if (row.taskLinks[0]?.todoId === target) return;
    throw new WorkValidationError("Use the session editor to change its target task.", 409);
  }
  if ((row.taskLinks[0]?.todoId ?? null) === target) return;
  await writeEventLinks(
    db,
    row.id,
    target === null ? [] : [{ todoId: target, role: "RELATED" }],
    row.kind,
  );
}
export async function detachTaskEvents(db: DB, id: number) {
  if (
    (await db.eventTaskLink.count({ where: { todoId: id, role: "SESSION_TARGET" } })) ||
    (await db.workEventConversion.count({ where: { todoId: id } }))
  )
    throw new WorkValidationError(
      "Archive this task to preserve its sessions or conversion history.",
      409,
    );
  const events = await db.event.findMany({
    where: { taskLinks: { some: { todoId: id } } },
    include: eventInclude,
  });
  if (events.some((event) => event.userId !== owner))
    throw new WorkValidationError(
      "Unexpected event ownership requires review before deleting this task.",
      409,
    );
  for (const event of events) {
    await db.eventTaskLink.delete({ where: { eventId_todoId: { eventId: event.id, todoId: id } } });
    await syncEventMirror(db, event.id);
    await db.event.update({ where: { id: event.id }, data: { revision: { increment: 1 } } });
    await appendEventActivity(db, event.id, "TASK_DELETED_LINK_REMOVED", {
      todo: { before: id, after: null },
    });
  }
}

export async function removeEventLinks(db: DB, row: CalendarEventRow) {
  await db.eventTaskLink.deleteMany({ where: { eventId: row.id } });
  for (const link of row.taskLinks)
    if (link.todo.userId === owner) {
      await db.todo.update({ where: { id: link.todoId }, data: { revision: { increment: 1 } } });
      await appendTaskActivity(db, link.todoId, "EVENT_DELETED", {
        event: { before: { id: row.id, title: row.title }, after: null },
      });
    }
}
