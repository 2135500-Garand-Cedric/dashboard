import { prisma } from "@/lib/prisma";
import { APP_TIME_ZONE } from "@/lib/app-time-zone";
import { mutation, todoRow, getTodoInDb, version } from "./server";
import { appendTaskActivity } from "./activity-server";
import { parseWorkDate, workDateState } from "./dates";
import { isClosed } from "./types";
import { WorkValidationError, workBody, workId, workText, type WorkCommand } from "./validation";
export async function readTaskDates(id: number, params: URLSearchParams) {
  const requested = params.has("page") ? workId(params.get("page")) : 1, keyRequested = params.has("keyPage") ? workId(params.get("keyPage")) : 1, pageSize = 20;
  return prisma.$transaction(async db => {
    const task = await todoRow(db, id), actionable = !isClosed(task.status) && !task.archivedAt;
    const total = await db.workFollowUp.count({ where: { todoId: id } }), page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
    const keyTotal = await db.workKeyDate.count({ where: { todoId: id, removedAt: null } }), keyPage = Math.min(keyRequested, Math.max(1, Math.ceil(keyTotal / pageSize)));
    const active = await db.workFollowUp.findFirst({ where: { todoId: id, status: "ACTIVE" } });
    return { timeZone: APP_TIME_ZONE, taskRevision: task.revision, actionable, deadline: { date: task.deadlineDate, at: task.deadlineAt, timeZone: task.deadlineTimeZone }, deadlineState: workDateState({ date: task.deadlineDate, at: task.deadlineAt, timeZone: task.deadlineTimeZone }, "deadline", new Date(), APP_TIME_ZONE, actionable), activeFollowUp: active ? { ...active, state: workDateState(active, "followup", new Date(), APP_TIME_ZONE, actionable) } : null,
      followUps: await db.workFollowUp.findMany({ where: { todoId: id }, orderBy: { id: "desc" }, take: pageSize, skip: (page - 1) * pageSize }), total, page, pageSize,
      keyDates: await db.workKeyDate.findMany({ where: { todoId: id, removedAt: null }, orderBy: { id: "asc" }, take: pageSize, skip: (keyPage - 1) * pageSize }), keyTotal, keyPage };
  }, { isolationLevel: "RepeatableRead" });
}
export async function taskDateCommand(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["action", "id", "date", "reason", "label"]);
  const action = String(body.action);
  if (!["deadline", "followup-create", "followup-complete", "followup-snooze", "followup-cancel", "key-create", "key-edit", "key-remove"].includes(action)) throw new WorkValidationError("Choose a valid date action.");
  const needsDate = ["deadline", "followup-create", "followup-snooze", "key-create", "key-edit"].includes(action);
  const date = needsDate ? parseWorkDate(body.date, APP_TIME_ZONE, action === "deadline") : undefined;
  if (!needsDate && body.date !== undefined) throw new WorkValidationError("This action does not change its original date.");
  const needsId = ["followup-complete", "followup-snooze", "followup-cancel", "key-edit", "key-remove"].includes(action), recordId = needsId ? workId(body.id) : null;
  if (!needsId && body.id !== undefined) throw new WorkValidationError("This action creates a new date record.");
  const key = action.startsWith("key-"), label = key && action !== "key-remove" ? workText(body.label, "key date label", 120)! : null;
  if ((!key || action === "key-remove") && body.label !== undefined) throw new WorkValidationError("Only a key date has a label.");
  const reason = body.reason === undefined ? null : workText(body.reason, "follow-up reason", 2000, true)?.trim() || null;
  if (!action.startsWith("followup-") && body.reason !== undefined) throw new WorkValidationError("Only follow-up actions accept a reason.");
  return mutation(`todo:${id}:dates`, body, command, async db => {
    const task = await todoRow(db, id); version(task, command);
    if (task.archivedAt) throw new WorkValidationError("Restore the task before changing its dates.", 409);
    let before: unknown = null, after: unknown = null;
    if (action === "deadline") {
      before = { date: task.deadlineDate, at: task.deadlineAt, timeZone: task.deadlineTimeZone }; after = date;
      if (JSON.stringify(before) === JSON.stringify(after)) return getTodoInDb(db, id);
      await db.todo.update({ where: { id }, data: { deadlineDate: date!.date, deadlineAt: date!.at, deadlineTimeZone: date!.timeZone } });
    } else if (key) {
      if (recordId !== null) {
        const row = await db.workKeyDate.findFirst({ where: { id: recordId, todoId: id, removedAt: null } });
        if (!row) throw new WorkValidationError("Key date not found.", 404); before = row;
        after = await db.workKeyDate.update({ where: { id: row.id }, data: action === "key-remove" ? { removedAt: new Date() } : { ...date!, label: label! } });
      } else after = await db.workKeyDate.create({ data: { todoId: id, ...date!, label: label! } });
    } else {
      if (["followup-create", "followup-snooze"].includes(action) && isClosed(task.status)) throw new WorkValidationError("Reopen this task before scheduling a follow-up.", 409);
      const active = await db.workFollowUp.findFirst({ where: { todoId: id, status: "ACTIVE" } });
      if (action === "followup-create") {
        if (active) throw new WorkValidationError("This task already has an active follow-up. Complete, cancel or snooze it first.", 409);
        after = await db.workFollowUp.create({ data: { todoId: id, ...date!, reason } });
      } else {
        if (!active || active.id !== recordId) throw new WorkValidationError("This follow-up is no longer active. Reload its history.", 409);
        before = active;
        const status = action === "followup-complete" ? "COMPLETED" : action === "followup-snooze" ? "SNOOZED" : "CANCELLED";
        const resolved = await db.workFollowUp.update({ where: { id: active.id }, data: { status, resolvedAt: new Date(), outcome: reason || (status === "COMPLETED" ? "FOLLOW_UP_COMPLETED" : status === "SNOOZED" ? "FOLLOW_UP_SNOOZED" : "USER_CANCELLED") } });
        after = action === "followup-snooze" ? { resolved, next: await db.workFollowUp.create({ data: { todoId: id, ...date!, reason: reason ?? active.reason, previousId: active.id } }) } : resolved;
      }
    }
    await db.todo.update({ where: { id }, data: { revision: { increment: 1 } } });
    await appendTaskActivity(db, id, action === "deadline" ? date!.date || date!.at ? (task.deadlineDate || task.deadlineAt ? "DEADLINE_CHANGED" : "DEADLINE_SET") : "DEADLINE_CLEARED" : action.replaceAll("followup", "follow_up").replaceAll("-", "_").toUpperCase(), JSON.parse(JSON.stringify({ date: { before, after } })));
    return getTodoInDb(db, id);
  });
}
