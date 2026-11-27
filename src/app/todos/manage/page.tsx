import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { redirect } from "next/navigation";

export default async function WorkDirectoryPage() {
  await requireOwnerPage();
  redirect("/settings/people");
}
