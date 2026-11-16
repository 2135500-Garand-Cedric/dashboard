"use client";
import type { StatementPrefill } from "@/lib/finance/statement-prefill";
import { useSettings } from "@/context/SettingsContext";
import { localToday } from "@/lib/work-management/date-format";
import ReceiptEditor from "./ReceiptEditor";
import TransactionEntry from "./TransactionEntry";
export default function NewActivity({
  kind,
  currencies,
  prefill,
}: {
  kind: "expenses" | "transfers" | "refunds";
  currencies: string[];
  prefill?: StatementPrefill;
}) {
  const { timeZone } = useSettings();
  const date = localToday(new Date(), timeZone);
  return kind === "expenses" ? (
    <ReceiptEditor initialDate={date} currencies={currencies} expenseMode prefill={prefill} />
  ) : (
    <TransactionEntry
      initialDate={date}
      transferOnly={kind === "transfers"}
      refundOnly={kind === "refunds"}
    />
  );
}
