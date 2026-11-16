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
    typeof value === "string" && /^\/(settings|events\/\d+|todos\/\d+|projects\/\d+)$/.test(value)
      ? value
      : "/settings";
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(target)}`);
  if (!isOwnerSession(session)) redirect("/access-denied");
  redirect(target);
}
