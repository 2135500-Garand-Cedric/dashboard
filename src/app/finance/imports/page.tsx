import { requireOwnerPage } from "@/lib/accounts/owner-page";
import StatementHistory from "@/components/finance/StatementHistory";
export default async function ImportsPage() {
  await requireOwnerPage();
  return <StatementHistory />;
}
