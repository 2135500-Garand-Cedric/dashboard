import { requireOwnerPage } from "@/lib/accounts/owner-page";
import IncomeSettings from "@/components/finance/IncomeSettings";

export default async function IncomeSettingsPage() {
  await requireOwnerPage();
  return <IncomeSettings source={false} />;
}
