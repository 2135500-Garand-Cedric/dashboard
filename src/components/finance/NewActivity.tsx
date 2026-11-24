"use client";
import type { StatementPrefill } from "@/lib/finance/statement-prefill";
import { useSettings } from "@/context/SettingsContext";
import { localToday } from "@/lib/work-management/date-format";
import ExpenseEditor from "./ExpenseEditor";
import TransactionEntry from "./TransactionEntry";
export default function NewActivity({
  kind,
  currencies,
  prefill,
  returnTo,
}: {
  kind: "expenses" | "transfers" | "refunds";
  currencies: string[];
  prefill?: StatementPrefill;
  returnTo?: "/";
}) {
  const { timeZone } = useSettings();
  const date = localToday(new Date(), timeZone);
  return kind === "expenses" ? (
    <ExpenseEditor
      initialDate={date}
      currencies={currencies}
      prefill={prefill}
      returnTo={returnTo}
    />
  ) : (
    <TransactionEntry
      initialDate={date}
      transferOnly={kind === "transfers"}
      refundOnly={kind === "refunds"}
    />
  );
}
