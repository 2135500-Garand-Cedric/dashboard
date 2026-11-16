import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID } from "@/lib/owner-policy";
import { APP_TIME_ZONE } from "./app-time-zone";
import { runInTimeZone } from "./time-zone-context";

export async function readUserSettings() {
  const user = await prisma.user.findUnique({
    where: { id: OWNER_DATABASE_USER_ID },
    select: { timeZone: true },
  });
  return { timeZone: user?.timeZone || APP_TIME_ZONE };
}
export async function withUserTimeZone<T>(action: () => T): Promise<Awaited<T>> {
  const settings = await readUserSettings();
  return await runInTimeZone(settings.timeZone, action);
}
