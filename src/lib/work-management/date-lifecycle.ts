import type { Prisma } from "@/generated/prisma";
import { appendTaskActivity } from "./activity-server";
export async function retireFollowUps(db: Prisma.TransactionClient, id: number) {
  const active = await db.workFollowUp.findMany({ where: { todoId: id, status: "ACTIVE" } });
  for (const row of active) {
    const updated = await db.workFollowUp.update({
      where: { id: row.id },
      data: { status: "CANCELLED", resolvedAt: new Date(), outcome: "TASK_CLOSED" },
    });
    await appendTaskActivity(
      db,
      id,
      "FOLLOW_UP_RETIRED",
      JSON.parse(JSON.stringify({ followUp: { before: row, after: updated } })),
    );
  }
}
