import { redirect } from "next/navigation";
import { getActor, hasPermission } from "@/lib/accounts/access";
import type { Capability } from "@/lib/accounts/capabilities";
export default async function JapaneseAccess({
  children,
  capability,
}: {
  children: React.ReactNode;
  capability?: Capability;
}) {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  if (!actor.initialized) redirect("/onboarding");
  if (capability && !hasPermission(actor, capability)) redirect("/settings/account?denied=1");
  return <>{children}</>;
}
