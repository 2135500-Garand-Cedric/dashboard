import { getActor } from "@/lib/accounts/access";
import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import ProtectedLayout from "@/components/ProtectedLayout";

export default async function HomePage() {
  const actor = await getActor();
  if (actor && actor.role !== "OWNER")
    redirect(actor.initialized ? "/japanese/practice" : "/onboarding");
  return (
    <ProtectedLayout>
      <Dashboard />
    </ProtectedLayout>
  );
}
