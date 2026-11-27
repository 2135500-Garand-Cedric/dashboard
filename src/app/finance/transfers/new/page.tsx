import { requireOwnerPage } from "@/lib/accounts/owner-page";
import NewActivity from "@/components/finance/NewActivity";
import { CURRENCIES } from "@/lib/finance/validation";
export default async function NewActivityPage() {
  await requireOwnerPage();
  return <NewActivity kind="transfers" currencies={CURRENCIES} />;
}
