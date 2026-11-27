import { recordSaveFailure } from "@/lib/audit/failure";
import { prepareWorkAudit, finishWorkAudit } from "@/lib/audit/work";
import { articleRow as knowledgeArticleRow } from "@/lib/knowledge/core";
import { OWNER_GITHUB_ID as knowledgeActor } from "@/lib/owner-policy";
import { linkOccasionTask } from "@/lib/calendar-occasion-core";
import { recurrenceVisibility } from "./recurrence-visibility";
import { ensureOccurrences } from "@/lib/recurrence/engine.mjs";
import { attachRecurrence, skipOccurrence } from "./recurrence-core";
import { parseWorkDate } from "./dates";
import { readSnapshot, memoTaskRead } from "./read-snapshot";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { WorkValidationError, workBody, workId, workText, type WorkCommand } from "./validation";

import { parseWorkQuery, workQueryWhere, workQueryOrder, WORK_PAGE_SIZE } from "./query";
import { taskReference, isClosed } from "./types";
import {
  TASK_FIELDS,
  parseTaskFields,
  lifecycleData,
  taskChanges,
  activityAction,
} from "./task-foundation";

import { appendTaskActivity } from "./activity-server";
export { appendTaskActivity } from "./activity-server";
import {
  taskStubSelect,
  graphStub,
  graphStats,
  addDependency,
  legacyDependencyWrite,
  setParent,
  validateTransition,
} from "./graph";

import { getAppTimeZone } from "@/lib/time-zone-context";
import { dateSortInstant, workDateState } from "./dates";
import { retireFollowUps } from "./date-lifecycle";

import { validateNewMembership, appendProjectActivity } from "./project-core";

