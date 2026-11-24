import NotificationSourceOpen from "@/components/notifications/NotificationSourceOpen";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isOwnerSession } from "@/lib/owner-policy";

// Preserve the reminder destination when a phone's login session has expired.
export default async function OpenReminder({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const value = (await searchParams).target;
  const target =
    typeof value === "string" &&
    /^\/(settings|events\/\d+|todos\/\d+|projects\/\d+|notifications(?:\/[a-f0-9-]{36})?)$/.test(
      value,
    )
      ? value
      : "/settings";
  const session = await getServerSession(authOptions);
  if (!session)
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(`/notifications/open?target=${encodeURIComponent(target)}`)}`,
    );
  if (!isOwnerSession(session)) redirect("/access-denied");
  if (/^\/notifications\/[a-f0-9-]{36}$/.test(target))
    return <NotificationSourceOpen id={target.split("/")[2]} />;
  redirect(target);
}
