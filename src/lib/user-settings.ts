import { getActor } from "./accounts/access";
import { runAsActor } from "./accounts/context.mjs";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { APP_TIME_ZONE } from "./app-time-zone";
import { runInTimeZone } from "./time-zone-context";

export async function readUserSettings(userId = OWNER_DATABASE_USER_ID) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timeZone: true },
  });
  return { timeZone: user?.timeZone || APP_TIME_ZONE };
}
export async function withUserTimeZone<T>(action: () => T): Promise<Awaited<T>> {
  const actor = await getActor();
  if (!actor) throw new Error("Authentication required.");
  return await runAsActor(actor, () => runInTimeZone(actor.timeZone || APP_TIME_ZONE, action));
}
