import AccountsManager from "@/components/finance/AccountsManager";
import { CURRENCIES } from "@/lib/finance/validation";

// Serialize the server's currency choices to avoid ICU-version differences
// between Node and the browser causing a hydration mismatch.
export default function AccountsPage() { return <AccountsManager currencies={CURRENCIES} />; }
