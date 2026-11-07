import IncomeEditor from "@/components/finance/IncomeEditor";
import { CURRENCIES } from "@/lib/finance/validation";
import { torontoDateKey } from "@/lib/japanese/dates";
export const dynamic = "force-dynamic";
export default function NewIncomePage() { return <IncomeEditor initialDate={torontoDateKey(new Date())} currencies={CURRENCIES} />; }
