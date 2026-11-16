import { redirect } from "next/navigation";

export default function LegacyIncomeSettingsPage() {
  redirect("/finance/settings");
}
