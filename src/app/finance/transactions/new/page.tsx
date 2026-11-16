import { redirect } from "next/navigation";
export default function LegacyPage() {
  redirect("/finance/transfers/new");
}
