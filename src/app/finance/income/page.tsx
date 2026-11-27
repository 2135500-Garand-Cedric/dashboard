import { requireOwnerPage } from "@/lib/accounts/owner-page";
import TransactionHistory from "@/components/finance/TransactionHistory";
export default async function ActivityPage() {
  await requireOwnerPage();
  return <TransactionHistory view="income" />;
}
