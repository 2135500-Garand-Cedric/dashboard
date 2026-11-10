import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { validateEventDates } from "@/lib/event-dates";
import { WorkValidationError, workBody, workId, workText, type WorkCommand } from "./validation";

import { parseWorkQuery, workQueryWhere, workQueryOrder, WORK_PAGE_SIZE } from "./query";
import { taskReference, isClosed } from "./types";
import { TASK_FIELDS, parseTaskFields, lifecycleData, taskChanges, activityAction } from "./task-foundation";

import { appendTaskActivity } from "./activity-server";
export { appendTaskActivity } from "./activity-server";
import { taskStubSelect, graphStub, graphStats, addDependency, legacyDependencyWrite, setParent, validateTransition } from "./graph";

export const WORK_USER_ID = OWNER_DATABASE_USER_ID;
type DB = Prisma.TransactionClient;
const todoInclude = { prerequisites: { include: { prerequisite: { select: taskStubSelect } }, orderBy: { prerequisiteId: "asc" as const }, take: 2 }, parent: { select: taskStubSelect }, requester: true, waitingOnContact: true, affectedPeople: { include: { contact: true }, orderBy: { contactId: "asc" as const } }, context: true, subtasks: { orderBy: { id: "asc" as const } } };
const eventInclude = { linkedTodo: true };
type TodoRow = Prisma.TodoGetPayload<{ include: typeof todoInclude }>;
type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;
const todoDTO = (row: TodoRow) => {
  const { prerequisites, parent, ...fields } = row;
  const single = prerequisites.length === 1 ? prerequisites[0].prerequisite : null;
  return { ...fields, reference: taskReference(row.id), legacyPriority: row.priority,
    priority: row.priorityLevel === "LOW" ? 1 : row.priorityLevel === "NORMAL" ? 2 : row.priorityLevel === "HIGH" ? 3 : row.priorityLevel === "URGENT" ? null : row.priority,
    requester: row.requester?.userId === WORK_USER_ID ? row.requester : null,
    waitingOnContact: row.waitingOnContact?.userId === WORK_USER_ID ? row.waitingOnContact : null,
    affectedPeople: row.affectedPeople.filter(link => link.contact.userId === WORK_USER_ID).map(link => link.contact),
    context: row.context?.userId === WORK_USER_ID ? row.context : null,
    parent: parent?.userId === WORK_USER_ID ? graphStub(parent) : null,
    dependsOnId: single?.id ?? null,
    dependsOn: single?.userId === WORK_USER_ID ? graphStub(single) : null,
    legacyDependencyWritable: prerequisites.length < 2,
  };
};
export async function serializeTodos(db: DB, rows: TodoRow[]) {
  const stats = await graphStats(db, rows.map(row => row.id));
  return rows.map(row => { const detail = stats.get(row.id)!; return { ...todoDTO(row), ...detail, isBlocked: detail.blockingCount > 0 }; });
}
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
export function version(row: { revision: number }, command: WorkCommand) {
  if (row.revision !== command.revision) throw new WorkValidationError("This record changed in another window. Reload it before saving.", 409);
}
export async function mutation(operation: string, input: unknown, command: WorkCommand, action: (db: DB) => Promise<unknown>) {
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
export async function todoRow(db: DB, id: number) {
  const row = await db.todo.findFirst({ where: { id, userId: WORK_USER_ID }, include: todoInclude });
  if (!row) throw new WorkValidationError("Task not found.", 404);
  return row;
}
async function eventRow(db: DB, id: number) {
  const row = await db.event.findFirst({ where: { id, userId: WORK_USER_ID }, include: eventInclude });
  if (!row) throw new WorkValidationError("Event not found.", 404);
  return row;
}
export async function listTodos(includeArchived = false) {
  return prisma.$transaction(async db => serializeTodos(db, await db.todo.findMany({ where: { userId: WORK_USER_ID, ...(includeArchived ? {} : { archivedAt: null }) }, include: todoInclude, orderBy: { createdAt: "desc" } })), { isolationLevel: "RepeatableRead" });
}
export async function getTodoInDb(db: DB, id: number) {
  const row = await todoRow(db, id);
  const [edges, supportingRecordCount] = await Promise.all([
    db.todoDependency.findMany({ where: { prerequisiteId: id, dependent: { userId: WORK_USER_ID } }, include: { dependent: { select: taskStubSelect } }, orderBy: { dependentId: "asc" }, take: 30 }),
    db.workNote.count({ where: { todoId: id, userId: WORK_USER_ID } }).then(async count => count + await db.workAttachment.count({ where: { todoId: id, userId: WORK_USER_ID } })),
  ]);
  return { ...(await serializeTodos(db, [row]))[0], dependents: edges.map(edge => graphStub(edge.dependent)), supportingRecordCount };
}
export async function getTodo(id: number) {
  return prisma.$transaction(db => getTodoInDb(db, id), { isolationLevel: "RepeatableRead" });
}
export async function searchWork(params: URLSearchParams) {
  const query = parseWorkQuery(params), where = workQueryWhere(query, WORK_USER_ID);
  return prisma.$transaction(async db => {
    const total = await db.todo.count({ where }), page = Math.min(query.page, Math.max(1, Math.ceil(total / WORK_PAGE_SIZE)));
    const rows = await db.todo.findMany({ where, include: todoInclude, orderBy: workQueryOrder(query.sort), skip: (page - 1) * WORK_PAGE_SIZE, take: WORK_PAGE_SIZE });
    return { items: await serializeTodos(db, rows), total, page, pageSize: WORK_PAGE_SIZE };
  }, { isolationLevel: "RepeatableRead" });
}
export async function listEvents() {
  return (await prisma.event.findMany({ where: { userId: WORK_USER_ID }, include: eventInclude, orderBy: { date: "asc" } })).map(eventDTO);
}
export async function getEvent(id: number) { return eventDTO(await eventRow(prisma, id)); }

async function recordTaskActivity(db: DB, before: TodoRow | null, after: TodoRow) {
  const changes = taskChanges(before as unknown as Record<string, unknown> | null, after as unknown as Record<string, unknown>);
  if (!Object.keys(changes).length) return;
  await appendTaskActivity(db, after.id, activityAction(before, after, changes), changes as Prisma.InputJsonValue);
}
async function validateContext(db: DB, id: number | null | undefined, previous?: number | null) {
  if (id == null) return;
  const context = await db.workContext.findFirst({ where: { id, userId: WORK_USER_ID } });
  if (!context || (!context.active && id !== previous)) throw new WorkValidationError("Choose an active context belonging to the application owner.");
}
async function defaultContext(db: DB): Promise<number | null> {
  return (await db.workContext.findFirst({ where: { userId: WORK_USER_ID, key: "personal", active: true }, select: { id: true } }))?.id ?? null;
}
export async function createTodo(value: unknown, command: WorkCommand) {
  const body = workBody(value, TASK_FIELDS), data = parseTaskFields(body);
  if (body.archived !== undefined || body.closureMode !== undefined || body.acceptWorkaround !== undefined || data.completionSummary) throw new WorkValidationError("Create the task first, then close or archive it explicitly.");
  if (body.transitionToken !== undefined || body.allowBlocked !== undefined || body.overrideReason !== undefined || body.allowUnfinishedChildren !== undefined) throw new WorkValidationError("Create the task first, then review starting or closing it explicitly.");
  if (data.parentId != null && body.parentRevision === undefined) throw new WorkValidationError("Reload the parent before creating a child; its revision is required.", 428);
  if (data.parentId == null && body.parentRevision !== undefined) throw new WorkValidationError("A parent revision requires a parent task.");
  if (isClosed(data.status ?? "NEW")) throw new WorkValidationError("Create the task first, then close it explicitly.");
  if (!data.title) throw new WorkValidationError("Enter a task title.");
  return mutation("todo:create", body, command, async db => {
    const contextId = data.contextId === undefined ? await defaultContext(db) : data.contextId;
    await validateContext(db, contextId);
    await validatePeople(db, body);
    const { dependsOnId, parentId, ...columns } = data;
    const row = await db.todo.create({ data: { ...columns, title: data.title!, userId: WORK_USER_ID, contextId, status: data.status ?? "NEW", priorityLevel: data.priorityLevel ?? "NORMAL", kind: data.kind ?? "TASK" }, include: todoInclude });
    if (parentId != null) await setParent(db, row.id, parentId, { bumpChild: false, recordChild: false, expectedParentRevision: workId(body.parentRevision) });
    if (dependsOnId != null) await addDependency(db, row.id, dependsOnId, { bumpDependent: false, recordDependent: false });
    await replaceAffected(db, row.id, body);
    const created = await todoRow(db, row.id);
    await recordTaskActivity(db, null, created);
    return (await serializeTodos(db, [created]))[0];
  });
}
export async function patchTodo(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, TASK_FIELDS), parsed = parseTaskFields(body);
  if (body.parentId !== undefined || body.parentRevision !== undefined) throw new WorkValidationError("Use Relationships to change a task parent.");
  if (["transitionToken", "allowBlocked", "overrideReason", "allowUnfinishedChildren"].some(key => body[key] !== undefined) && !["IN_PROGRESS", "DONE", "CANCELLED"].includes(String(body.status))) throw new WorkValidationError("Transition decisions apply only when starting or closing the task.");
  return mutation(`todo:${id}:patch`, body, command, async db => {
    const row = await todoRow(db, id); version(row, command);
    if (body.priority === null && row.priorityLevel === "URGENT") throw new WorkValidationError("Use the named priority when editing an Urgent task.", 409);
    const data = lifecycleData(row, parsed, body, new Date());
    await validateContext(db, data.contextId, row.contextId);
    await validatePeople(db, body, row);
    const status = data.status ?? row.status;
    if (data.dependsOnId !== undefined) {
      await legacyDependencyWrite(db, id, data.dependsOnId, status);
      delete data.dependsOnId;
    }
    const review = body.status !== undefined && ["IN_PROGRESS", "DONE", "CANCELLED"].includes(status) ? await validateTransition(db, id, status, body) : null;
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
    await replaceAffected(db, id, body);
    const updated = await db.todo.update({ where: { id, userId: WORK_USER_ID }, data: { ...data, ...reward, revision: { increment: 1 } }, include: todoInclude });
    await recordTaskActivity(db, row, updated);
    if (review?.blockingCount) await appendTaskActivity(db, id, "BLOCKED_OVERRIDE", { decision: { before: review.decision.blockers, after: { action: status, reason: String(body.overrideReason).trim(), reviewedToken: review.token } } });
    if (review?.unfinishedChildCount) await appendTaskActivity(db, id, "UNFINISHED_CHILDREN_ACKNOWLEDGED", { decision: { before: review.decision.unfinishedChildren, after: { action: status, explicitlyAcknowledged: true, reviewedToken: review.token } } });
    return (await serializeTodos(db, [updated]))[0];
  });
}
export async function deleteTodo(id: number, command: WorkCommand) {
  return mutation(`todo:${id}:delete`, null, command, async db => {
    const row = await todoRow(db, id); version(row, command);
    if (await db.workNote.count({ where: { todoId: id } }) || await db.workAttachment.count({ where: { todoId: id } })) throw new WorkValidationError("Archive this task to preserve its notes, revisions and attachment history. Tasks with supporting records cannot be permanently deleted.", 409);
    if (row.parentId !== null || await db.todo.count({ where: { parentId: id } })) throw new WorkValidationError("Unlink the parent and child tasks first, or archive this task. No tasks will be automatically reparented or deleted.", 409);
    if (await db.todoDependency.count({ where: { OR: [{ dependentId: id }, { prerequisiteId: id }] } }) || await db.todoRelation.count({ where: { OR: [{ firstId: id }, { secondId: id }] } })) throw new WorkValidationError("Unlink the task relationships first, or archive it. Related tasks and dependency history will be preserved.", 409);
    if (await db.event.count({ where: { linkedTodoId: id, userId: { not: WORK_USER_ID } } })) throw new WorkValidationError("This task has an unexpected owner association. Review the inventory before deleting it.", 409);
    await db.event.updateMany({ where: { linkedTodoId: id, userId: WORK_USER_ID }, data: { linkedTodoId: null, revision: { increment: 1 } } });
    await appendTaskActivity(db, id, "DELETED", { task: { before: { title: row.title, status: row.status, reference: taskReference(id) }, after: null } });
    await db.todoAffectedContact.deleteMany({ where: { todoId: id } });
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
    await appendTaskActivity(db, todoId, "CHECKLIST_ADDED", { checklist: { before: null, after: { id: result.id, title: result.title, done: result.done } } });
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
    await appendTaskActivity(db, row.todoId, remove ? "CHECKLIST_REMOVED" : "CHECKLIST_UPDATED", { checklist: { before: { id: row.id, title: row.title, done: row.done }, after: remove ? null : { id: row.id, title: data.title ?? row.title, done: data.done ?? row.done } } });
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
    const task = await db.todo.create({ data: { title, userId: WORK_USER_ID, contextId: await defaultContext(db) }, include: todoInclude });
    await recordTaskActivity(db, null, task);
    return eventDTO(await db.event.update({ where: { id, userId: WORK_USER_ID }, data: { linkedTodoId: task.id, revision: { increment: 1 } }, include: eventInclude }));
  });
}

