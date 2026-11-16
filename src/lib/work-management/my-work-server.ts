import { readSnapshot } from "./read-snapshot";
import { prisma } from "@/lib/prisma";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { parseWorkQuery, workQueryWhere, workQueryOrder } from "./query";
import { PLANNING_SECTIONS, planningWhere, planningWindow } from "./planning-rules";
import { localToday, calendarDate } from "./dates";
import {
  todoInclude,
  serializeTodos,
  todoRow,
  getTodoInDb,
  mutation,
  version,
  WORK_USER_ID,
} from "./server";
import { appendTaskActivity } from "./activity-server";
import { isClosed } from "./types";
import { workBody, workId, WorkValidationError, type WorkCommand } from "./validation";
export async function readFocus(id: number, now = new Date()) {
  const date = localToday(now, getAppTimeZone());
  return readSnapshot(prisma, async (db) => {
    const task = await todoRow(db, id),
      pin = await db.workFocus.findUnique({
        where: { userId_todoId_date: { userId: WORK_USER_ID, todoId: id, date } },
      });
    return {
      date,
      nextDayAt: planningWindow(date, getAppTimeZone()).end.toISOString(),
      timeZone: getAppTimeZone(),
      active: pin?.active ?? false,
      actionable: !task.archivedAt && !isClosed(task.status),
      taskRevision: task.revision,
    };
  });
}
export async function setFocus(
  id: number,
  value: unknown,
  command: WorkCommand,
  now: Date | (() => Date) = () => new Date(),
) {
  const body = workBody(value, ["date", "active"]),
    date = calendarDate(body.date);
  if (typeof body.active !== "boolean")
    throw new WorkValidationError("Choose whether to focus this task.");
  const active = body.active;
  return mutation(`todo:${id}:focus`, body, command, async (db) => {
    const task = await todoRow(db, id);
    version(task, command);
    if (date !== localToday(typeof now === "function" ? now() : now, getAppTimeZone()))
      throw new WorkValidationError(
        "The planning day changed. Reload before changing today's focus.",
        409,
      );
    if (active && (task.archivedAt || isClosed(task.status)))
      throw new WorkValidationError(
        "Reopen/restore the task before adding it to today's focus.",
        409,
      );
    const key = { userId: WORK_USER_ID, todoId: id, date },
      previous = await db.workFocus.findUnique({ where: { userId_todoId_date: key } });
    if ((previous?.active ?? false) === active) return getTodoInDb(db, id);
    const row = await db.workFocus.upsert({
      where: { userId_todoId_date: key },
      create: { ...key, active },
      update: { active, revision: { increment: 1 } },
    });
    await db.todo.update({ where: { id }, data: { revision: { increment: 1 } } });
    await appendTaskActivity(db, id, active ? "FOCUS_ADDED" : "FOCUS_REMOVED", {
      focus: {
        before: previous ? { date, active: previous.active } : null,
        after: { date, active: row.active },
      },
    });
    return getTodoInDb(db, id);
  });
}
export async function myWork(params: URLSearchParams, now = new Date()) {
  // Only organizational filters are accepted; callers cannot change section semantics.
  for (const key of params.keys())
    if (!["activityType", "context", "project", "sessionPage"].includes(key))
      throw new WorkValidationError("Choose valid My Work filters.");
  const query = parseWorkQuery(params),
    base = workQueryWhere(query, WORK_USER_ID, now),
    date = localToday(now, getAppTimeZone()),
    window = planningWindow(date, getAppTimeZone()),
    pageSize = 6;
  return prisma.$transaction(
    async (db) => {
      const sections: Record<
        string,
        {
          total: number;
          items: (Awaited<ReturnType<typeof serializeTodos>>[number] & { focused?: boolean })[];
        }
      > = {};
      for (const name of PLANNING_SECTIONS) {
        const where = {
          AND: [base, planningWhere(name, date, getAppTimeZone(), now, WORK_USER_ID)],
        };
        const total = await db.todo.count({ where });
        const rows = await serializeTodos(
          db,
          await db.todo.findMany({
            where,
            include: todoInclude,
            take: pageSize,
            orderBy: workQueryOrder("priority"),
          }),
          now,
        );
        sections[name] = { total, items: rows };
      }
      const visibleIds = [
        ...new Set(
          Object.values(sections).flatMap((section) => section.items.map((task) => task.id)),
        ),
      ];
      const focused = new Set(
        (
          await db.workFocus.findMany({
            where: { userId: WORK_USER_ID, date, active: true, todoId: { in: visibleIds } },
            select: { todoId: true },
          })
        ).map((row) => row.todoId),
      );
      for (const section of Object.values(sections))
        for (const task of section.items) task.focused = focused.has(task.id);
      const sessionFilter = workQueryWhere({ ...query, view: "all" }, WORK_USER_ID, now);
      const organizational = {
        AND: (sessionFilter.AND as import("@/generated/prisma").Prisma.TodoWhereInput[]).filter(
          (part) => !("archivedAt" in part),
        ),
      };
      const where = {
        userId: WORK_USER_ID,
        kind: "WORK_SESSION",
        completed: false,
        date: { lt: window.end },
        endDate: { gt: window.start },
        taskLinks: { some: { role: "SESSION_TARGET", todo: organizational } },
      };
      const total = await db.event.count({ where }),
        requested = params.has("sessionPage") ? workId(params.get("sessionPage")) : 1,
        page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
      const sessions = await db.event.findMany({
        where,
        select: {
          id: true,
          title: true,
          date: true,
          endDate: true,
          timeZone: true,
          taskLinks: {
            where: { role: "SESSION_TARGET", todo: { userId: WORK_USER_ID } },
            select: { todo: { select: { id: true, title: true, status: true, archivedAt: true } } },
          },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
      return {
        date,
        timeZone: getAppTimeZone(),
        generatedAt: now.toISOString(),
        nextDayAt: window.end.toISOString(),
        totalActive: await db.todo.count({ where: base }),
        pageSize,
        sections,
        sessions: { items: sessions, total, page, pageSize },
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
