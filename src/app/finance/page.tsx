import { withUserTimeZone } from "@/lib/user-settings";
import FinanceOverview from "@/components/finance/FinanceOverview";
import { reportingToday } from "@/lib/finance/reporting";

export default async function FinancePage() {
  return withUserTimeZone(async () => <FinanceOverview today={reportingToday()} />);
}
