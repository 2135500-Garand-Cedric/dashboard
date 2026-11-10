import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID, OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { taskReference } from "./types";
export async function appendTaskActivity(
  db: Prisma.TransactionClient,
  id: number,
  action: string,
  changes: Prisma.InputJsonValue,
) {
  await db.workActivity.create({
    data: {
      userId: OWNER_DATABASE_USER_ID,
      actorGithubId: OWNER_GITHUB_ID,
      todoId: id,
      todoReference: taskReference(id),
      action,
      changes,
      createdAt: new Date(),
    },
  });
}
