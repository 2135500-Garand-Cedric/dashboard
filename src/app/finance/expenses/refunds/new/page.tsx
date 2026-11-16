import NewActivity from "@/components/finance/NewActivity";
import { CURRENCIES } from "@/lib/finance/validation";
export default function RefundPage() {
  return <NewActivity kind="refunds" currencies={CURRENCIES} />;
}
