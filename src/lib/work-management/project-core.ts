import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID, OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { WorkValidationError } from "./validation";

export type WorkParent = number | { projectId: number };
export const projectReference = (id: number) => `PROJECT-${String(id).padStart(4, "0")}`;
export function parentFields(parent: WorkParent) {
  return typeof parent === "number"
    ? { todoId: parent, projectId: null }
    : { projectId: parent.projectId, todoId: null };
}
export function parentIdentity(parent: WorkParent) {
  return typeof parent === "number" ? `todo:${parent}` : `project:${parent.projectId}`;
}
export async function projectRow(db: Prisma.TransactionClient, id: number) {
  const project = await db.workProject.findFirst({
    where: { id, userId: OWNER_DATABASE_USER_ID },
    include: { activityType: true },
  });
  if (!project) throw new WorkValidationError("Project not found.", 404);
  return project;
}
export async function appendProjectActivity(
  db: Prisma.TransactionClient,
  id: number,
  action: string,
  changes: Prisma.InputJsonValue,
  noteRevisionId?: number,
) {
  await db.workActivity.create({
    data: {
      projectId: id,
      userId: OWNER_DATABASE_USER_ID,
      actorGithubId: OWNER_GITHUB_ID,
      todoReference: null,
      action,
      changes,
      noteRevisionId,
      createdAt: new Date(),
    },
  });
}

export async function validateNewMembership(
  db: Prisma.TransactionClient,
  projectId: number | null | undefined,
  stageId: number | null | undefined,
) {
  if (projectId == null) {
    if (stageId != null) throw new WorkValidationError("A stage requires a project.");
    return;
  }
  const project = await projectRow(db, projectId);
  if (project.archivedAt || project.status !== "ACTIVE")
    throw new WorkValidationError("Choose an active project.", 409);
  if (
    stageId != null &&
    !(await db.workProjectStage.count({ where: { id: stageId, projectId, active: true } }))
  )
    throw new WorkValidationError("Choose an active stage belonging to this project.");
  return project;
}
