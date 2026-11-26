"use client";
import { useRef, useState, type FormEvent } from "react";
import { BanknotesIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import TaskModal from "@/components/shared/TaskModal";
import { useSnackbar } from "@/context/SnackbarContext";
import type { AccountBalance } from "@/lib/finance/balances";
import { displayAmount, twoDecimalAmount } from "@/lib/finance/transactions";
import {
  fieldClass,
  secondaryButton,
  primaryButton,
  financeRequest,
  useFinanceData,
  FinanceLoadError,
} from "./shared";
const money = (amount: string, currency: string) =>
  displayAmount(amount, currency).replace(/^\+/, "");

export function BalanceControl({
  balance,
  onSaved,
}: {
  balance: AccountBalance;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(balance.asOf),
    [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const { showMessage } = useSnackbar();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    try {
      await financeRequest(`/api/finance/accounts/${balance.id}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount, expectedRevision: balance.revision }),
      });
      showMessage("Account balance updated.");
      setOpen(false);
      onSaved();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to set balance.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p
        className={`text-2xl font-semibold tabular-nums ${balance.amount.startsWith("-") ? "text-rose-300" : "text-foreground"}`}
      >
        {money(balance.amount, balance.currency)}
      </p>
      <p className="text-xs text-muted">
        {balance.checkpoint
          ? `Balance set ${balance.checkpoint.date} + activity changes`
          : "Recorded activity · Balance not yet verified"}
        {balance.type === "CREDIT_CARD" && balance.amount.startsWith("-") ? " · Amount owed" : ""}
      </p>
      <button
        className={`${secondaryButton} gap-2`}
        onClick={() => {
          setAmount(twoDecimalAmount(balance.amount));
          setDate(balance.asOf);
          setOpen(true);
        }}
      >
        <PencilSquareIcon className="h-4 w-4" />
        Set balance<span className="sr-only"> for {balance.name}</span>
      </button>
      <TaskModal
        open={open}
        title={`Set balance · ${balance.name}`}
        busy={busy}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          <label className="block space-y-2">
            Closing date
            <input
              aria-label="Balance closing date"
              type="date"
              max={balance.asOf}
              min={balance.checkpoint?.date}
              required
              value={date}
              disabled={busy}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-2">
            Actual balance ({balance.currency})
            <input
              aria-label="Actual account balance"
              inputMode="decimal"
              required
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
              className={fieldClass}
            />
          </label>
          <p className="text-sm text-muted">
            Sets the balance for this date without creating income, an expense or a transfer. Later
            activity and edits to recorded activity update the balance.
            {balance.type === "CREDIT_CARD"
              ? " Enter a negative balance for money owed on this card."
              : ""}
          </p>
          <div className="flex gap-3">
            <button disabled={busy} className={primaryButton}>
              {busy ? "Saving…" : "Set balance"}
            </button>
            <button
              type="button"
              disabled={busy}
              className={secondaryButton}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </TaskModal>
    </div>
  );
}
export default function AccountBalances({
  currency,
  accountId,
  accountIds,
}: {
  currency: string;
  accountId: number | null;
  accountIds?: number[];
}) {
  const result = useFinanceData<{ balances: AccountBalance[] }>("/api/finance/balances");
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (result.loading || !result.data) return <p role="status">Loading account balances…</p>;
  const balances = result.data.balances.filter(
    (row) =>
      row.currency === currency &&
      (!accountId || row.id === accountId) &&
      (!accountIds || accountIds.includes(row.id)),
  );
  return (
    <section aria-label="Account balances" className="space-y-3">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <BanknotesIcon className="h-5 w-5 text-blue-400" />
        Account balances{" "}
        <span className="text-sm font-normal text-muted">Current · {currency}</span>
      </h3>
      {!balances.length && <p className="text-sm text-muted">No accounts in this currency.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {balances.map((balance) => (
          <article key={balance.id} className="card min-w-0 space-y-3">
            <h4 className="font-semibold">
              {balance.name}
              {!balance.active && <span className="ml-2 text-xs text-muted">Inactive</span>}
            </h4>
            <BalanceControl balance={balance} onSaved={result.retry} />
          </article>
        ))}
      </div>
    </section>
  );
}
