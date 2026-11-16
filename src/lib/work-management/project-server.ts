import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getAppTimeZone } from "@/lib/time-zone-context";
import { mutation, version, todoRow, getTodoInDb, WORK_USER_ID } from "./server";
import { appendTaskActivity } from "./activity-server";
import { projectRow, projectReference, appendProjectActivity } from "./project-core";
import { calendarDate, parseWorkDate } from "./dates";
import {
  workBody,
  workId,
  workText,
  workInteger,
  WorkValidationError,
  type WorkCommand,
} from "./validation";
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type DB = Prisma.TransactionClient;
export async function projectCounts(db: DB, id: number) {
  const groups = await db.todo.groupBy({
    by: ["status", "archivedAt"],
    where: { projectId: id, userId: WORK_USER_ID },
    _count: true,
  });
  let total = 0,
    completed = 0,
    cancelled = 0,
    archived = 0;
  for (const group of groups) {
    if (group.archivedAt) archived += group._count;
    if (group.status === "CANCELLED") cancelled += group._count;
    else if (!group.archivedAt || group.status === "DONE") {
      total += group._count;
      if (group.status === "DONE") completed += group._count;
    }
  }
  return { total, completed, unfinished: total - completed, cancelled, archived };
}
export async function getProjectInDb(db: DB, id: number) {
  const row = await projectRow(db, id);
  return {
    ...row,
    reference: projectReference(id),
    timeZone: getAppTimeZone(),
    counts: await projectCounts(db, id),
    stages: await db.workProjectStage.findMany({
      where: { projectId: id },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
  };
}
export const getProject = (id: number) =>
  prisma.$transaction((db) => getProjectInDb(db, id), { isolationLevel: "RepeatableRead" });
export async function listProjects(params: URLSearchParams) {
  const q = (params.get("q") || "").trim(),
    view = params.get("view") || "active",
    activityType = params.get("activityType"),
    requested = params.has("page") ? workId(params.get("page")) : 1;
  if (q.length > 500 || !["active", "history", "archived", "all"].includes(view))
    throw new WorkValidationError("Choose valid project search filters.");
  const where: Prisma.WorkProjectWhereInput = {
    userId: WORK_USER_ID,
    ...(view === "archived"
      ? { archivedAt: { not: null } }
      : view === "all"
        ? {}
        : { archivedAt: null }),
    ...(view === "active"
      ? { status: "ACTIVE" }
      : view === "history"
        ? { status: { in: ["COMPLETED", "CANCELLED"] } }
        : {}),
    ...(activityType
      ? { activityTypeId: activityType === "none" ? null : workId(activityType) }
      : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { objective: { contains: q, mode: "insensitive" } },
            ...(/^PROJECT-0*([1-9]\d*)$/i.test(q)
              ? [{ id: workId(Number(q.match(/\d+$/)![0])) }]
              : []),
          ],
        }
      : {}),
  };
  return prisma.$transaction(
    async (db) => {
      const total = await db.workProject.count({ where }),
        page = Math.min(requested, Math.max(1, Math.ceil(total / 30)));
      const rows = await db.workProject.findMany({
        where,
        include: { activityType: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 30,
        skip: (page - 1) * 30,
      });
      return {
        items: await Promise.all(
          rows.map(async (row) => ({
            ...row,
            reference: projectReference(row.id),
            counts: await projectCounts(db, row.id),
          })),
        ),
        total,
        page,
        pageSize: 30,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
const fields = ["name", "objective", "summary", "activityTypeId", "startDate", "targetDate"];
function projectFields(body: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of ["name", "objective", "summary"])
    if (body[field] !== undefined)
      result[field] = workText(
        body[field],
        field,
        field === "name" ? 500 : 20000,
        field !== "name",
      );
  if (body.activityTypeId !== undefined)
    result.activityTypeId = body.activityTypeId === null ? null : workId(body.activityTypeId);
  for (const field of ["startDate", "targetDate"])
    if (body[field] !== undefined)
      result[field] = body[field] === null ? null : calendarDate(body[field]);
  return result;
}
async function validateFields(
  db: DB,
  data: Record<string, unknown>,
  previous?: Awaited<ReturnType<typeof projectRow>>,
) {
  const activityTypeId =
    data.activityTypeId === undefined ? previous?.activityTypeId : data.activityTypeId;
  if (
    activityTypeId != null &&
    activityTypeId !== previous?.activityTypeId &&
    !(await db.activityType.count({ where: { id: Number(activityTypeId), active: true } }))
  )
    throw new WorkValidationError("Choose an active calendar activity type.");
  const start = data.startDate === undefined ? previous?.startDate : data.startDate,
    end = data.targetDate === undefined ? previous?.targetDate : data.targetDate;
  if (start && end && String(start) > String(end))
    throw new WorkValidationError("The target date must be on or after the start date.");
}
export async function createProject(value: unknown, command: WorkCommand) {
  const body = workBody(value, fields),
    data = projectFields(body);
  if (!data.name) throw new WorkValidationError("Enter a project name.");
  return mutation("project:create", body, command, async (db) => {
    await validateFields(db, data);
    const row = await db.workProject.create({
      data: { ...data, name: String(data.name), userId: WORK_USER_ID },
    });
    await db.workProjectStage.createMany({
      data: ["Requirements", "Implementation", "Testing", "Launch"].map((name, position) => ({
        projectId: row.id,
        name,
        position,
      })),
    });
    await appendProjectActivity(db, row.id, "PROJECT_CREATED", {
      project: { before: null, after: json(row) },
    });
    return getProjectInDb(db, row.id);
  });
}
export async function patchProject(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, fields),
    data = projectFields(body);
  return mutation(`project:${id}:patch`, body, command, async (db) => {
    const row = await projectRow(db, id);
    version(row, command);
    if (row.archivedAt)
      throw new WorkValidationError("Restore the project before editing it.", 409);
    await validateFields(db, data, row);
    const changed = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => value !== row[key as keyof typeof row]),
    );
    if (Object.keys(changed).length) {
      const updated = await db.workProject.update({
        where: { id },
        data: { ...changed, revision: { increment: 1 } },
      });
      await appendProjectActivity(db, id, "PROJECT_EDITED", {
        project: { before: json(row), after: json(updated) },
      });
    }
    return getProjectInDb(db, id);
  });
}
async function closureState(db: DB, id: number) {
  const project = await projectRow(db, id),
    tasks = await db.todo.findMany({
      where: { projectId: id, userId: WORK_USER_ID },
      select: { id: true, revision: true, status: true, archivedAt: true },
      orderBy: { id: "asc" },
    });
  return {
    project,
    counts: await projectCounts(db, id),
    openTaskCount: tasks.filter((task) => !["DONE", "CANCELLED"].includes(task.status)).length,
    token: hash({ project, tasks }),
  };
}
export const projectTransition = (id: number) =>
  prisma.$transaction((db) => closureState(db, id), { isolationLevel: "RepeatableRead" });
export async function transitionProject(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["action", "token", "allowUnfinished", "summary"]),
    action = String(body.action);
  if (
    !["complete", "cancel", "reopen", "archive", "restore"].includes(action) ||
    (body.allowUnfinished !== undefined && typeof body.allowUnfinished !== "boolean")
  )
    throw new WorkValidationError("Choose a valid project action.");
  const summary =
    body.summary === undefined ? null : workText(body.summary, "completion summary", 4000, true);
  return mutation(`project:${id}:transition`, body, command, async (db) => {
    const state = await closureState(db, id),
      row = state.project;
    version(row, command);
    const closing = ["complete", "cancel", "archive"].includes(action);
    if (closing && (typeof body.token !== "string" || body.token !== state.token))
      throw new WorkValidationError(
        "Project tasks changed. Refresh the closure review before continuing.",
        409,
      );
    if (closing && state.openTaskCount > 0 && body.allowUnfinished !== true)
      throw new WorkValidationError(
        "Review unfinished tasks and explicitly keep them open before closing or archiving the project.",
        409,
      );
    if (row.archivedAt && action !== "restore")
      throw new WorkValidationError("Restore the project first.", 409);
    if ((action === "complete" || action === "cancel") && row.status !== "ACTIVE")
      throw new WorkValidationError("Reopen the project before changing its closure outcome.", 409);
    const now = new Date();
    const data =
      action === "archive"
        ? { archivedAt: now }
        : action === "restore"
          ? { archivedAt: null }
          : action === "reopen"
            ? { status: "ACTIVE", completedAt: null, cancelledAt: null, completionSummary: null }
            : {
                status: action === "complete" ? "COMPLETED" : "CANCELLED",
                completedAt: action === "complete" ? now : null,
                cancelledAt: action === "cancel" ? now : null,
                completionSummary: summary,
              };
    const updated = await db.workProject.update({
      where: { id },
      data: { ...data, revision: { increment: 1 } },
    });
    await appendProjectActivity(db, id, `PROJECT_${action.toUpperCase()}`, {
      project: { before: json(row), after: json(updated) },
      unfinishedKept: state.openTaskCount,
    });
    return getProjectInDb(db, id);
  });
}
export async function projectStageCommand(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["id", "name", "position", "active"]),
    stageId = body.id === undefined ? null : workId(body.id);
  if (body.active !== undefined && typeof body.active !== "boolean")
    throw new WorkValidationError("Choose an active or inactive stage.");
  const name = body.name === undefined ? undefined : workText(body.name, "stage name", 120)!;
  const position =
    body.position === undefined ? undefined : workInteger(body.position, "stage order");
  return mutation(`project:${id}:stage`, body, command, async (db) => {
    const project = await projectRow(db, id);
    version(project, command);
    if (project.archivedAt || project.status !== "ACTIVE")
      throw new WorkValidationError("Reopen/restore the project before changing stages.", 409);
    const old = stageId
      ? await db.workProjectStage.findFirst({ where: { id: stageId, projectId: id } })
      : null;
    if (stageId && !old) throw new WorkValidationError("Stage not found.", 404);
    if (!old && !name) throw new WorkValidationError("Enter a stage name.");
    if (!old && (await db.workProjectStage.count({ where: { projectId: id } })) >= 100)
      throw new WorkValidationError(
        "At most 100 stages are supported per project. Reuse an existing stage.",
      );
    if (
      name &&
      (await db.workProjectStage.count({
        where: {
          projectId: id,
          name: { equals: name, mode: "insensitive" },
          ...(old ? { id: { not: old.id } } : {}),
        },
      }))
    )
      throw new WorkValidationError("A stage with that name already exists.", 409);
    const data = {
      ...(name !== undefined ? { name } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(body.active !== undefined ? { active: body.active as boolean } : {}),
    };
    const row = old
      ? await db.workProjectStage.update({
          where: { id: old.id },
          data: { ...data, revision: { increment: 1 } },
        })
      : await db.workProjectStage.create({ data: { ...data, projectId: id, name: name! } });
    await db.workProject.update({ where: { id }, data: { revision: { increment: 1 } } });
    await appendProjectActivity(db, id, old ? "STAGE_CHANGED" : "STAGE_CREATED", {
      stage: { before: old ? json(old) : null, after: json(row) },
    });
    return getProjectInDb(db, id);
  });
}
export async function taskMembership(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["projectId", "stageId"]),
    projectId = body.projectId === null ? null : workId(body.projectId),
    stageId = body.stageId == null ? null : workId(body.stageId);
  if (!projectId && stageId) throw new WorkValidationError("A stage requires its project.");
  return mutation(`todo:${id}:project`, body, command, async (db) => {
    const task = await todoRow(db, id);
    version(task, command);
    if (task.archivedAt)
      throw new WorkValidationError("Restore the task before changing project membership.", 409);
    if (projectId) {
      const project = await projectRow(db, projectId);
      if ((project.archivedAt || project.status !== "ACTIVE") && task.projectId !== projectId)
        throw new WorkValidationError("Choose an active project.", 409);
      if (
        stageId &&
        !(await db.workProjectStage.count({
          where: { id: stageId, projectId, ...(stageId !== task.stageId ? { active: true } : {}) },
        }))
      )
        throw new WorkValidationError("Choose a stage belonging to this project.");
    }
    if (task.projectId === projectId && task.stageId === stageId) return getTodoInDb(db, id);
    await db.todo.update({
      where: { id },
      data: { projectId, stageId, revision: { increment: 1 } },
    });
    const changes = {
      membership: {
        before: { projectId: task.projectId, stageId: task.stageId },
        after: { projectId, stageId },
      },
    };
    await appendTaskActivity(db, id, "PROJECT_MEMBERSHIP_CHANGED", changes);
    for (const affected of new Set(
      [task.projectId, projectId].filter((id): id is number => id !== null),
    )) {
      await db.workProject.update({
        where: { id: affected },
        data: { revision: { increment: 1 } },
      });
      await appendProjectActivity(db, affected, "TASK_MEMBERSHIP_CHANGED", {
        taskId: id,
        ...changes,
      });
    }
    return getTodoInDb(db, id);
  });
}
export async function projectMilestones(id: number) {
  return prisma.$transaction(
    async (db) => {
      const row = await projectRow(db, id);
      return {
        projectRevision: row.revision,
        timeZone: getAppTimeZone(),
        items: await db.workKeyDate.findMany({
          where: { projectId: id, todoId: null, removedAt: null },
          orderBy: { id: "asc" },
          take: 100,
        }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function projectMilestoneCommand(id: number, value: unknown, command: WorkCommand) {
  const body = workBody(value, ["action", "id", "label", "date", "completed"]),
    action = String(body.action);
  if (!["create", "edit", "remove", "complete"].includes(action))
    throw new WorkValidationError("Choose a valid milestone action.");
  const recordId = action === "create" ? null : workId(body.id);
  const date = ["create", "edit"].includes(action)
    ? parseWorkDate(body.date, getAppTimeZone())
    : null;
  const label = date ? workText(body.label, "milestone label", 120)! : null;
  if (action === "complete" && typeof body.completed !== "boolean")
    throw new WorkValidationError("Choose the milestone completion state.");
  return mutation(`project:${id}:milestone`, body, command, async (db) => {
    const project = await projectRow(db, id);
    version(project, command);
    if (project.archivedAt)
      throw new WorkValidationError("Restore the project before editing milestones.", 409);
    const old = recordId
      ? await db.workKeyDate.findFirst({
          where: { id: recordId, projectId: id, todoId: null, removedAt: null },
        })
      : null;
    if (recordId && !old) throw new WorkValidationError("Milestone not found.", 404);
    if (!old && (await db.workKeyDate.count({ where: { projectId: id, removedAt: null } })) >= 100)
      throw new WorkValidationError("At most 100 active milestones are supported per project.");
    const row = old
      ? await db.workKeyDate.update({
          where: { id: old.id },
          data:
            action === "remove"
              ? { removedAt: new Date() }
              : action === "complete"
                ? { completedAt: body.completed ? new Date() : null }
                : { ...date!, label: label! },
        })
      : await db.workKeyDate.create({ data: { projectId: id, ...date!, label: label! } });
    await db.workProject.update({ where: { id }, data: { revision: { increment: 1 } } });
    await appendProjectActivity(db, id, `MILESTONE_${action.toUpperCase()}`, {
      milestone: { before: old ? json(old) : null, after: json(row) },
    });
    return getProjectInDb(db, id);
  });
}
