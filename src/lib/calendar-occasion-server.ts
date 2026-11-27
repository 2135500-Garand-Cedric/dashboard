import { auditRecordChange } from "./audit/server";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "./owner-policy";
import { workTransaction } from "./work-management/server";
import { occasionSource, occasionTarget, linkOccasionTask } from "./calendar-occasion-core";
import { workBody, workId } from "./work-management/validation";
import { taskReference } from "./work-management/types";
import { appendTaskActivity } from "./work-management/activity-server";

export async function readOccasion(kind: string, id: number, date?: string | null) {
  return prisma.$transaction(
    async (db) => {
      const source = await occasionSource(db, kind, id, date);
      const parent = source.kind === "holiday" ? { holidayId: id } : { birthdayId: id };
      const links = await db.calendarOccasionTaskLink.findMany({
        where: { userId: owner, ...parent, date: source.date },
        include: { todo: { select: { id: true, title: true, status: true } } },
        orderBy: { id: "asc" },
      });
      return {
        ...source,
        tasks: links.map(({ todo }) => ({ ...todo, reference: taskReference(todo.id) })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function occasionTaskCommand(
  kind: string,
  id: number,
  value: unknown,
  remove = false,
) {
  const body = workBody(value, ["date", "todoId"]);
  const target = occasionTarget({ kind, id, date: body.date });
  const todoId = workId(body.todoId);
  return workTransaction(async (db) => {
    if (!remove) return linkOccasionTask(db, target, todoId);
    const source = await occasionSource(db, target.kind, target.id, target.date);
    const parent = target.kind === "holiday" ? { holidayId: id } : { birthdayId: id };
    const result = await db.calendarOccasionTaskLink.deleteMany({
      where: { userId: owner, ...parent, date: target.date, todoId },
    });
    if (result.count) {
      await auditRecordChange(
        db,
        {
          category: "CALENDAR",
          action: "occasion.task_unlinked",
          entityType: target.kind,
          entityId: target.id,
          summary: "Task unlinked from calendar date",
          related: [{ type: "task", id: todoId }],
        },
        { date: target.date },
        null,
      );
      await db.todo.update({
        where: { id: todoId, userId: owner },
        data: { revision: { increment: 1 } },
      });
      await appendTaskActivity(db, todoId, "CALENDAR_DATE_UNLINKED", {
        calendarDate: { before: { ...target, title: source.title }, after: null },
      });
    }
    return { ok: true };
  });
}
