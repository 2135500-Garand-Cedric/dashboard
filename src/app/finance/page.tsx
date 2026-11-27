import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { withUserTimeZone } from "@/lib/user-settings";
import FinanceOverview from "@/components/finance/FinanceOverview";
import { reportingToday } from "@/lib/finance/reporting";

export default async function FinancePage() {
  await requireOwnerPage();
  return withUserTimeZone(async () => <FinanceOverview today={reportingToday()} />);
}
