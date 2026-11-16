import NewActivity from "@/components/finance/NewActivity";
import { CURRENCIES } from "@/lib/finance/validation";
export default function NewActivityPage() {
  return <NewActivity kind="transfers" currencies={CURRENCIES} />;
}
