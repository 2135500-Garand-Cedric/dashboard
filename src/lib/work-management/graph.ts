import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { appendTaskActivity } from "./activity-server";
import { WorkValidationError } from "./validation";
import { isClosed, taskReference } from "./types";
type DB = Prisma.TransactionClient;
const owner = OWNER_DATABASE_USER_ID;
export const taskStubSelect = { id: true, title: true, status: true, revision: true, userId: true, parentId: true, archivedAt: true };
export type GraphTask = Prisma.TodoGetPayload<{ select: typeof taskStubSelect }>;
export function graphStub(task: GraphTask) {
  return task.userId === owner ? { id: task.id, reference: taskReference(task.id), title: task.title, status: task.status, revision: task.revision, parentId: task.parentId, archivedAt: task.archivedAt } : { id: task.id, reference: taskReference(task.id), title: "Unavailable legacy task", status: null, revision: null, parentId: null, archivedAt: null };
}
export async function ownedGraphTask(db: DB, id: number) {
  const task = await db.todo.findFirst({ where: { id, userId: owner }, select: taskStubSelect });
  if (!task) throw new WorkValidationError("Choose a task belonging to the application owner.", 400);
  return task;
}
export function assertDependencyAddition(dependent: number, prerequisite: number, edges: { dependentId: number; prerequisiteId: number; legacyReviewReason?: string | null; foreign?: boolean }[]) {
  if (dependent === prerequisite) throw new WorkValidationError("A task cannot depend on itself.", 409);
  const next = new Map<number, typeof edges>();
  for (const edge of edges) { const rows = next.get(edge.dependentId) ?? []; rows.push(edge); next.set(edge.dependentId, rows); }
  const visiting = new Set<number>(), finished = new Set<number>(), stack = [{ id: prerequisite, exit: false }];
  while (stack.length) {
    const item = stack.pop()!;
    if (item.exit) { visiting.delete(item.id); finished.add(item.id); continue; }
    if (item.id === dependent || visiting.has(item.id)) throw new WorkValidationError("This dependency would create or join a cycle.", 409);
    if (finished.has(item.id)) continue;
    visiting.add(item.id); stack.push({ id: item.id, exit: true });
    for (const edge of next.get(item.id) ?? []) {
      if (edge.legacyReviewReason || edge.foreign) throw new WorkValidationError("Review the existing legacy dependencies before linking this task.", 409);
      stack.push({ id: edge.prerequisiteId, exit: false });
    }
  }
}
export function descendants(id: number, tasks: GraphTask[]) {
  const children = new Map<number, GraphTask[]>();
  for (const task of tasks) if (task.parentId !== null) { const rows = children.get(task.parentId) ?? []; rows.push(task); children.set(task.parentId, rows); }
  const visited = new Set([id]), result: GraphTask[] = [], queue = [id];
  for (let index = 0; index < queue.length; index++) for (const child of children.get(queue[index]) ?? []) {
    if (visited.has(child.id)) throw new WorkValidationError("Review the existing task hierarchy cycle before proceeding.", 409);
    visited.add(child.id); result.push(child); queue.push(child.id);
  }
  return result;
}
export function assertParentChange(childId: number, parentId: number | null, tasks: GraphTask[]) {
  const byId = new Map(tasks.map(task => [task.id, task])), seen = new Set<number>();
  let current = parentId;
  while (current !== null) {
    if (current === childId || seen.has(current)) throw new WorkValidationError("This parent would create or join a hierarchy cycle.", 409);
    seen.add(current); const parent = byId.get(current);
    if (!parent) throw new WorkValidationError("Choose a parent belonging to the application owner.");
    current = parent.parentId;
  }
  return [...seen].map(id => byId.get(id)!);
}
const touch = (db: DB, id: number) => db.todo.update({ where: { id, userId: owner }, data: { revision: { increment: 1 } } });
export async function syncLegacyDependency(db: DB, id: number, bump = true) {
  const rows = await db.todoDependency.findMany({ where: { dependentId: id }, select: { prerequisiteId: true }, take: 2, orderBy: { prerequisiteId: "asc" } });
  await db.todo.update({ where: { id, userId: owner }, data: { dependsOnId: rows.length === 1 ? rows[0].prerequisiteId : null, ...(bump ? { revision: { increment: 1 } } : {}) } });
}
export async function addDependency(db: DB, dependentId: number, prerequisiteId: number, options: { bumpDependent?: boolean; recordDependent?: boolean; resultingStatus?: string } = {}) {
  const dependent = await ownedGraphTask(db, dependentId), prerequisite = await ownedGraphTask(db, prerequisiteId);
  if (await db.todoDependency.findUnique({ where: { dependentId_prerequisiteId: { dependentId, prerequisiteId } } })) throw new WorkValidationError("This prerequisite is already linked.", 409);
  const edges = await db.todoDependency.findMany({ where: { dependent: { userId: owner } }, select: { dependentId: true, prerequisiteId: true, legacyReviewReason: true, prerequisite: { select: { userId: true } } } });
  assertDependencyAddition(dependentId, prerequisiteId, edges.map(edge => ({ ...edge, foreign: edge.prerequisite.userId !== owner })));
  const status = options.resultingStatus ?? dependent.status;
  if ((status === "IN_PROGRESS" || isClosed(status)) && prerequisite.status !== "DONE") throw new WorkValidationError("Move this task back to To do before adding an unresolved prerequisite, then review starting or closing it explicitly.", 409);
  await db.todoDependency.create({ data: { dependentId, prerequisiteId } });
  await syncLegacyDependency(db, dependentId, options.bumpDependent !== false); await touch(db, prerequisiteId);
  if (options.recordDependent !== false) await appendTaskActivity(db, dependentId, "DEPENDENCY_ADDED", { blockedBy: { before: null, after: graphStub(prerequisite) } });
  await appendTaskActivity(db, prerequisiteId, "BLOCKS_ADDED", { blocks: { before: null, after: graphStub(dependent) } });
}
export async function removeDependency(db: DB, dependentId: number, prerequisiteId: number, options: { bumpDependent?: boolean } = {}) {
  const dependent = await ownedGraphTask(db, dependentId);
  const edge = await db.todoDependency.findUnique({ where: { dependentId_prerequisiteId: { dependentId, prerequisiteId } }, include: { prerequisite: { select: taskStubSelect } } });
  if (!edge) throw new WorkValidationError("This prerequisite link no longer exists.", 404);
  await db.todoDependency.delete({ where: { dependentId_prerequisiteId: { dependentId, prerequisiteId } } });
  await syncLegacyDependency(db, dependentId, options.bumpDependent !== false);
  await appendTaskActivity(db, dependentId, "DEPENDENCY_REMOVED", { blockedBy: { before: { ...graphStub(edge.prerequisite), legacyReviewReason: edge.legacyReviewReason }, after: null } });
  if (edge.prerequisite.userId === owner) { await touch(db, prerequisiteId); await appendTaskActivity(db, prerequisiteId, "BLOCKS_REMOVED", { blocks: { before: graphStub(dependent), after: null } }); }
}
export async function legacyDependencyWrite(db: DB, id: number, target: number | null, resultingStatus: string) {
  const edges = await db.todoDependency.findMany({ where: { dependentId: id }, select: { prerequisiteId: true } });
  if (edges.length > 1) throw new WorkValidationError("This task has multiple prerequisites. Use Relationships; the legacy single-prerequisite field cannot replace or clear them.", 409);
  if ((edges[0]?.prerequisiteId ?? null) === target) return false;
  // Validate the replacement before deleting anything; the whole command is atomic.
  if (edges.length) await removeDependency(db, id, edges[0].prerequisiteId, { bumpDependent: false });
  if (target !== null) await addDependency(db, id, target, { bumpDependent: false, resultingStatus });
  return true;
}
export async function setParent(db: DB, childId: number, parentId: number | null, options: { bumpChild?: boolean; recordChild?: boolean; expectedParentRevision?: number } = {}) {
  const child = await ownedGraphTask(db, childId);
  if (child.archivedAt) throw new WorkValidationError("Restore the child task before changing its parent.", 409);
  if (child.parentId === parentId) return;
  const tasks = await db.todo.findMany({ where: { userId: owner }, select: taskStubSelect });
  const ancestors = assertParentChange(childId, parentId, tasks);
  if (parentId !== null) {
    const parent = ancestors[0];
    if (options.expectedParentRevision !== undefined && parent.revision !== options.expectedParentRevision) throw new WorkValidationError("The parent changed. Reload it before creating this child task.", 409);
    if (parent.archivedAt) throw new WorkValidationError("Restore the parent before adding child tasks.", 409);
    const unfinished = child.status !== "DONE" || descendants(childId, tasks).some(task => task.status !== "DONE");
    if (unfinished && ancestors.some(task => isClosed(task.status))) throw new WorkValidationError("Reopen the closed parent or ancestor before adding unfinished work beneath it.", 409);
  }
  const oldParent = tasks.find(task => task.id === child.parentId);
  await db.todo.update({ where: { id: childId, userId: owner }, data: { parentId, ...(options.bumpChild === false ? {} : { revision: { increment: 1 } }) } });
  if (options.recordChild !== false) await appendTaskActivity(db, childId, "PARENT_CHANGED", { parent: { before: oldParent ? graphStub(oldParent) : child.parentId === null ? null : { id: child.parentId, reference: taskReference(child.parentId), title: "Unavailable legacy task" }, after: ancestors[0] ? graphStub(ancestors[0]) : null } });
  if (oldParent) { await touch(db, oldParent.id); await appendTaskActivity(db, oldParent.id, "CHILD_DETACHED", { child: { before: graphStub(child), after: null } }); }
  if (parentId !== null) { await touch(db, parentId); await appendTaskActivity(db, parentId, "CHILD_ATTACHED", { child: { before: null, after: graphStub(child) } }); }
}
export async function relatedLink(db: DB, id: number, otherId: number, remove: boolean) {
  if (id === otherId) throw new WorkValidationError("A task cannot be related to itself.", 409);
  const first = await ownedGraphTask(db, id), other = await ownedGraphTask(db, otherId);
  const firstId = Math.min(id, otherId), secondId = Math.max(id, otherId), where = { firstId_secondId: { firstId, secondId } };
  const existing = await db.todoRelation.findUnique({ where });
  if (remove && !existing) throw new WorkValidationError("This related-task link no longer exists.", 404);
  if (!remove && existing) throw new WorkValidationError("These tasks are already related.", 409);
  if (remove) await db.todoRelation.delete({ where }); else await db.todoRelation.create({ data: { firstId, secondId } });
  await touch(db, id); await touch(db, otherId);
  await appendTaskActivity(db, id, remove ? "RELATION_REMOVED" : "RELATION_ADDED", { related: { before: remove ? graphStub(other) : null, after: remove ? null : graphStub(other) } });
  await appendTaskActivity(db, otherId, remove ? "RELATION_REMOVED" : "RELATION_ADDED", { related: { before: remove ? graphStub(first) : null, after: remove ? null : graphStub(first) } });
}
export async function graphStats(db: DB, ids: number[]) {
  const result = new Map(ids.map(id => [id, { dependencyCount: 0, blockingCount: 0, dependencyReviewRequired: false, childCount: 0, completedChildCount: 0, dependentCount: 0, relatedCount: 0 }]));
  if (!ids.length) return result;
  const [dependencies, blocked, children, incoming, first, second] = await Promise.all([
    db.todoDependency.groupBy({ by: ["dependentId", "legacyReviewReason"], where: { dependentId: { in: ids } }, _count: { _all: true } }),
    db.todoDependency.groupBy({ by: ["dependentId"], where: { dependentId: { in: ids }, OR: [{ legacyReviewReason: { not: null } }, { prerequisite: { userId: { not: owner } } }, { prerequisite: { status: { not: "DONE" } } }] }, _count: { _all: true } }),
    db.todo.groupBy({ by: ["parentId", "status"], where: { parentId: { in: ids }, userId: owner }, _count: { _all: true } }),
    db.todoDependency.groupBy({ by: ["prerequisiteId"], where: { prerequisiteId: { in: ids }, dependent: { userId: owner } }, _count: { _all: true } }),
    db.todoRelation.groupBy({ by: ["firstId"], where: { firstId: { in: ids }, second: { userId: owner } }, _count: { _all: true } }),
    db.todoRelation.groupBy({ by: ["secondId"], where: { secondId: { in: ids }, first: { userId: owner } }, _count: { _all: true } }),
  ]);
  for (const row of dependencies) { const item = result.get(row.dependentId)!; item.dependencyCount += row._count._all; item.dependencyReviewRequired ||= row.legacyReviewReason !== null; }
  for (const row of blocked) result.get(row.dependentId)!.blockingCount = row._count._all;
  for (const row of children) { const item = result.get(row.parentId!)!; item.childCount += row._count._all; if (row.status === "DONE") item.completedChildCount += row._count._all; }
  for (const row of incoming) result.get(row.prerequisiteId)!.dependentCount = row._count._all;
  for (const row of first) result.get(row.firstId)!.relatedCount += row._count._all;
  for (const row of second) result.get(row.secondId)!.relatedCount += row._count._all;
  return result;
}
export async function transitionSnapshot(db: DB, id: number, status: string) {
  if (!["IN_PROGRESS", "DONE", "CANCELLED"].includes(status)) throw new WorkValidationError("Choose a valid start or closure action.");
  const task = await ownedGraphTask(db, id);
  const [tasks, dependencies, detail] = await Promise.all([
    db.todo.findMany({ where: { userId: owner }, select: taskStubSelect }),
    db.todoDependency.findMany({ where: { dependentId: id }, orderBy: { prerequisiteId: "asc" }, include: { prerequisite: { select: taskStubSelect } } }),
    db.todo.findUniqueOrThrow({ where: { id }, select: { workaround: true } }),
  ]);
  const children = descendants(id, tasks).sort((a, b) => a.id - b.id);
  const blocking = dependencies.filter(edge => edge.legacyReviewReason || edge.prerequisite.userId !== owner || edge.prerequisite.status !== "DONE");
  const unfinished = status === "IN_PROGRESS" ? [] : children.filter(child => child.status !== "DONE");
  const fingerprint = { id, revision: task.revision, status, dependencies: dependencies.map(edge => [edge.prerequisiteId, edge.prerequisite.revision, edge.prerequisite.status, edge.legacyReviewReason, edge.prerequisite.userId]), children: children.map(child => [child.id, child.parentId, child.revision, child.status, child.archivedAt]) };
  return {
    taskRevision: task.revision, currentStatus: task.status, archived: !!task.archivedAt, requestedStatus: status, workaround: detail.workaround,
    token: createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex"),
    blockingCount: blocking.length, blockers: blocking.slice(0, 20).map(edge => ({ ...graphStub(edge.prerequisite), reviewReason: edge.legacyReviewReason })),
    unfinishedChildCount: unfinished.length, unfinishedChildren: unfinished.slice(0, 20).map(graphStub), descendantCount: children.length,
    decision: { blockers: blocking.map(edge => ({ id: edge.prerequisiteId, reference: taskReference(edge.prerequisiteId), revision: edge.prerequisite.revision, status: edge.prerequisite.userId === owner ? edge.prerequisite.status : "UNAVAILABLE", reviewReason: edge.legacyReviewReason })), unfinishedChildren: unfinished.map(child => ({ id: child.id, reference: taskReference(child.id), parentId: child.parentId, revision: child.revision, status: child.status })) },
  };
}
export async function validateTransition(db: DB, id: number, status: string, body: Record<string, unknown>) {
  const snapshot = await transitionSnapshot(db, id, status);
  if (body.transitionToken !== undefined && body.transitionToken !== snapshot.token) throw new WorkValidationError("The task, prerequisites or child tasks changed. Review this action again before confirming.", 409);
  if (snapshot.blockingCount && (body.allowBlocked !== true || !String(body.overrideReason ?? "").trim() || body.transitionToken !== snapshot.token)) throw new WorkValidationError("This task is blocked. Review its current prerequisites and explicitly confirm an override with a reason before starting or closing it.", 409);
  if (snapshot.unfinishedChildCount && (body.allowUnfinishedChildren !== true || body.transitionToken !== snapshot.token)) throw new WorkValidationError("This task has unfinished child tasks. Review and explicitly confirm closing the parent without completing its children.", 409);
  return snapshot;
}
