import { requireOwnerPage } from "@/lib/accounts/owner-page";
import AccountsManager from "@/components/finance/AccountsManager";
import { CURRENCIES } from "@/lib/finance/validation";

// Serialize the server's currency choices to avoid ICU-version differences
// between Node and the browser causing a hydration mismatch.
export default async function AccountsPage() {
  await requireOwnerPage();
  return <AccountsManager currencies={CURRENCIES} />;
}
