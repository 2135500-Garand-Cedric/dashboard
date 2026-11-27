import { getActor } from "@/lib/accounts/access";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getActor();
  if (!session) redirect("/api/auth/signin");
  if (session.role !== "OWNER" || session.id !== 1) redirect("/access-denied");
  return <>{children}</>;
}