export const WORK_USER_ID = OWNER_DATABASE_USER_ID;
type DB = Prisma.TransactionClient;
export const todoInclude = {
  followUps: { where: { status: "ACTIVE" }, take: 1 },
  prerequisites: {
    include: { prerequisite: { select: taskStubSelect } },
    orderBy: { prerequisiteId: "asc" as const },
    take: 2,
  },
  parent: { select: taskStubSelect },
  requester: true,
  affectedPeople: { include: { contact: true }, orderBy: { contactId: "asc" as const } },
  activityType: true,
  project: true,
  stage: true,
  subtasks: { orderBy: { id: "asc" as const } },
};
import {
  EVENT_FIELDS,
  eventInclude,
  eventDTO,
  eventRow,
  parseEventFields,
  checkEventTimes,
  parseEventLinks,
  writeEventLinks,
  legacyEventLink,
  appendEventActivity,
  detachTaskEvents,
  removeEventLinks,
} from "./event-core";
type TodoRow = Prisma.TodoGetPayload<{ include: typeof todoInclude }>;
const todoDTO = (row: TodoRow, now = new Date()) => {
  const { prerequisites, parent, followUps, ...fields } = row;
  const single = prerequisites.length === 1 ? prerequisites[0].prerequisite : null;
  return {
    ...fields,
    project: row.project?.userId === WORK_USER_ID ? row.project : null,
    stage:
      row.project?.userId === WORK_USER_ID && row.stage?.projectId === row.projectId
        ? row.stage
        : null,
    timeZone: getAppTimeZone(),
    deadlineState: workDateState(
      { date: row.deadlineDate, at: row.deadlineAt, timeZone: row.deadlineTimeZone },
      "deadline",
      now,
      getAppTimeZone(),
      !isClosed(row.status) && !row.archivedAt,
    ),
    activeFollowUp: followUps[0]
      ? {
          ...followUps[0],
          state: workDateState(
            followUps[0],
            "followup",
            now,
            getAppTimeZone(),
            !isClosed(row.status) && !row.archivedAt,
          ),
        }
      : null,
    reference: taskReference(row.id),
    legacyPriority: row.priority,
    priority:
      row.priorityLevel === "LOW"
        ? 1
        : row.priorityLevel === "NORMAL"
          ? 2
          : row.priorityLevel === "HIGH"
            ? 3
            : row.priorityLevel === "URGENT"
              ? null
              : row.priority,
    requester: row.requester?.userId === WORK_USER_ID ? row.requester : null,
    affectedPeople: row.affectedPeople
      .filter((link) => link.contact.userId === WORK_USER_ID)
      .map((link) => link.contact),
    parent: parent?.userId === WORK_USER_ID ? graphStub(parent) : null,
    dependsOnId: single?.id ?? null,
    dependsOn: single?.userId === WORK_USER_ID ? graphStub(single) : null,
    legacyDependencyWritable: prerequisites.length < 2,
  };
};
export async function serializeTodos(db: DB, rows: TodoRow[], now = new Date()) {
  const stats = await graphStats(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => {
    const detail = stats.get(row.id)!;
    return { ...todoDTO(row, now), ...detail, isBlocked: detail.blockingCount > 0 };
  });
}
// Every task/event/checklist writer takes the same transaction-scoped owner lock.
// Read committed ensures a waiter validates the graph AFTER the prior commit.
export async function workTransaction<T>(action: (db: DB) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(62019, ${WORK_USER_ID}::integer)`;
      const owner = await db.user.findUnique({ where: { id: WORK_USER_ID }, select: { id: true } });
      if (!owner)
        throw new WorkValidationError(
          "The configured application owner is missing. Restore or review the owner mapping.",
          409,
        );
      return action(db);
    },
    { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 15000 },
  );
}
export function version(row: { revision: number }, command: WorkCommand) {
  if (row.revision !== command.revision)
    throw new WorkValidationError(
      "This record changed in another window. Reload it before saving.",
      409,
    );
}
export async function mutation(
  operation: string,
  input: unknown,
  command: WorkCommand,
  action: (db: DB) => Promise<unknown>,
) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        operation,
        command.revision ?? null,
        input && typeof input === "object" && !Array.isArray(input)
          ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))
          : input,
      ]),
    )
    .digest("hex");
  return workTransaction(async (db) => {
    const previous = await db.workMutationReceipt.findUnique({
      where: { userId_requestKey: { userId: WORK_USER_ID, requestKey: command.requestKey } },
    });
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new WorkValidationError(
          "This request identifier was already used for a different change. Reload and try again.",
          409,
        );
      return previous.result;
    }
    const audit = await prepareWorkAudit(db, operation, input);
    const result = JSON.parse(JSON.stringify(await action(db))) as Prisma.InputJsonValue;
    await finishWorkAudit(db, operation, result, command.requestKey, audit);
    await db.workMutationReceipt.create({
      data: {
        userId: WORK_USER_ID,
        requestKey: command.requestKey,
        fingerprint,
        operation,
        result,
      },
    });
    return result;
  }).catch(async (error) => {
    const area = operation.split(":")[0];
    if (!operation.includes("draft"))
      await recordSaveFailure(
        area === "knowledge"
          ? "KNOWLEDGE"
          : area === "event"
            ? "CALENDAR"
            : area === "contact"
              ? "PEOPLE"
              : "WORK",
        "command",
        error,
      );
    throw error;
  });
}
export async function todoRow(db: DB, id: number) {
  return memoTaskRead(db, "todoRow:" + id, async () => {
    const row = await db.todo.findFirst({
      where: { id, userId: WORK_USER_ID },
      include: todoInclude,
    });
    if (!row) throw new WorkValidationError("Task not found.", 404);
    return row;
  });
}
export async function listTodos(includeArchived = false) {
  await ensureOccurrences(prisma, WORK_USER_ID);
  return prisma.$transaction(
    async (db) =>
      serializeTodos(
        db,
        await db.todo.findMany({
          where: {
            userId: WORK_USER_ID,
            ...(includeArchived ? {} : { archivedAt: null }),
            ...(await recurrenceVisibility(db)).task,
          },
          include: todoInclude,
          orderBy: { createdAt: "desc" },
        }),
      ),
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getTodoInDb(db: DB, id: number) {
  return memoTaskRead(db, "getTodoInDb:" + id, async () => {
    const row = await todoRow(db, id);
    const [edges, supportingRecordCount] = await Promise.all([
      db.todoDependency.findMany({
        where: { prerequisiteId: id, dependent: { userId: WORK_USER_ID } },
        include: { dependent: { select: taskStubSelect } },
        orderBy: { dependentId: "asc" },
        take: 30,
      }),
      Promise.all([
        db.workNote.count({ where: { todoId: id, userId: WORK_USER_ID } }),
        db.workAttachment.count({ where: { todoId: id, userId: WORK_USER_ID } }),
        db.workFollowUp.count({ where: { todoId: id } }),
        db.workKeyDate.count({ where: { todoId: id } }),
      ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)),
    ]);
    return {
      ...(await serializeTodos(db, [row]))[0],
      dependents: edges.map((edge) => graphStub(edge.dependent)),
      supportingRecordCount,
    };
  });
}
export async function getTodo(id: number) {
  return prisma.$transaction((db) => getTodoInDb(db, id), { isolationLevel: "RepeatableRead" });
}
export async function searchWork(params: URLSearchParams) {
  const query = parseWorkQuery(params),
    baseWhere = workQueryWhere(query, WORK_USER_ID);
  await ensureOccurrences(prisma, WORK_USER_ID);
  return prisma.$transaction(
    async (db) => {
      const where = { AND: [baseWhere, (await recurrenceVisibility(db)).task] };
      const total = await db.todo.count({ where }),
        page = Math.min(query.page, Math.max(1, Math.ceil(total / WORK_PAGE_SIZE)));
      let orderIds: number[] | null = null;
      if (["deadline", "followup"].includes(query.sort)) {
        // Fetch only ordering scalars, then load the one paginated set of full records.
        const candidates = await db.todo.findMany({
          where,
          select: {
            id: true,
            deadlineDate: true,
            deadlineAt: true,
            deadlineTimeZone: true,
            followUps: {
              where: { status: "ACTIVE" },
              take: 1,
              select: { date: true, at: true, timeZone: true },
            },
          },
        });
        const cache = new Map<string, number>();
        const key = (row: (typeof candidates)[number]) => {
          const value =
            query.sort === "deadline"
              ? { date: row.deadlineDate, at: row.deadlineAt, timeZone: row.deadlineTimeZone }
              : (row.followUps[0] ?? { date: null, at: null, timeZone: null });
          const identity = JSON.stringify(value);
          if (!cache.has(identity))
            cache.set(
              identity,
              dateSortInstant(value, query.sort as "deadline" | "followup", getAppTimeZone()),
            );
          return cache.get(identity)!;
        };
        orderIds = candidates
          .sort((a, b) => {
            const left = key(a),
              right = key(b);
            return (left === right ? 0 : left < right ? -1 : 1) || a.id - b.id;
          })
          .slice((page - 1) * WORK_PAGE_SIZE, page * WORK_PAGE_SIZE)
          .map((row) => row.id);
      }
      const rows = await db.todo.findMany({
        where: orderIds ? { AND: [where, { id: { in: orderIds } }] } : where,
        include: todoInclude,
        orderBy: workQueryOrder(query.sort),
        ...(orderIds ? {} : { skip: (page - 1) * WORK_PAGE_SIZE, take: WORK_PAGE_SIZE }),
      });
      if (orderIds) {
        const rank = new Map(orderIds.map((id, index) => [id, index]));
        rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
      }
      return { items: await serializeTodos(db, rows), total, page, pageSize: WORK_PAGE_SIZE };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function listEvents() {
  await ensureOccurrences(prisma, WORK_USER_ID);
  return prisma.$transaction(
    async (db) =>
      (
        await db.event.findMany({
          where: { userId: WORK_USER_ID, ...(await recurrenceVisibility(db)).event },
          include: eventInclude,
          orderBy: { date: "asc" },
        })
      ).map(eventDTO),
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getEvent(id: number) {
  return eventDTO(await eventRow(prisma, id));
}

async function recordTaskActivity(db: DB, before: TodoRow | null, after: TodoRow) {
  const changes = taskChanges(
    before as unknown as Record<string, unknown> | null,
    after as unknown as Record<string, unknown>,
  );
  if (!Object.keys(changes).length) return;
  await appendTaskActivity(
    db,
    after.id,
    activityAction(before, after, changes),
    changes as Prisma.InputJsonValue,
  );
}
async function validateActivityType(
  db: DB,
  id: number | null | undefined,
  previous?: number | null,
) {
  if (id == null || id === previous) return;
  if (!(await db.activityType.findFirst({ where: { id, active: true } })))
    throw new WorkValidationError("Choose an active calendar activity type.");
}
export async function createTodo(value: unknown, command: WorkCommand) {
  const body = workBody(value, TASK_FIELDS),
    data = parseTaskFields(body);
  if (
    body.archived !== undefined ||
    body.closureMode !== undefined ||
    body.acceptWorkaround !== undefined ||
    data.completionSummary
  )
    throw new WorkValidationError("Create the task first, then close or archive it explicitly.");
  if (
    body.transitionToken !== undefined ||
    body.allowBlocked !== undefined ||
    body.overrideReason !== undefined ||
    body.allowUnfinishedChildren !== undefined
  )
    throw new WorkValidationError(
      "Create the task first, then review starting or closing it explicitly.",
    );
  if (data.parentId != null && body.parentRevision === undefined)
    throw new WorkValidationError(
      "Reload the parent before creating a child; its revision is required.",
      428,
    );
  if (data.parentId == null && body.parentRevision !== undefined)
    throw new WorkValidationError("A parent revision requires a parent task.");
  if (isClosed(data.status ?? "NEW"))
    throw new WorkValidationError("Create the task first, then close it explicitly.");
  if (!data.title) throw new WorkValidationError("Enter a task title.");
  return mutation("todo:create", body, command, async (db) => {
    const firstDeadline =
      body.firstDeadline === undefined ? null : parseWorkDate(body.firstDeadline, getAppTimeZone());
    const project = await validateNewMembership(db, data.projectId, data.stageId);
    const activityTypeId =
      data.activityTypeId === undefined ? (project?.activityTypeId ?? null) : data.activityTypeId;
    await validateActivityType(db, activityTypeId);
    await validatePeople(db, body);
    const { dependsOnId, parentId, ...columns } = data;
    const row = await db.todo.create({
      data: {
        ...columns,
        ...(firstDeadline
          ? {
              deadlineDate: firstDeadline.date,
              deadlineAt: firstDeadline.at ? new Date(firstDeadline.at) : null,
              deadlineTimeZone: firstDeadline.timeZone,
            }
          : {}),
        title: data.title!,
        userId: WORK_USER_ID,
        activityTypeId,
        status: data.status ?? "NEW",
        priorityLevel: data.priorityLevel ?? "NORMAL",
        kind: data.kind ?? "TASK",
      },
      include: todoInclude,
    });
    if (parentId != null)
      await setParent(db, row.id, parentId, {
        bumpChild: false,
        recordChild: false,
        expectedParentRevision: workId(body.parentRevision),
      });
    if (dependsOnId != null)
      await addDependency(db, row.id, dependsOnId, {
        bumpDependent: false,
        recordDependent: false,
      });
    await replaceAffected(db, row.id, body);
    if (body.knowledgeArticleId != null) {
      const article = await knowledgeArticleRow(db, workId(body.knowledgeArticleId));
      await db.knowledgeTaskLink.create({
        data: {
          articleId: article.id,
          todoId: row.id,
          userId: WORK_USER_ID,
          actorGithubId: knowledgeActor,
        },
      });
      await appendTaskActivity(db, row.id, "DOCUMENTATION_LINKED", { articleId: article.id });
    }
    if (body.occasion !== undefined) await linkOccasionTask(db, body.occasion, row.id);
    if (body.recurrence != null) await attachRecurrence(db, "TASK", row.id, body.recurrence);
    const created = await todoRow(db, row.id);
    await recordTaskActivity(db, null, created);
    if (created.projectId !== null) {
      await db.workProject.update({
        where: { id: created.projectId },
        data: { revision: { increment: 1 } },
      });
      await appendProjectActivity(db, created.projectId, "TASK_ADDED", { taskId: created.id });
    }
    return (await serializeTodos(db, [created]))[0];
  });
}
export async function patchTodo(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, TASK_FIELDS);
  return mutation(`todo:${id}:patch`, body, command, (db) =>
    patchTodoInTransaction(db, id, body, command),
  );
}
export async function patchTodoInTransaction(
  db: DB,
  id: number,
  value: unknown,
  command: WorkCommand,
) {
  const body = workBody(value, TASK_FIELDS),
    parsed = parseTaskFields(body);
  if (
    body.recurrence !== undefined ||
    body.firstDeadline !== undefined ||
    body.occasion !== undefined ||
    body.knowledgeArticleId !== undefined
  )
    throw new WorkValidationError("Use the repeating schedule controls to change recurrence.");
  if (body.projectId !== undefined || body.stageId !== undefined)
    throw new WorkValidationError("Use the project selector to move this task.");
  if (body.parentId !== undefined || body.parentRevision !== undefined)
    throw new WorkValidationError("Use Relationships to change a task parent.");
  if (
    ["transitionToken", "allowBlocked", "overrideReason", "allowUnfinishedChildren"].some(
      (key) => body[key] !== undefined,
    ) &&
    !["IN_PROGRESS", "DONE", "CANCELLED"].includes(String(body.status))
  )
    throw new WorkValidationError(
      "Transition decisions apply only when starting or closing the task.",
    );
  const row = await todoRow(db, id);
  version(row, command);
  if (body.priority === null && row.priorityLevel === "URGENT")
    throw new WorkValidationError("Use the named priority when editing an Urgent task.", 409);
  const data = lifecycleData(row, parsed, body, new Date());
  await validateActivityType(db, data.activityTypeId, row.activityTypeId);
  await validatePeople(db, body, row);
  const status = data.status ?? row.status;
  if (data.dependsOnId !== undefined) {
    await legacyDependencyWrite(db, id, data.dependsOnId, status);
    delete data.dependsOnId;
  }
  const review =
    body.status !== undefined && ["IN_PROGRESS", "DONE", "CANCELLED"].includes(status)
      ? await validateTransition(db, id, status, body)
      : null;
  if (!isClosed(row.status) && isClosed(status)) await retireFollowUps(db, id);
  await replaceAffected(db, id, body);
  const updated = await db.todo.update({
    where: { id, userId: WORK_USER_ID },
    data: { ...data, revision: { increment: 1 } },
    include: todoInclude,
  });
  await recordTaskActivity(db, row, updated);
  if (review?.blockingCount)
    await appendTaskActivity(db, id, "BLOCKED_OVERRIDE", {
      decision: {
        before: review.decision.blockers,
        after: {
          action: status,
          reason: String(body.overrideReason).trim(),
          reviewedToken: review.token,
        },
      },
    });
  if (review?.unfinishedChildCount)
    await appendTaskActivity(db, id, "UNFINISHED_CHILDREN_ACKNOWLEDGED", {
      decision: {
        before: review.decision.unfinishedChildren,
        after: { action: status, explicitlyAcknowledged: true, reviewedToken: review.token },
      },
    });
  return (await serializeTodos(db, [updated]))[0];
}
export async function deleteTodo(id: number, command: WorkCommand) {
  return mutation(`todo:${id}:delete`, null, command, async (db) => {
    const row = await todoRow(db, id);
    version(row, command);
    if (
      (await db.workFollowUp.count({ where: { todoId: id } })) ||
      (await db.workKeyDate.count({ where: { todoId: id } }))
    )
      throw new WorkValidationError(
        "This task has retained history and cannot be permanently deleted.",
        409,
      );
    if (
      (await db.knowledgeTaskLink.count({ where: { todoId: id, userId: WORK_USER_ID } })) ||
      (await db.workNote.count({ where: { todoId: id } })) ||
      (await db.workAttachment.count({ where: { todoId: id } }))
    )
      throw new WorkValidationError(
        "Archive this task to preserve its documentation, notes, revisions and attachment history. Tasks with supporting records cannot be permanently deleted.",
        409,
      );
    if (row.parentId !== null || (await db.todo.count({ where: { parentId: id } })))
      throw new WorkValidationError(
        "Unlink the parent and child tasks first, or archive this task. No tasks will be automatically reparented or deleted.",
        409,
      );
    if (
      (await db.todoDependency.count({
        where: { OR: [{ dependentId: id }, { prerequisiteId: id }] },
      })) ||
      (await db.todoRelation.count({ where: { OR: [{ firstId: id }, { secondId: id }] } }))
    )
      throw new WorkValidationError(
        "Unlink the task relationships first, or archive it. Related tasks and dependency history will be preserved.",
        409,
      );
    if (await db.event.count({ where: { linkedTodoId: id, userId: { not: WORK_USER_ID } } }))
      throw new WorkValidationError(
        "This task has an unexpected owner association. Review the inventory before deleting it.",
        409,
      );
    if (await db.workFocus.count({ where: { todoId: id } }))
      throw new WorkValidationError("Archive this task to preserve its focus history.", 409);
    await detachTaskEvents(db, id);
    if (row.projectId !== null) {
      await db.workProject.update({
        where: { id: row.projectId },
        data: { revision: { increment: 1 } },
      });
      await appendProjectActivity(db, row.projectId, "TASK_DELETED", {
        task: {
          before: { id, reference: taskReference(id), title: row.title, stageId: row.stageId },
          after: null,
        },
      });
    }
    await appendTaskActivity(db, id, "DELETED", {
      task: {
        before: { title: row.title, status: row.status, reference: taskReference(id) },
        after: null,
      },
    });
    await db.todoAffectedContact.deleteMany({ where: { todoId: id } });
    await db.subtask.deleteMany({ where: { todoId: id } });
    await skipOccurrence(db, row);
    await db.todo.delete({ where: { id, userId: WORK_USER_ID } });
    return { ok: true };
  });
}

export async function createSubtask(todoId: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["title"]),
    title = workText(body.title, "subtask title", 500)!;
  return mutation(`todo:${todoId}:subtask:create`, body, command, async (db) => {
    const parent = await todoRow(db, todoId);
    version(parent, command);
    const result = await db.subtask.create({ data: { title, todoId } });
    await db.todo.update({
      where: { id: todoId, userId: WORK_USER_ID },
      data: { revision: { increment: 1 } },
    });
    await appendTaskActivity(db, todoId, "CHECKLIST_ADDED", {
      checklist: { before: null, after: { id: result.id, title: result.title, done: result.done } },
    });
    return result;
  });
}
export async function changeSubtask(
  id: number,
  value: unknown,
  command: WorkCommand,
  remove = false,
) {
  const body = workBody(value, ["title", "done"]);
  const data: { title?: string; done?: boolean } = {};
  if (body.title !== undefined) data.title = workText(body.title, "subtask title", 500)!;
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean")
      throw new WorkValidationError("Completion must be true or false.");
    data.done = body.done;
  }
  return mutation(`subtask:${id}:${remove ? "delete" : "patch"}`, body, command, async (db) => {
    const row = await db.subtask.findFirst({ where: { id, todo: { userId: WORK_USER_ID } } });
    if (!row) throw new WorkValidationError("Subtask not found.", 404);
    version(row, command);
    const result = remove
      ? (await db.subtask.delete({ where: { id } }), { success: true })
      : await db.subtask.update({ where: { id }, data: { ...data, revision: { increment: 1 } } });
    await db.todo.update({
      where: { id: row.todoId, userId: WORK_USER_ID },
      data: { revision: { increment: 1 } },
    });
    await appendTaskActivity(db, row.todoId, remove ? "CHECKLIST_REMOVED" : "CHECKLIST_UPDATED", {
      checklist: {
        before: { id: row.id, title: row.title, done: row.done },
        after: remove
          ? null
          : { id: row.id, title: data.title ?? row.title, done: data.done ?? row.done },
      },
    });
    return result;
  });
}
export async function createEvent(value: unknown, command: WorkCommand) {
  const body = workBody(value, EVENT_FIELDS),
    data = parseEventFields(body);
  if (body.completed !== undefined || body.linkedTodoId !== undefined)
    throw new WorkValidationError("Create the event first, then complete or link it explicitly.");
  if (!data.title) throw new WorkValidationError("Enter an event title.");
  return mutation("event:create", body, command, async (db) => {
    checkEventTimes({
      kind: data.kind ?? "ORDINARY",
      date: data.date ?? null,
      endDate: data.endDate ?? null,
      timeZone: data.timeZone ?? null,
      allDayStart: data.allDayStart ?? null,
      allDayEnd: data.allDayEnd ?? null,
    });
    const row = await db.event.create({
      data: { ...data, title: String(data.title), userId: WORK_USER_ID },
      include: eventInclude,
    });
    checkEventTimes(row);
    await writeEventLinks(
      db,
      row.id,
      body.links === undefined ? [] : parseEventLinks(body.links),
      row.kind,
    );
    await appendEventActivity(db, row.id, "CREATED", {
      event: { before: null, after: eventDTO(row) },
    });
    if (body.recurrence != null) await attachRecurrence(db, "EVENT", row.id, body.recurrence);
    return eventDTO(await eventRow(db, row.id));
  });
}
export async function patchEvent(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, EVENT_FIELDS),
    data = parseEventFields(body);
  if (body.recurrence !== undefined)
    throw new WorkValidationError("Use the repeating schedule controls to change recurrence.");
  if (body.linkedTodoId !== undefined && body.links !== undefined)
    throw new WorkValidationError("Send only one task-link representation.");
  return mutation(`event:${id}:patch`, body, command, async (db) => {
    const row = await eventRow(db, id);
    version(row, command);
    if (row.conversions.some((item) => item.mode === "PLACEHOLDER") && body.kind === "WORK_SESSION")
      throw new WorkValidationError(
        "Undo the placeholder conversion before turning this event into a session.",
        409,
      );
    checkEventTimes({ ...row, ...data });
    const updated = await db.event.update({
      where: { id, userId: WORK_USER_ID },
      data: { ...data, revision: { increment: 1 } },
      include: eventInclude,
    });
    checkEventTimes(updated);
    if (body.links !== undefined)
      await writeEventLinks(db, id, parseEventLinks(body.links), updated.kind);
    else if (body.linkedTodoId !== undefined) {
      if (body.linkedTodoId !== null) await todoRow(db, workId(body.linkedTodoId));
      await legacyEventLink(
        db,
        updated,
        body.linkedTodoId === null ? null : workId(body.linkedTodoId),
      );
    } else if (updated.kind !== row.kind)
      await writeEventLinks(
        db,
        id,
        row.taskLinks.map((link) => ({ todoId: link.todoId, role: link.role })),
        updated.kind,
      );
    await appendEventActivity(db, id, "UPDATED", {
      event: { before: eventDTO(row), after: eventDTO(await eventRow(db, id)) },
    });
    for (const link of row.taskLinks)
      if (
        link.todo.userId === WORK_USER_ID &&
        (body.date !== undefined || body.endDate !== undefined || body.timing !== undefined)
      )
        await appendTaskActivity(db, link.todoId, "EVENT_RESCHEDULED", {
          event: {
            before: {
              id,
              date: row.date,
              endDate: row.endDate,
              allDayStart: row.allDayStart,
              allDayEnd: row.allDayEnd,
            },
            after: {
              id,
              date: updated.date,
              endDate: updated.endDate,
              allDayStart: updated.allDayStart,
              allDayEnd: updated.allDayEnd,
            },
          },
        });
    return eventDTO(await eventRow(db, id));
  });
}
export async function deleteEvent(id: number, command: WorkCommand) {
  return mutation(`event:${id}:delete`, null, command, async (db) => {
    const row = await eventRow(db, id);
    version(row, command);
    await appendEventActivity(db, id, "DELETED", { event: { before: eventDTO(row), after: null } });
    await removeEventLinks(db, row);
    await skipOccurrence(db, row);
    await db.event.delete({ where: { id, userId: WORK_USER_ID } });
    return { success: true };
  });
}
export async function taskActivity(id: number) {
  await todoRow(prisma, id);
  return prisma.workActivity.findMany({
    where: { userId: WORK_USER_ID, todoId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
}
function affectedIds(body: Record<string, unknown>): number[] | undefined {
  if (body.affectedContactIds === undefined) return undefined;
  if (!Array.isArray(body.affectedContactIds) || body.affectedContactIds.length > 30)
    throw new WorkValidationError("Choose at most 30 affected people.");
  const ids = body.affectedContactIds.map(workId);
  if (new Set(ids).size !== ids.length)
    throw new WorkValidationError("Choose each affected person only once.");
  return ids;
}
async function validatePeople(db: DB, body: Record<string, unknown>, previous?: TodoRow) {
  const links = affectedIds(body),
    prior = new Set(previous?.affectedPeople.map((link) => link.contactId) ?? []);
  const assignments = [
    ...(["requesterId"] as const)
      .filter((key) => body[key] != null)
      .map((key) => ({ id: workId(body[key]), existing: previous?.[key] === body[key] })),
    ...(links ?? []).map((id) => ({ id, existing: prior.has(id) })),
  ];
  for (const assignment of assignments) {
    const contact = await db.workContact.findFirst({
      where: { id: assignment.id, userId: WORK_USER_ID },
    });
    if (!contact || (!contact.active && !assignment.existing))
      throw new WorkValidationError("Choose an active contact belonging to the application owner.");
  }
}
async function replaceAffected(db: DB, todoId: number, body: Record<string, unknown>) {
  const ids = affectedIds(body);
  if (ids === undefined) return;
  await db.todoAffectedContact.deleteMany({ where: { todoId } });
  if (ids.length)
    await db.todoAffectedContact.createMany({
      data: ids.map((contactId) => ({ todoId, contactId })),
    });
}
function contactData(value: unknown) {
  const body = workBody(value, ["name", "company", "email", "phone", "notes", "active"]);
  const data: {
    name?: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    active?: boolean;
  } = {};
  if (body.name !== undefined)
    data.name = workText(body.name, "contact name", 120)!.normalize("NFC");
  if (body.company !== undefined)
    data.company = workText(body.company, "contact company", 120, true)?.trim() || null;
  if (body.email !== undefined) {
    data.email = workText(body.email, "email address", 254, true)?.trim() || null;
    if (data.email && !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(data.email))
      throw new WorkValidationError("Enter a valid email address.");
  }
  if (body.phone !== undefined)
    data.phone = workText(body.phone, "phone number", 40, true)?.trim() || null;
  if (body.notes !== undefined)
    data.notes = workText(body.notes, "person notes", 2000, true)?.trim() || null;
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean")
      throw new WorkValidationError("Active must be true or false.");
    data.active = body.active;
  }
  return { body, data };
}
export async function listWorkContacts(params: URLSearchParams) {
  const q = (params.get("q") || "").trim();
  if (q.length > 120) throw new WorkValidationError("Contact search is too long.");
  const page = params.has("page") ? workId(params.get("page")) : 1;
  const where = {
    userId: WORK_USER_ID,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { company: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  return readSnapshot(prisma, async (db) => {
    const total = await db.workContact.count({ where }),
      current = Math.min(page, Math.max(1, Math.ceil(total / 30)));
    const items = await db.workContact.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
      skip: (current - 1) * 30,
      take: 30,
    });
    return { items, total, page: current, pageSize: 30 };
  });
}
export async function getWorkContact(id: number) {
  const row = await prisma.workContact.findFirst({ where: { id, userId: WORK_USER_ID } });
  if (!row) throw new WorkValidationError("Contact not found.", 404);
  return row;
}
export async function createWorkContact(value: unknown, command: WorkCommand) {
  const { body, data } = contactData(value);
  if (!data.name) throw new WorkValidationError("Enter a contact name.");
  return mutation("contact:create", body, command, (db) =>
    db.workContact.create({ data: { ...data, name: data.name!, userId: WORK_USER_ID } }),
  );
}
export async function patchWorkContact(id: number, value: unknown, command: WorkCommand) {
  const { body, data } = contactData(value);
  return mutation(`contact:${id}:patch`, body, command, async (db) => {
    const row = await db.workContact.findFirst({ where: { id, userId: WORK_USER_ID } });
    if (!row) throw new WorkValidationError("Contact not found.", 404);
    version(row, command);
    return db.workContact.update({
      where: { id, userId: WORK_USER_ID },
      data: { ...data, revision: { increment: 1 } },
    });
  });
}