export async function taskActivity(id: number) {
  await todoRow(prisma, id);
  return prisma.workActivity.findMany({ where: { userId: WORK_USER_ID, todoId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
}
export async function listWorkContexts() {
  return prisma.workContext.findMany({ where: { userId: WORK_USER_ID }, orderBy: [{ active: "desc" }, { name: "asc" }] });
}
function contextData(value: unknown) {
  const body = workBody(value, ["name", "active"]);
  const data: { name?: string; normalizedName?: string; active?: boolean } = {};
  if (body.name !== undefined) {
    data.name = workText(body.name, "context name", 80)!.normalize("NFKC").trim();
    data.normalizedName = data.name.toLocaleLowerCase("en-CA");
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") throw new WorkValidationError("Active must be true or false.");
    data.active = body.active;
  }
  return { body, data };
}
export async function createWorkContext(value: unknown, command: WorkCommand) {
  const { body, data } = contextData(value);
  if (!data.name) throw new WorkValidationError("Enter a context name.");
  return mutation("context:create", body, command, async db => {
    if (await db.workContext.count({ where: { userId: WORK_USER_ID, normalizedName: data.normalizedName } })) throw new WorkValidationError("A context with this name already exists.", 409);
    return db.workContext.create({ data: { ...data, name: data.name!, normalizedName: data.normalizedName!, userId: WORK_USER_ID, key: command.requestKey } });
  });
}
export async function patchWorkContext(id: number, value: unknown, command: WorkCommand) {
  const { body, data } = contextData(value);
  return mutation(`context:${id}:patch`, body, command, async db => {
    const row = await db.workContext.findFirst({ where: { id, userId: WORK_USER_ID } });
    if (!row) throw new WorkValidationError("Context not found.", 404);
    version(row, command);
    if (data.normalizedName && await db.workContext.count({ where: { userId: WORK_USER_ID, normalizedName: data.normalizedName, id: { not: id } } })) throw new WorkValidationError("A context with this name already exists.", 409);
    return db.workContext.update({ where: { id, userId: WORK_USER_ID }, data: { ...data, revision: { increment: 1 } } });
  });
}


function affectedIds(body: Record<string, unknown>): number[] | undefined {
  if (body.affectedContactIds === undefined) return undefined;
  if (!Array.isArray(body.affectedContactIds) || body.affectedContactIds.length > 30) throw new WorkValidationError("Choose at most 30 affected people.");
  const ids = body.affectedContactIds.map(workId);
  if (new Set(ids).size !== ids.length) throw new WorkValidationError("Choose each affected person only once.");
  return ids;
}
async function validatePeople(db: DB, body: Record<string, unknown>, previous?: TodoRow) {
  const links = affectedIds(body), prior = new Set(previous?.affectedPeople.map(link => link.contactId) ?? []);
  const assignments = [
    ...(["requesterId", "waitingOnContactId"] as const).filter(key => body[key] != null).map(key => ({ id: workId(body[key]), existing: previous?.[key] === body[key] })),
    ...(links ?? []).map(id => ({ id, existing: prior.has(id) })),
  ];
  for (const assignment of assignments) {
    const contact = await db.workContact.findFirst({ where: { id: assignment.id, userId: WORK_USER_ID } });
    if (!contact || (!contact.active && !assignment.existing)) throw new WorkValidationError("Choose an active contact belonging to the application owner.");
  }
}
async function replaceAffected(db: DB, todoId: number, body: Record<string, unknown>) {
  const ids = affectedIds(body);
  if (ids === undefined) return;
  await db.todoAffectedContact.deleteMany({ where: { todoId } });
  if (ids.length) await db.todoAffectedContact.createMany({ data: ids.map(contactId => ({ todoId, contactId })) });
}
function contactData(value: unknown) {
  const body = workBody(value, ["name", "company", "active"]);
  const data: { name?: string; company?: string | null; active?: boolean } = {};
  if (body.name !== undefined) data.name = workText(body.name, "contact name", 120)!.normalize("NFC");
  if (body.company !== undefined) data.company = workText(body.company, "contact company", 120, true)?.trim() || null;
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") throw new WorkValidationError("Active must be true or false.");
    data.active = body.active;
  }
  return { body, data };
}
export async function listWorkContacts(params: URLSearchParams) {
  const q = (params.get("q") || "").trim();
  if (q.length > 120) throw new WorkValidationError("Contact search is too long.");
  const page = params.has("page") ? workId(params.get("page")) : 1;
  const where = { userId: WORK_USER_ID, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { company: { contains: q, mode: "insensitive" as const } }] } : {}) };
  return prisma.$transaction(async db => {
    const total = await db.workContact.count({ where }), current = Math.min(page, Math.max(1, Math.ceil(total / 30)));
    const items = await db.workContact.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }], skip: (current - 1) * 30, take: 30 });
    return { items, total, page: current, pageSize: 30 };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getWorkContact(id: number) {
  const row = await prisma.workContact.findFirst({ where: { id, userId: WORK_USER_ID } });
  if (!row) throw new WorkValidationError("Contact not found.", 404);
  return row;
}
export async function createWorkContact(value: unknown, command: WorkCommand) {
  const { body, data } = contactData(value);
  if (!data.name) throw new WorkValidationError("Enter a contact name.");
  return mutation("contact:create", body, command, db => db.workContact.create({ data: { ...data, name: data.name!, userId: WORK_USER_ID } }));
}
export async function patchWorkContact(id: number, value: unknown, command: WorkCommand) {
  const { body, data } = contactData(value);
  return mutation(`contact:${id}:patch`, body, command, async db => {
    const row = await db.workContact.findFirst({ where: { id, userId: WORK_USER_ID } });
    if (!row) throw new WorkValidationError("Contact not found.", 404);
    version(row, command);
    return db.workContact.update({ where: { id, userId: WORK_USER_ID }, data: { ...data, revision: { increment: 1 } } });
  });
}
