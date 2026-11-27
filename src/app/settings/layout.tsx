import { getActor } from "@/lib/accounts/access";
import { redirect } from "next/navigation";
// Shared landing/account; each private child page retains its owner guard.
export default async function Layout({ children }: { children: React.ReactNode }) {
  if (!(await getActor())) redirect("/signin");
  return <>{children}</>;
}
