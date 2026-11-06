import TransactionEntry from "@/components/finance/TransactionEntry";
import { torontoDateKey } from "@/lib/japanese/dates";
export const dynamic = "force-dynamic";
export default function NewTransactionPage() { return <TransactionEntry initialDate={torontoDateKey(new Date())} />; }
