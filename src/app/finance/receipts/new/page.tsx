import ReceiptEditor from "@/components/finance/ReceiptEditor";
import { CURRENCIES } from "@/lib/finance/validation";
import { torontoDateKey } from "@/lib/japanese/dates";
export const dynamic = "force-dynamic";
export default function NewReceiptPage() { return <ReceiptEditor initialDate={torontoDateKey(new Date())} currencies={CURRENCIES} />; }
