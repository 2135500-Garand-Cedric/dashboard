import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isOwnerSession } from "@/lib/owner-policy";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/api/auth/signin");
  if (!isOwnerSession(session)) redirect("/access-denied");
  return <>{children}</>;
}
