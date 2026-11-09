import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { validateEventDates } from "@/lib/event-dates";
import { WorkValidationError, workBody, workId, workInteger, workText, type WorkCommand } from "./validation";

export const WORK_USER_ID = OWNER_DATABASE_USER_ID;
type DB = Prisma.TransactionClient;
const todoInclude = { subtasks: { orderBy: { id: "asc" as const } }, dependsOn: true };
const eventInclude = { linkedTodo: true };
type TodoRow = Prisma.TodoGetPayload<{ include: typeof todoInclude }>;
type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;
const todoDTO = (row: TodoRow) => ({ ...row, dependsOn: row.dependsOn?.userId === WORK_USER_ID ? row.dependsOn : null });
const eventDTO = (row: EventRow) => ({ ...row, linkedTodo: row.linkedTodo?.userId === WORK_USER_ID ? row.linkedTodo : null });

// Every task/event/checklist writer takes the same transaction-scoped owner lock.
// Read committed ensures a waiter validates the graph AFTER the prior commit.
export async function workTransaction<T>(action: (db: DB) => Promise<T>): Promise<T> {
  return prisma.$transaction(async db => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(62019, ${WORK_USER_ID}::integer)`;
    const owner = await db.user.findUnique({ where: { id: WORK_USER_ID }, select: { id: true } });
    if (!owner) throw new WorkValidationError("The configured application owner is missing. Restore or review the owner mapping.", 409);
    return action(db);
  }, { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 15000 });
}
function version(row: { revision: number }, command: WorkCommand) {
  if (row.revision !== command.revision) throw new WorkValidationError("This record changed in another window. Reload it before saving.", 409);
}
async function mutation(operation: string, input: unknown, command: WorkCommand, action: (db: DB) => Promise<unknown>) {
  const fingerprint = createHash("sha256").update(JSON.stringify([operation, command.revision ?? null, input && typeof input === "object" && !Array.isArray(input) ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))) : input])).digest("hex");
  return workTransaction(async db => {
    const previous = await db.workMutationReceipt.findUnique({ where: { userId_requestKey: { userId: WORK_USER_ID, requestKey: command.requestKey } } });
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new WorkValidationError("This request identifier was already used for a different change. Reload and try again.", 409);
      return previous.result;
    }
    const result = JSON.parse(JSON.stringify(await action(db))) as Prisma.InputJsonValue;
    await db.workMutationReceipt.create({ data: { userId: WORK_USER_ID, requestKey: command.requestKey, fingerprint, operation, result } });
    return result;
  });
}
async function todoRow(db: DB, id: number) {
  const row = await db.todo.findFirst({ where: { id, userId: WORK_USER_ID }, include: todoInclude });
  if (!row) throw new WorkValidationError("Task not found.", 404);
  return row;
}
async function eventRow(db: DB, id: number) {
  const row = await db.event.findFirst({ where: { id, userId: WORK_USER_ID }, include: eventInclude });
  if (!row) throw new WorkValidationError("Event not found.", 404);
  return row;
}
export async function listTodos() {
  return (await prisma.todo.findMany({ where: { userId: WORK_USER_ID }, include: todoInclude, orderBy: { createdAt: "desc" } })).map(todoDTO);
}
export async function getTodo(id: number) { return todoDTO(await todoRow(prisma, id)); }
export async function listEvents() {
  return (await prisma.event.findMany({ where: { userId: WORK_USER_ID }, include: eventInclude, orderBy: { date: "asc" } })).map(eventDTO);
}
export async function getEvent(id: number) { return eventDTO(await eventRow(prisma, id)); }

async function dependency(db: DB, taskId: number | null, target: number | null) {
  const seen = new Set<number>();
  let current = target;
  while (current !== null) {
    if (current === taskId || seen.has(current)) throw new WorkValidationError("This dependency would create or join a cycle.", 409);
    seen.add(current);
    const row = await db.todo.findFirst({ where: { id: current, userId: WORK_USER_ID }, select: { dependsOnId: true } });
    if (!row) throw new WorkValidationError("Choose a prerequisite belonging to the application owner.");
    current = row.dependsOnId;
  }
}
function todoData(body: Record<string, unknown>) {
  const data: { title?: string; description?: string | null; priority?: number | null; status?: "TODO" | "IN_PROGRESS" | "DONE"; dependsOnId?: number | null; rewardXp?: number; rewardCoins?: number } = {};
  if (body.title !== undefined) data.title = workText(body.title, "title", 500)!;
  if (body.description !== undefined) data.description = workText(body.description, "description", 50000, true);
  if (body.priority !== undefined) {
    if (body.priority !== null && ![1, 2, 3].includes(body.priority as number)) throw new WorkValidationError("Choose Low, Medium or High priority.");
    data.priority = body.priority as number | null;
  }
  if (body.status !== undefined) {
    if (!["TODO", "IN_PROGRESS", "DONE"].includes(body.status as string)) throw new WorkValidationError("Choose a valid task status.");
    data.status = body.status as typeof data.status;
  }
  if (body.dependsOnId !== undefined) data.dependsOnId = body.dependsOnId === null ? null : workId(body.dependsOnId);
  if (body.rewardXp !== undefined) data.rewardXp = workInteger(body.rewardXp, "XP reward");
  if (body.rewardCoins !== undefined) data.rewardCoins = workInteger(body.rewardCoins, "coin reward");
  return data;
}
export async function createTodo(value: unknown, command: WorkCommand) {
  const body = workBody(value, ["title", "description", "priority", "dependsOnId"]), data = todoData(body);
  if (!data.title) throw new WorkValidationError("Enter a task title.");
  return mutation("todo:create", body, command, async db => {
    await dependency(db, null, data.dependsOnId ?? null);
    return todoDTO(await db.todo.create({ data: { ...data, title: data.title!, userId: WORK_USER_ID, priority: data.priority === undefined ? 1 : data.priority }, include: todoInclude }));
  });
}
export async function patchTodo(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["title", "description", "priority", "dependsOnId", "status", "rewardXp", "rewardCoins"]), data = todoData(body);
  return mutation(`todo:${id}:patch`, body, command, async db => {
    const row = await todoRow(db, id); version(row, command);
    const target = data.dependsOnId === undefined ? row.dependsOnId : data.dependsOnId;
    const status = data.status ?? row.status;
    const edgeChanged = target !== row.dependsOnId;
    if (edgeChanged) await dependency(db, id, target);
    if ((status === "IN_PROGRESS" || status === "DONE") && target !== null && (edgeChanged || data.status !== undefined)) {
      const prerequisite = await db.todo.findFirst({ where: { id: target, userId: WORK_USER_ID }, select: { status: true } });
      if (prerequisite?.status !== "DONE") throw new WorkValidationError("Complete the prerequisite before starting or completing this task.", 409);
    }
    let xp = 0, coins = 0;
    const reward: { rewardAppliedXp?: number; rewardAppliedCoins?: number; rewardAccountingBasis?: string } = {};
    if (row.status !== "DONE" && status === "DONE") {
      reward.rewardAppliedXp = data.rewardXp ?? row.rewardXp;
      reward.rewardAppliedCoins = data.rewardCoins ?? row.rewardCoins;
      xp = reward.rewardAppliedXp; coins = reward.rewardAppliedCoins;
      reward.rewardAccountingBasis = "TRACKED";
    } else if (row.status === "DONE" && status !== "DONE") {
      xp = -row.rewardAppliedXp; coins = -row.rewardAppliedCoins;
      reward.rewardAppliedXp = 0; reward.rewardAppliedCoins = 0;
      reward.rewardAccountingBasis = "TRACKED";
    }
    if (xp || coins) {
      const user = await db.user.findUniqueOrThrow({ where: { id: WORK_USER_ID }, select: { totalXp: true, coins: true } });
      if ([user.totalXp + xp, user.coins + coins].some(value => !Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647)) throw new WorkValidationError("This reward change exceeds the supported balance range.", 409);
      await db.user.update({ where: { id: WORK_USER_ID }, data: { totalXp: { increment: xp }, coins: { increment: coins } } });
    }
    return todoDTO(await db.todo.update({ where: { id, userId: WORK_USER_ID }, data: { ...data, ...reward, revision: { increment: 1 } }, include: todoInclude }));
  });
}
export async function deleteTodo(id: number, command: WorkCommand) {
  return mutation(`todo:${id}:delete`, null, command, async db => {
    const row = await todoRow(db, id); version(row, command);
    if (await db.todo.count({ where: { dependsOnId: id } })) throw new WorkValidationError("Cannot delete this task because another task depends on it.", 409);
    if (await db.event.count({ where: { linkedTodoId: id, userId: { not: WORK_USER_ID } } })) throw new WorkValidationError("This task has an unexpected owner association. Review the inventory before deleting it.", 409);
    await db.event.updateMany({ where: { linkedTodoId: id, userId: WORK_USER_ID }, data: { linkedTodoId: null, revision: { increment: 1 } } });
    await db.subtask.deleteMany({ where: { todoId: id } });
    await db.todo.delete({ where: { id, userId: WORK_USER_ID } });
    // Deletion does not reverse earned rewards, matching the previous behavior.
    return { ok: true };
  });
}

export async function createSubtask(todoId: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["title"]), title = workText(body.title, "subtask title", 500)!;
  return mutation(`todo:${todoId}:subtask:create`, body, command, async db => {
    const parent = await todoRow(db, todoId); version(parent, command);
    const result = await db.subtask.create({ data: { title, todoId } });
    await db.todo.update({ where: { id: todoId, userId: WORK_USER_ID }, data: { revision: { increment: 1 } } });
    return result;
  });
}
export async function changeSubtask(id: number, value: unknown, command: WorkCommand, remove = false) {
  const body = workBody(value, ["title", "done"]);
  const data: { title?: string; done?: boolean } = {};
  if (body.title !== undefined) data.title = workText(body.title, "subtask title", 500)!;
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean") throw new WorkValidationError("Completion must be true or false.");
    data.done = body.done;
  }
  return mutation(`subtask:${id}:${remove ? "delete" : "patch"}`, body, command, async db => {
    const row = await db.subtask.findFirst({ where: { id, todo: { userId: WORK_USER_ID } } });
    if (!row) throw new WorkValidationError("Subtask not found.", 404);
    version(row, command);
    const result = remove ? (await db.subtask.delete({ where: { id } }), { success: true }) : await db.subtask.update({ where: { id }, data: { ...data, revision: { increment: 1 } } });
    await db.todo.update({ where: { id: row.todoId, userId: WORK_USER_ID }, data: { revision: { increment: 1 } } });
    return result;
  });
}
function eventData(body: Record<string, unknown>) {
  const data: { title?: string; description?: string | null; type?: string | null; date?: Date | null; endDate?: Date | null; completed?: boolean; linkedTodoId?: number | null } = {};
  if (body.title !== undefined) data.title = workText(body.title, "title", 500)!;
  if (body.description !== undefined) data.description = workText(body.description, "description", 50000, true);
  if (body.type !== undefined) data.type = workText(body.type, "event type", 100, true);
  for (const key of ["date", "endDate"] as const) if (body[key] !== undefined) {
    const error = validateEventDates(body[key], null);
    if (error) throw new WorkValidationError(error);
    data[key] = body[key] === null ? null : new Date(body[key] as string);
  }
  if (body.completed !== undefined) {
    if (typeof body.completed !== "boolean") throw new WorkValidationError("Completed must be true or false.");
    data.completed = body.completed;
  }
  if (body.linkedTodoId !== undefined) data.linkedTodoId = body.linkedTodoId === null ? null : workId(body.linkedTodoId);
  return data;
}
function eventDates(date: Date | null | undefined, endDate: Date | null | undefined) {
  const error = validateEventDates(date?.toISOString() ?? null, endDate?.toISOString() ?? null);
  if (error) throw new WorkValidationError(error);
}
export async function createEvent(value: unknown, command: WorkCommand) {
  const body = workBody(value, ["title", "description", "date", "endDate", "type"]), data = eventData(body);
  if (!data.title) throw new WorkValidationError("Enter an event title.");
  eventDates(data.date, data.endDate);
  return mutation("event:create", body, command, async db => eventDTO(await db.event.create({ data: { ...data, title: data.title!, userId: WORK_USER_ID }, include: eventInclude })));
}
export async function patchEvent(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["title", "description", "date", "endDate", "type", "completed", "linkedTodoId"]), data = eventData(body);
  return mutation(`event:${id}:patch`, body, command, async db => {
    const row = await eventRow(db, id); version(row, command);
    eventDates(data.date === undefined ? row.date : data.date, data.endDate === undefined ? row.endDate : data.endDate);
    if (data.linkedTodoId !== undefined && data.linkedTodoId !== null) await todoRow(db, data.linkedTodoId);
    return eventDTO(await db.event.update({ where: { id, userId: WORK_USER_ID }, data: { ...data, revision: { increment: 1 } }, include: eventInclude }));
  });
}
export async function deleteEvent(id: number, command: WorkCommand) {
  return mutation(`event:${id}:delete`, null, command, async db => {
    const row = await eventRow(db, id); version(row, command);
    await db.event.delete({ where: { id, userId: WORK_USER_ID } });
    return { success: true };
  });
}
export async function createLinkedTodo(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["title"]), title = workText(body.title, "task title", 500)!;
  return mutation(`event:${id}:create-todo`, body, command, async db => {
    const row = await eventRow(db, id);
    // Distinct retry keys also reuse an existing link; never overwrite it.
    if (row.linkedTodoId !== null) {
      await todoRow(db, row.linkedTodoId);
      return eventDTO(row);
    }
    version(row, command);
    const task = await db.todo.create({ data: { title, priority: 1, userId: WORK_USER_ID } });
    return eventDTO(await db.event.update({ where: { id, userId: WORK_USER_ID }, data: { linkedTodoId: task.id, revision: { increment: 1 } }, include: eventInclude }));
  });
}
