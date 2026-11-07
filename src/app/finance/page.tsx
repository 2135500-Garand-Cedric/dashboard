import FinanceOverview from "@/components/finance/FinanceOverview";
import { reportingToday } from "@/lib/finance/reporting";

export default function FinancePage() { return <FinanceOverview today={reportingToday()} />; }
