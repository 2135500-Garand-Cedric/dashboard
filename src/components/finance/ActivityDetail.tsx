"use client";

import Link from "next/link";
import { useState } from "react";
import type { FinanceTransaction } from "@/lib/finance/transactions";
import { activityHref } from "@/lib/finance/activity-links";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import IncomeEditor from "./IncomeEditor";
import StatementBadge from "./StatementBadge";
import ExpenseEditor from "./ExpenseEditor";
import TransactionEntry from "./TransactionEntry";
import { financeRequest, FinanceLoadError, secondaryButton, useFinanceData } from "./shared";
import { useSnackbar } from "@/context/SnackbarContext";
import { useRouter } from "next/navigation";

export default function ActivityDetail({
  id,
  kind,
  currencies,
}: {
  id: string;
  kind: "income" | "expenses" | "transfers";
  currencies: string[];
}) {
  const result = useFinanceData<{ transaction: FinanceTransaction }>(
    `/api/finance/transactions/${id}`,
  );
  const [selected, setSelected] = useState(0),
    [confirmation, setConfirmation] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter(),
    { showMessage } = useSnackbar();
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (result.loading || !result.data) return <p role="status">Loading financial record…</p>;
  const transaction = result.data.transaction;
  const allowed =
    kind === "income"
      ? transaction.type === "INCOME"
      : kind === "expenses"
        ? ["EXPENSE", "REFUND"].includes(transaction.type)
        : transaction.type === "TRANSFER";
  if (!allowed)
    return (
      <Link href={activityHref(transaction.id, transaction.type)} className={secondaryButton}>
        Open this record in its correct section
      </Link>
    );
  const locked = kind !== "transfers" && !!transaction.statementMatches?.length;
  const records = kind === "income" ? transaction.incomeRecords : transaction.receipts;
  const recordId = records[selected]?.id ?? records[0]?.id;
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await financeRequest(`/api/finance/activities/${transaction.id}`, {
        method: "DELETE",
        headers: { "If-Match": transaction.updatedAt },
      });
      showMessage("Financial record deleted.");
      router.push(`/finance/${kind}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete this record.";
      setError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }
  const headerMeta = (
    <>
      <span className="rounded-md bg-foreground/5 px-2 py-1 text-xs font-medium text-gray-400">
        Record #{transaction.id}
        {transaction.source === "IMPORTED" ? " · From statement" : ""}
      </span>
      <StatementBadge transaction={transaction} />
    </>
  );
  const headerActions = (
    <>
      <button className={`${secondaryButton} gap-2`} onClick={result.retry}>
        <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
        Reload
      </button>
      {transaction.source === "MANUAL" && !locked && (
        <button
          className={`${secondaryButton} border-rose-500/40`}
          onClick={() => setConfirmation(true)}
        >
          Delete {kind === "income" ? "income" : kind === "expenses" ? "expense" : "transfer"}
        </button>
      )}
    </>
  );
  return (
    <div className="space-y-5">
      {confirmation && (
        <section role="alert" className="card space-y-3">
          <p>
            Delete this financial record, its supporting details, and attached files?{" "}
            {kind === "transfers"
              ? "Both sides of the transfer will be removed."
              : "Its account movement will also be removed."}
          </p>
          {error && <p className="text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className={secondaryButton} onClick={remove}>
              {busy ? "Deleting…" : "Confirm deletion"}
            </button>
            <button
              disabled={busy}
              className={secondaryButton}
              onClick={() => setConfirmation(false)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {records.length > 1 && (
        <label className="block space-y-2">
          Supporting details
          <select
            className="rounded border border-card-border bg-card-bg p-2"
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {records.map((record, index) => (
              <option key={record.id} value={index}>
                Details #{record.id} · {record.date}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "income" ? (
        <IncomeEditor
          key={`${transaction.updatedAt}:${recordId ?? "new"}`}
          id={recordId ? String(recordId) : undefined}
          initialDate={transaction.date}
          initialTransaction={transaction}
          readOnly={locked}
          headerMeta={headerMeta}
          headerActions={headerActions}
          notesTransaction={transaction}
          currencies={currencies}
          onSaved={result.retry}
        />
      ) : kind === "expenses" && transaction.type === "EXPENSE" ? (
        <ExpenseEditor
          key={`${transaction.updatedAt}:${recordId ?? "new"}`}
          id={recordId ? String(recordId) : undefined}
          initialDate={transaction.date}
          initialTransaction={transaction}
          readOnly={locked}
          headerMeta={headerMeta}
          headerActions={headerActions}
          notesTransaction={transaction}
          currencies={currencies}
          onSaved={result.retry}
        />
      ) : (
        <TransactionEntry
          id={String(transaction.id)}
          headerMeta={headerMeta}
          headerActions={headerActions}
          transferOnly={kind === "transfers"}
          refundOnly={transaction.type === "REFUND"}
        />
      )}
    </div>
  );
}
