import { redirect } from "next/navigation";
import { getActor } from "./access";
export async function requireOwnerPage() {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  if (actor.id !== 1 || actor.role !== "OWNER") redirect("/settings/account?denied=1");
}
