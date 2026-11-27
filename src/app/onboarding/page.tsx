import { getActor } from "@/lib/accounts/access";
import { redirect } from "next/navigation";
import AccountForm from "@/components/accounts/AccountForm";
export default async function Page() {
  const actor = await getActor();
  if (!actor) redirect("/signin");
  if (actor.initialized) redirect("/japanese/practice");
  return <AccountForm setup />;
}
