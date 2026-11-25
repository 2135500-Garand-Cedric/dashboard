"use client";

import Link from "next/link";
import TaskModal from "@/components/shared/TaskModal";
import { useState } from "react";
import type { FinanceTransaction } from "@/lib/finance/transactions";
import { activityHref } from "@/lib/finance/activity-links";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import IncomeEditor from "./IncomeEditor";
import StatementBadge from "./StatementBadge";
import Reimbursements from "./Reimbursements";
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
    [tab, setTab] = useState<"details" | "reimbursements">("details");
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
    try {
      await financeRequest(`/api/finance/activities/${transaction.id}`, {
        method: "DELETE",
        headers: { "If-Match": transaction.updatedAt },
      });
      showMessage("Financial record deleted.");
      router.push(`/finance/${kind}`);
    } catch (error) {
      setConfirmation(false);
      const message = error instanceof Error ? error.message : "Unable to delete this record.";
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
      {kind !== "expenses" && (
        <button className={`${secondaryButton} gap-2`} onClick={result.retry}>
          <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
          Reload
        </button>
      )}
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
      <TaskModal
        open={confirmation}
        title={`Delete ${kind === "income" ? "income" : kind === "expenses" ? "expense" : "transfer"}`}
        busy={busy}
        onClose={() => setConfirmation(false)}
      >
        <section className="space-y-3">
          <p>
            Delete this financial record, its supporting details, and attached files?{" "}
            {kind === "transfers"
              ? "Both sides of the transfer will be removed."
              : "Its account movement will also be removed."}
          </p>
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
      </TaskModal>
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
      {kind === "expenses" && (
        <header
          className="flex flex-wrap items-center justify-between gap-3"
          aria-label="Financial record header"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold">
              {transaction.type === "REFUND" ? "Refund details" : "Expense details"}
            </h2>
            {headerMeta}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {transaction.type === "EXPENSE" && transaction.excludedAmount === "0.0000" && (
              <div
                role="tablist"
                aria-label="Expense view"
                className="hidden rounded-lg border border-card-border p-1 md:flex"
              >
                {(["details", "reimbursements"] as const).map((value) => (
                  <button
                    key={value}
                    role="tab"
                    aria-selected={tab === value}
                    aria-controls={`expense-${value}`}
                    className={`rounded-md px-4 py-2 text-sm ${tab === value ? "bg-blue-600 text-white" : "hover:bg-white/5"}`}
                    onClick={() => setTab(value)}
                  >
                    {value === "details" ? "Details" : "Reimbursements"}
                  </button>
                ))}
              </div>
            )}
            {headerActions}
            <Link href="/finance/expenses" className={secondaryButton}>
              ← Expenses
            </Link>
          </div>
        </header>
      )}
      <div
        className={
          transaction.type === "REFUND"
            ? "grid min-w-0 items-stretch gap-5 md:grid-cols-2"
            : "space-y-5"
        }
      >
        <div
          id="expense-details"
          className={
            transaction.type === "EXPENSE" && tab === "reimbursements"
              ? "min-w-0 md:hidden"
              : "min-w-0"
          }
        >
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
              hideHeader
            />
          ) : (
            <TransactionEntry
              id={String(transaction.id)}
              headerMeta={headerMeta}
              headerActions={headerActions}
              transferOnly={kind === "transfers"}
              refundOnly={transaction.type === "REFUND"}
              hideHeader={kind === "expenses"}
            />
          )}
        </div>
        {kind === "expenses" && transaction.excludedAmount === "0.0000" && (
          <div
            id="expense-reimbursements"
            className={
              transaction.type === "EXPENSE" && tab === "details"
                ? "min-w-0 md:hidden"
                : "min-w-0 h-full [&>section]:h-full"
            }
          >
            <Reimbursements id={transaction.id} />
          </div>
        )}
      </div>
    </div>
  );
}
