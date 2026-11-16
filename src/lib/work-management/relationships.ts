import { readSnapshot } from "./read-snapshot";
import { prisma } from "@/lib/prisma";
import { mutation, getTodoInDb, version, WORK_USER_ID } from "./server";
import {
  addDependency,
  removeDependency,
  relatedLink,
  setParent,
  transitionSnapshot,
  graphStub,
  taskStubSelect,
} from "./graph";
import { workBody, workId, WorkValidationError, type WorkCommand } from "./validation";
export async function relationshipCommand(
  id: number,
  value: unknown,
  command: WorkCommand,
  remove = false,
) {
  const body = workBody(value, ["kind", "targetId"]),
    targetId = workId(body.targetId);
  if (!["parent", "child", "blocked-by", "blocks", "related"].includes(String(body.kind)))
    throw new WorkValidationError("Choose a valid relationship type.");
  return mutation(
    `todo:${id}:relationship:${remove ? "remove" : "add"}`,
    body,
    command,
    async (db) => {
      const task = await getTodoInDb(db, id);
      version(task, command);
      if (task.archivedAt)
        throw new WorkValidationError("Restore this task before changing its relationships.", 409);
      if (body.kind === "child") {
        const child = await getTodoInDb(db, targetId);
        if (remove && child.parentId !== id)
          throw new WorkValidationError("This child link no longer exists.", 409);
        await setParent(db, targetId, remove ? null : id);
      } else if (body.kind === "parent") {
        if (remove && task.parentId !== targetId)
          throw new WorkValidationError("This parent link no longer exists.", 409);
        await setParent(db, id, remove ? null : targetId);
      } else if (body.kind === "related") await relatedLink(db, id, targetId, remove);
      else {
        const dependentId = body.kind === "blocked-by" ? id : targetId,
          prerequisiteId = body.kind === "blocked-by" ? targetId : id;
        if (remove) await removeDependency(db, dependentId, prerequisiteId);
        else await addDependency(db, dependentId, prerequisiteId);
      }
      return getTodoInDb(db, id);
    },
  );
}
export async function readTransition(id: number, params: URLSearchParams) {
  return prisma.$transaction(
    async (db) => {
      await getTodoInDb(db, id);
      const snapshot = await transitionSnapshot(db, id, params.get("status") || "DONE");
      return {
        taskTitle: snapshot.taskTitle,
        futureSessionCount: snapshot.futureSessionCount,
        futureSessions: snapshot.futureSessions,
        taskRevision: snapshot.taskRevision,
        currentStatus: snapshot.currentStatus,
        archived: snapshot.archived,
        requestedStatus: snapshot.requestedStatus,
        workaround: snapshot.workaround,
        token: snapshot.token,
        blockingCount: snapshot.blockingCount,
        blockers: snapshot.blockers,
        unfinishedChildCount: snapshot.unfinishedChildCount,
        unfinishedChildren: snapshot.unfinishedChildren,
        descendantCount: snapshot.descendantCount,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function readRelationships(id: number, params: URLSearchParams) {
  const section = params.get("section") || "children",
    requested = params.has("page") ? workId(params.get("page")) : 1,
    pageSize = 20;
  if (!["children", "blocked-by", "blocks", "related"].includes(section))
    throw new WorkValidationError("Choose a valid relationship view.");
  return readSnapshot(prisma, async (db) => {
    const task = await getTodoInDb(db, id);
    if (section === "children") {
      const where = { parentId: id, userId: WORK_USER_ID },
        total = await db.todo.count({ where });
      const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
      const rows = await db.todo.findMany({
        where,
        select: taskStubSelect,
        orderBy: { id: "asc" },
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
      return {
        task,
        total,
        page,
        pageSize,
        items: rows.map((row) => ({ task: graphStub(row), origin: "USER", reviewReason: null })),
      };
    }
    if (section === "related") {
      const where = {
          OR: [{ firstId: id }, { secondId: id }],
          first: { userId: WORK_USER_ID },
          second: { userId: WORK_USER_ID },
        },
        total = await db.todoRelation.count({ where });
      const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
      const rows = await db.todoRelation.findMany({
        where,
        include: { first: { select: taskStubSelect }, second: { select: taskStubSelect } },
        orderBy: [{ firstId: "asc" }, { secondId: "asc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
      return {
        task,
        total,
        page,
        pageSize,
        items: rows.map((row) => ({
          task: graphStub(row.firstId === id ? row.second : row.first),
          origin: "USER",
          reviewReason: null,
        })),
      };
    }
    const where =
      section === "blocked-by"
        ? { dependentId: id }
        : { prerequisiteId: id, dependent: { userId: WORK_USER_ID } };
    const total = await db.todoDependency.count({ where }),
      page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await db.todoDependency.findMany({
      where,
      include: {
        dependent: { select: taskStubSelect },
        prerequisite: { select: taskStubSelect },
      },
      orderBy: [{ dependentId: "asc" }, { prerequisiteId: "asc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return {
      task,
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        task: graphStub(section === "blocked-by" ? row.prerequisite : row.dependent),
        origin: row.origin,
        reviewReason: row.legacyReviewReason,
      })),
    };
  });
}
