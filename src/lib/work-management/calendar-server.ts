import { readSnapshot } from "./read-snapshot";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { mutation, version, todoRow, WORK_USER_ID } from "./server";
import {
  type CalendarEventRow,
  eventRow,
  eventDTO,
  eventInclude,
  appendEventActivity,
  writeEventLinks,
} from "./event-core";
import { appendTaskActivity } from "./activity-server";
import {
  parseWorkDate,
  localToday,
  dayStart,
  nextCalendarDate,
  type StoredWorkDate,
} from "./dates";
import { isClosed } from "./types";
import { workBody, workId, workText, WorkValidationError, type WorkCommand } from "./validation";
import type { Prisma } from "@/generated/prisma";
type DB = Prisma.TransactionClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sameDate = (a: StoredWorkDate, b: StoredWorkDate) =>
  a.date === b.date &&
  a.timeZone === b.timeZone &&
  (a.at ? new Date(a.at).toISOString() : null) === (b.at ? new Date(b.at).toISOString() : null);
const deadlineOf = (task: {
  deadlineDate: string | null;
  deadlineAt: Date | null;
  deadlineTimeZone: string | null;
}): StoredWorkDate => ({
  date: task.deadlineDate,
  at: task.deadlineAt,
  timeZone: task.deadlineTimeZone,
});
async function conversionState(db: DB, id: number, body: Record<string, unknown>) {
  if (
    !["RELATED", "PLACEHOLDER"].includes(String(body.mode)) ||
    typeof body.changeDeadline !== "boolean"
  )
    throw new WorkValidationError(
      "Choose retained event or superseded placeholder and review the deadline choice.",
    );
  const event = await eventRow(db, id);
  if (event.taskLinks.some((link) => link.legacyReviewReason || link.todo.userId !== WORK_USER_ID))
    throw new WorkValidationError(
      "Review legacy task-link anomalies before converting this event.",
      409,
    );
  if (event.kind === "WORK_SESSION")
    throw new WorkValidationError(
      "A work session already has a task; it cannot be converted into a deadline.",
      409,
    );
  const task = body.taskId == null ? null : await todoRow(db, workId(body.taskId));
  if (task?.archivedAt)
    throw new WorkValidationError("Restore the chosen task before converting this event.", 409);
  const activityTypeId = task
    ? task.activityTypeId
    : body.activityTypeId == null
      ? null
      : workId(body.activityTypeId);
  if (
    !task &&
    activityTypeId != null &&
    !(await db.activityType.count({ where: { id: activityTypeId, active: true } }))
  )
    throw new WorkValidationError("Choose an active calendar activity type.");
  const title = task?.title ?? workText(body.title, "new task title", 500)!;
  if (body.changeDeadline === false && body.deadline !== undefined && body.deadline !== null)
    throw new WorkValidationError("Enable the deadline change before entering a new deadline.");
  const before = task ? deadlineOf(task) : { date: null, at: null, timeZone: null };
  const after = body.changeDeadline ? parseWorkDate(body.deadline, getAppTimeZone(), true) : before;
  if (body.mode === "PLACEHOLDER" && !after.date && !after.at)
    throw new WorkValidationError(
      "A superseded deadline placeholder requires an explicit task deadline.",
    );
  const token = hash({
    event: json(event),
    taskRevision: task?.revision ?? null,
    taskId: task?.id ?? null,
    title,
    activityTypeId,
    mode: body.mode,
    changeDeadline: body.changeDeadline,
    before: json(before),
    after: json(after),
  });
  return { event, task, title, activityTypeId, before, after, token };
}
const conversionFields = [
  "mode",
  "taskId",
  "title",
  "activityTypeId",
  "changeDeadline",
  "deadline",
  "previewToken",
];
export async function previewConversion(id: number, value: unknown) {
  const body = workBody(value, conversionFields);
  return prisma.$transaction(
    async (db) => {
      const state = await conversionState(db, id, body);
      return {
        token: state.token,
        event: eventDTO(state.event),
        task: state.task
          ? {
              id: state.task.id,
              title: state.task.title,
              revision: state.task.revision,
              status: state.task.status,
            }
          : null,
        title: state.title,
        activityTypeId: state.activityTypeId,
        beforeDeadline: state.before,
        afterDeadline: state.after,
        mode: body.mode,
        changeDeadline: body.changeDeadline,
        warning:
          state.task && isClosed(state.task.status)
            ? "This task is closed. Its date will remain historical until it is explicitly reopened."
            : null,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function confirmConversion(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, conversionFields);
  if (typeof body.previewToken !== "string" || !/^[a-f0-9]{64}$/.test(body.previewToken))
    throw new WorkValidationError("Preview the conversion before confirming.", 428);
  const intentHash = hash(body);
  return mutation(`event:${id}:convert`, body, command, async (db) => {
    const existing = await db.workEventConversion.findFirst({
      where: { eventId: id, active: true },
    });
    if (existing) {
      if (existing.intentHash !== intentHash)
        throw new WorkValidationError(
          "This event was already converted. Review it or undo that conversion first.",
          409,
        );
      return {
        conversion: existing,
        event: eventDTO(await eventRow(db, id)),
        taskId: existing.todoId,
      };
    }
    const state = await conversionState(db, id, body);
    version(state.event, command);
    if (state.token !== body.previewToken)
      throw new WorkValidationError(
        "The event, task or conversion choices changed. Preview again before confirming.",
        409,
      );
    let task = state.task;
    if (!task) {
      task = await db.todo.create({
        data: {
          title: state.title,
          userId: WORK_USER_ID,
          activityTypeId: state.activityTypeId,
        },
        include: {
          followUps: { where: { status: "ACTIVE" }, take: 1 },
          prerequisites: {
            include: {
              prerequisite: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  revision: true,
                  userId: true,
                  parentId: true,
                  archivedAt: true,
                },
              },
            },
            take: 2,
          },
          parent: {
            select: {
              id: true,
              title: true,
              status: true,
              revision: true,
              userId: true,
              parentId: true,
              archivedAt: true,
            },
          },
          requester: true,
          affectedPeople: { include: { contact: true } },
          activityType: true,
          project: true,
          stage: true,
          subtasks: true,
        },
      });
      await appendTaskActivity(db, task.id, "CREATED_FROM_EVENT", {
        event: { before: null, after: { id, title: state.event.title } },
      });
    }
    const changed = !sameDate(state.before, state.after);
    if (changed) {
      await db.todo.update({
        where: { id: task.id },
        data: {
          deadlineDate: state.after.date,
          deadlineAt: state.after.at,
          deadlineTimeZone: state.after.timeZone,
          revision: { increment: 1 },
        },
      });
      await appendTaskActivity(
        db,
        task.id,
        "DEADLINE_FROM_EVENT",
        json({
          deadline: { before: state.before, after: state.after },
          event: { before: null, after: id },
        }),
      );
    }
    const links = state.event.taskLinks.map((link) => ({ todoId: link.todoId, role: link.role }));
    if (!links.some((link) => link.todoId === task!.id)) {
      links.push({ todoId: task.id, role: "RELATED" });
      await writeEventLinks(db, id, links, state.event.kind);
    }
    const event = await db.event.update({ where: { id }, data: { revision: { increment: 1 } } }),
      current = await db.todo.findUniqueOrThrow({ where: { id: task.id } });
    const conversion = await db.workEventConversion.create({
      data: {
        eventId: id,
        sourceEventId: id,
        todoId: task.id,
        mode: String(body.mode),
        intentHash,
        sourceSnapshot: json(eventDTO(state.event)),
        beforeDeadline: json(state.before),
        afterDeadline: json(state.after),
        deadlineChanged: changed,
        eventRevisionAfter: event.revision,
        taskRevisionAfter: current.revision,
        createdTask: !state.task,
      },
    });
    await appendEventActivity(db, id, "CONVERTED", {
      conversion: { before: null, after: conversion },
    });
    return { conversion, event: eventDTO(await eventRow(db, id)), taskId: task.id };
  });
}
export async function undoConversion(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["conversionId", "restoreDeadline"]),
    conversionId = workId(body.conversionId);
  if (typeof body.restoreDeadline !== "boolean")
    throw new WorkValidationError("Choose whether to restore the previous task deadline.");
  return mutation(`event:${id}:conversion:undo`, body, command, async (db) => {
    const event = await eventRow(db, id);
    version(event, command);
    const conversion = await db.workEventConversion.findFirst({
      where: { id: conversionId, eventId: id, active: true },
    });
    if (!conversion) throw new WorkValidationError("This conversion is no longer active.", 409);
    const task = await todoRow(db, conversion.todoId);
    if (body.restoreDeadline && conversion.deadlineChanged) {
      if (
        task.revision !== conversion.taskRevisionAfter ||
        !sameDate(deadlineOf(task), conversion.afterDeadline as unknown as StoredWorkDate)
      )
        throw new WorkValidationError(
          "The task changed after conversion. Restore event display only to preserve the current task, or review its deadline manually.",
          409,
        );
      const before = conversion.beforeDeadline as unknown as StoredWorkDate;
      await db.todo.update({
        where: { id: task.id },
        data: {
          deadlineDate: before.date,
          deadlineAt: before.at ? new Date(before.at) : null,
          deadlineTimeZone: before.timeZone,
          revision: { increment: 1 },
        },
      });
      await appendTaskActivity(db, task.id, "CONVERSION_DEADLINE_RESTORED", {
        deadline: { before: conversion.afterDeadline, after: conversion.beforeDeadline },
      });
    }
    const updated = await db.workEventConversion.update({
      where: { id: conversion.id },
      data: { active: false, undoneAt: new Date() },
    });
    await db.event.update({ where: { id }, data: { revision: { increment: 1 } } });
    await appendEventActivity(db, id, "CONVERSION_UNDONE", {
      conversion: { before: conversion, after: updated },
      restoreDeadline: body.restoreDeadline,
      taskAndLinksKept: true,
    });
    return { event: eventDTO(await eventRow(db, id)), taskId: task.id };
  });
}
export async function taskCalendar(id: number, params: URLSearchParams) {
  const requested = params.has("page") ? workId(params.get("page")) : 1,
    pageSize = 20;
  return readSnapshot(prisma, async (db) => {
    await todoRow(db, id);
    const where = { taskLinks: { some: { todoId: id } }, userId: WORK_USER_ID },
      total = await db.event.count({ where }),
      page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
    return {
      items: (
        await db.event.findMany({
          where,
          include: eventInclude,
          orderBy: [{ date: { sort: "desc", nulls: "last" } }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
      ).map(eventDTO),
      total,
      page,
      pageSize,
    };
  });
}
export async function calendarFeed(params: URLSearchParams) {
  const parseInstant = (key: string) => {
    const value = params.get(key) || "";
    if (
      !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new WorkValidationError("Choose an explicit calendar range with timezone offsets.");
    return new Date(value);
  };
  const start = parseInstant("start"),
    end = parseInstant("end");
  if (end <= start || end.getTime() - start.getTime() > 370 * 86400000)
    throw new WorkValidationError("Calendar ranges must be positive and at most one year.");
  const validLayers = ["events", "sessions", "deadlines", "followups", "milestones"],
    layers = (params.get("layers") ?? validLayers.join(","))
      .split(",")
      .filter((layer) => !!layer && layer !== "keydates");
  if (layers.some((layer) => !validLayers.includes(layer)))
    throw new WorkValidationError("Choose valid calendar layers.");
  const project = params.get("project") || "",
    projectId = project && project !== "none" ? workId(project) : null;
  const history = params.get("history") === "true",
    from = localToday(start, getAppTimeZone()),
    through =
      end.getTime() === dayStart(localToday(end, getAppTimeZone()), getAppTimeZone()).getTime()
        ? localToday(end, getAppTimeZone())
        : nextCalendarDate(localToday(end, getAppTimeZone()));
  const activity = params.get("activityType") || "",
    activityId = activity && activity !== "none" ? workId(activity) : null;
  const eventContext: Prisma.EventWhereInput = project
    ? {
        OR: [
          {
            taskLinks: {
              some: {
                todo: { userId: WORK_USER_ID, ...(project ? { projectId } : {}) },
              },
            },
          },
          ...(!project || project === "none"
            ? [{ taskLinks: { none: { todo: { userId: WORK_USER_ID } } } }]
            : []),
        ],
      }
    : {};
  const taskWhere: Prisma.TodoWhereInput = {
    userId: WORK_USER_ID,
    ...(history
      ? {
          OR: [
            { archivedAt: null },
            { status: { in: ["DONE", "CANCELLED"] as ("DONE" | "CANCELLED")[] } },
          ],
        }
      : { archivedAt: null }),
    ...(activity ? { activityTypeId: activityId } : {}),
    ...(project ? { projectId, ...(projectId ? { project: { userId: WORK_USER_ID } } : {}) } : {}),
    ...(!history ? { status: { notIn: ["DONE", "CANCELLED"] } } : {}),
  };
  const eventBase: Prisma.EventWhereInput = {
    userId: WORK_USER_ID,
    ...eventContext,
    conversions: { none: { active: true, mode: "PLACEHOLDER" } },
  };
  return prisma.$transaction(
    async (db) => {
      const items: Record<string, unknown>[] = [],
        types = await db.activityType.findMany(),
        color = (type: string | null, fallback: string) =>
          types.find((row) => row.name.toLowerCase() === type?.toLowerCase())?.color ?? fallback;
      const linkedActivity = (row: CalendarEventRow) => {
        const links = row.taskLinks.filter(
          (link) => link.todo.userId === WORK_USER_ID && link.todo.activityType,
        );
        return (links.find((link) => link.role === "SESSION_TARGET") ?? links[0])?.todo
          .activityType;
      };
      const matchesActivity = (row: CalendarEventRow) => {
        const effective =
          linkedActivity(row) ??
          types.find((type) => type.name.toLowerCase() === row.type?.toLowerCase());
        return !activity || (effective?.id ?? null) === activityId;
      };
      if (layers.some((layer) => layer === "events" || layer === "sessions")) {
        const rows = await db.event.findMany({
          where: {
            AND: [
              eventBase,
              {
                kind:
                  layers.includes("events") && layers.includes("sessions")
                    ? undefined
                    : layers.includes("sessions")
                      ? "WORK_SESSION"
                      : { not: "WORK_SESSION" },
              },
              {
                OR: [
                  {
                    date: { lt: end },
                    OR: [{ endDate: { gt: start } }, { endDate: null, date: { gte: start } }],
                  },
                  { allDayStart: { lt: through }, allDayEnd: { gt: from } },
                ],
              },
            ],
          },
          include: eventInclude,
          take: 1001,
          orderBy: { id: "asc" },
        });
        if (rows.length > 1000)
          throw new WorkValidationError(
            "Too many events. Narrow the calendar range or context.",
            422,
          );
        for (const row of rows) {
          if (!matchesActivity(row)) continue;
          const dto = eventDTO(row),
            session = row.kind === "WORK_SESSION",
            target = dto.taskLinks.find((link) => link.role === "SESSION_TARGET"),
            taskType = linkedActivity(row),
            itemColor = taskType?.color ?? color(row.type, session ? "#8b5cf6" : "#3b82f6");
          items.push({
            id: `event:${row.id}`,
            title: `${session ? "▣ Session" : row.kind === "INFORMATIONAL" ? "ⓘ Info" : "○ Event"} · ${row.title}${target?.task.status && isClosed(target.task.status) ? " · Task closed" : ""}`,
            start: row.allDayStart ?? row.date!.toISOString(),
            ...(row.allDayEnd || row.endDate
              ? { end: row.allDayEnd ?? row.endDate!.toISOString() }
              : {}),
            allDay: !!row.allDayStart,
            editable: session,
            backgroundColor: itemColor,
            borderColor: itemColor,
            classNames: row.completed ? ["event-completed"] : [],
            extendedProps: {
              layer: session ? "sessions" : "events",
              plainTitle: `${row.title}${target?.task.status && isClosed(target.task.status) ? " · Task closed" : ""}`,
              activityType: taskType?.name ?? row.type,
              href: `/events/${row.id}`,
              eventId: row.id,
              revision: row.revision,
              completed: row.completed,
              busy: row.busy,
              kind: row.kind,
              sessionTaskStatus: target?.task.status ?? null,
            },
          });
        }
      }
      const dateRange = (date: string, at: string) => ({
        OR: [{ [date]: { gte: from, lt: through } }, { [at]: { gte: start, lt: end } }],
      });
      const marker = (
        layer: string,
        id: number,
        task: {
          id: number;
          title: string;
          status: string;
          activityType?: { name: string; color: string } | null;
        },
        value: { date: string | null; at: Date | null },
        label: string,
      ) => {
        const closed = isClosed(task.status);
        items.push({
          id: `${layer}:${id}`,
          title: `${closed ? "History · " : ""}${label} · ${task.title}`,
          start: value.date ?? value.at!.toISOString(),
          allDay: !!value.date,
          display: "list-item",
          editable: false,
          classNames: [
            "calendar-marker",
            `calendar-${layer}`,
            ...(closed ? ["calendar-historical"] : []),
          ],
          backgroundColor: "transparent",
          borderColor: task.activityType?.color ?? (layer === "deadline" ? "#f43f5e" : "#f59e0b"),
          extendedProps: {
            layer: layer === "deadline" ? "deadlines" : "followups",
            plainTitle: task.title,
            activityType: task.activityType?.name ?? null,
            href: `/todos/${task.id}#task-dates`,
            taskId: task.id,
            actionable: !closed,
            busy: false,
            marker: true,
          },
        });
      };
      if (layers.includes("deadlines")) {
        const rows = await db.todo.findMany({
          where: { AND: [taskWhere, dateRange("deadlineDate", "deadlineAt")] },
          include: { activityType: true },
          take: 1001,
        });
        if (rows.length > 1000)
          throw new WorkValidationError("Too many deadlines. Narrow the range.", 422);
        for (const row of rows)
          marker("deadline", row.id, row, { date: row.deadlineDate, at: row.deadlineAt }, "⚑ Due");
      }
      if (layers.includes("followups")) {
        const rows = await db.workFollowUp.findMany({
          where: { status: "ACTIVE", todo: taskWhere, ...dateRange("date", "at") },
          include: { todo: { include: { activityType: true } } },
          take: 1001,
        });
        if (rows.length > 1000)
          throw new WorkValidationError("Too many follow-ups. Narrow the range.", 422);
        for (const row of rows) marker("followup", row.id, row.todo, row, "↻ Follow up");
      }
      if (layers.includes("milestones")) {
        const projectDates =
          project === "none"
            ? []
            : await db.workKeyDate.findMany({
                where: {
                  todoId: null,
                  removedAt: null,
                  project: {
                    userId: WORK_USER_ID,
                    archivedAt: null,
                    ...(projectId ? { id: projectId } : {}),
                    ...(activity ? { activityTypeId: activityId } : {}),
                    ...(!history ? { status: "ACTIVE" } : {}),
                  },
                  ...dateRange("date", "at"),
                },
                include: { project: { include: { activityType: true } } },
                take: 1001,
              });
        if (projectDates.length > 1000)
          throw new WorkValidationError("Too many project milestones. Narrow the range.", 422);
        for (const row of projectDates)
          if (row.project)
            items.push({
              id: `milestone:${row.id}`,
              title: `◇ ${row.completedAt ? "Reached" : "Milestone"} · ${row.label} · ${row.project.name}`,
              start: row.date ?? row.at!.toISOString(),
              allDay: !!row.date,
              display: "list-item",
              editable: false,
              classNames: [
                "calendar-marker",
                "calendar-milestone",
                ...(row.completedAt || row.project.status !== "ACTIVE"
                  ? ["calendar-historical"]
                  : []),
              ],
              backgroundColor: "transparent",
              borderColor: row.project.activityType?.color ?? "#38bdf8",
              extendedProps: {
                layer: "milestones",
                activityType: row.project.activityType?.name ?? null,
                plainTitle: `${row.label} · ${row.project.name}`,
                href: `/projects/${row.projectId}#project-milestones`,
                projectId: row.projectId,
                marker: true,
                actionable: false,
                busy: false,
              },
            });
      }
      const tbdWhere = { ...eventBase, date: null, allDayStart: null };
      // With an activity filter, resolve the same winning linked task as the
      // calendar before paginating, so counts and pages match the visible color.
      const filteredTbd =
        activity && layers.includes("events")
          ? await db.event.findMany({
              where: tbdWhere,
              include: eventInclude,
              orderBy: { id: "asc" },
              take: 2501,
            })
          : null;
      if (filteredTbd && filteredTbd.length > 2500)
        throw new WorkValidationError(
          "Too many unscheduled events. Narrow the project filter.",
          422,
        );
      const matchingTbd = filteredTbd?.filter(matchesActivity),
        tbdTotal = layers.includes("events")
          ? (matchingTbd?.length ?? (await db.event.count({ where: tbdWhere })))
          : 0,
        tbdPage = Math.min(
          params.has("tbdPage") ? workId(params.get("tbdPage")) : 1,
          Math.max(1, Math.ceil(tbdTotal / 30)),
        );
      const tbd = layers.includes("events")
        ? (matchingTbd
            ? matchingTbd.slice((tbdPage - 1) * 30, tbdPage * 30)
            : await db.event.findMany({
                where: tbdWhere,
                include: eventInclude,
                take: 30,
                skip: (tbdPage - 1) * 30,
                orderBy: { id: "asc" },
              })
          ).map((row) => {
            const activityType = linkedActivity(row);
            const activityLabel = activityType?.name ?? row.type;
            return {
              ...eventDTO(row),
              activityLabel,
              activityColor: activityType?.color ?? color(activityLabel, "#3b82f6"),
            };
          })
        : [];
      if (items.length > 2500)
        throw new WorkValidationError(
          "Too many calendar items. Narrow the range, layers or context.",
          422,
        );
      return {
        items,
        timeZone: getAppTimeZone(),
        tbd,
        tbdTotal,
        tbdPage,
        tbdPageSize: 30,
        start: start.toISOString(),
        end: end.toISOString(),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function eventActivity(id: number) {
  await eventRow(prisma, id);
  return prisma.workEventActivity.findMany({
    where: { eventId: id, userId: WORK_USER_ID },
    orderBy: { id: "desc" },
    take: 100,
  });
}
