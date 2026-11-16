"use client";

import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import FinanceExport from "./FinanceExport";
import ActivityCard from "./ActivityCard";
import HistoryFilters, { HistoryFiltersButton } from "./HistoryFilters";
import { useHistoryFilters } from "./useHistoryFilters";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSnackbar } from "@/context/SnackbarContext";
import { type FinanceAccount, type FinanceCategory } from "@/lib/finance/validation";
import {
  TRANSACTION_TYPES,
  type FinanceTransaction,
  type TransactionPage,
} from "@/lib/finance/transactions";
import {
  fieldClass,
  financeRequest,
  FinanceLoadError,
  primaryButton,
  secondaryButton,
  useFinanceData,
} from "./shared";

const emptyFilters = {
  search: "",
  account: "",
  category: "",
  type: "",
  currency: "",
  from: "",
  to: "",
};
export default function TransactionHistory({
  view = "all",
}: {
  view?: "all" | "expenses" | "income" | "transfers";
}) {
  const title =
    view === "all"
      ? "Transaction history"
      : view === "expenses"
        ? "Expenses"
        : view === "income"
          ? "Income history"
          : "Transfers";
  const singular =
    view === "all"
      ? "transaction"
      : view === "expenses"
        ? "expense"
        : view === "income"
          ? "income record"
          : "transfer";
  const base = view === "all" ? "/finance/transactions" : `/finance/${view}`;
  const { draft, setDraft, filters, setFilters, page, setPage, filtersOpen, setFiltersOpen } =
    useHistoryFilters(emptyFilters);
  const [deleting, setDeleting] = useState<FinanceTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deleteConfirmation = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (deleting) deleteConfirmation.current?.focus();
  }, [deleting]);
  const { showMessage } = useSnackbar();
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const categories = useFinanceData<{ categories: FinanceCategory[] }>("/api/finance/categories");
  const params = new URLSearchParams({ page: String(page) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (view !== "all") {
    params.set("activity", view);
    if (view !== "expenses") {
      params.delete("type");
      params.delete("category");
    }
  }
  const history = useFinanceData<TransactionPage>(`/api/finance/transactions?${params}`);
  const update = (key: keyof typeof draft, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  function apply(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...draft });
    history.retry();
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      await financeRequest(`/api/finance/transactions/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      showMessage("Transaction deleted successfully.");
      if (history.data?.transactions.length === 1 && page > 1) setPage(page - 1);
      else history.retry();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete the transaction.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <div className="flex flex-wrap gap-2">
          <HistoryFiltersButton
            open={filtersOpen}
            onToggle={() => setFiltersOpen((open) => !open)}
            filters={filters}
          />
          {view === "expenses" && (
            <Link href="/finance/expenses/refunds/new" className={secondaryButton}>
              Record refund
            </Link>
          )}
          <Link
            href={`${base}/new`}
            className={
              view === "income" || view === "expenses"
                ? `${secondaryButton} gap-2 ${view === "income" ? "!border-emerald-500/30" : "!border-rose-500/30"}`
                : primaryButton
            }
          >
            {(view === "income" || view === "expenses") && (
              <PlusIcon
                className={`h-4 w-4 ${view === "income" ? "text-emerald-400" : "text-rose-400"}`}
                aria-hidden="true"
              />
            )}
            Add {view === "income" ? "income" : singular}
          </Link>
        </div>
      </div>
      <HistoryFilters open={filtersOpen}>
        <form onSubmit={apply} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 sm:col-span-2">
            Search
            <input
              aria-label={`Search ${view === "all" ? "transactions" : view}`}
              className={fieldClass}
              value={draft.search}
              maxLength={200}
              placeholder="Description, counterparty, or notes"
              onChange={(event) => update("search", event.target.value)}
            />
          </label>
          <label className="space-y-1">
            Account
            <select
              aria-label="Filter account"
              className={fieldClass}
              value={draft.account}
              onChange={(event) => update("account", event.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.data?.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {!account.active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
          {(view === "all" || view === "expenses") && (
            <label className="space-y-1">
              Category
              <select
                aria-label="Filter category"
                className={fieldClass}
                value={draft.category}
                onChange={(event) => update("category", event.target.value)}
              >
                <option value="">All categories</option>
                {categories.data?.categories
                  .filter((category) => view === "all" || category.type === "EXPENSE")
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.type === "INCOME" ? "Income" : "Expense"})
                      {!category.active ? " (inactive)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {(view === "all" || view === "expenses") && (
            <label className="space-y-1">
              Type
              <select
                aria-label="Filter type"
                className={fieldClass}
                value={draft.type}
                onChange={(event) => update("type", event.target.value)}
              >
                <option value="">All types</option>
                {Object.entries(TRANSACTION_TYPES)
                  .filter(([key]) => view === "all" || ["EXPENSE", "REFUND"].includes(key))
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="space-y-1">
            Currency
            <select
              aria-label="Filter currency"
              className={fieldClass}
              value={draft.currency}
              onChange={(event) => update("currency", event.target.value)}
            >
              <option value="">All currencies</option>
              {[...new Set(accounts.data?.accounts.map((account) => account.currency) ?? [])]
                .sort()
                .map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
            </select>
          </label>
          <label className="space-y-1">
            From
            <input
              aria-label="From date"
              type="date"
              className={fieldClass}
              value={draft.from}
              onChange={(event) => update("from", event.target.value)}
            />
          </label>
          <label className="space-y-1">
            To
            <input
              aria-label="To date"
              type="date"
              className={fieldClass}
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) => update("to", event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
            <button className={primaryButton}>Apply filters</button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setDraft(emptyFilters);
                setFilters(emptyFilters);
              }}
            >
              Reset
            </button>
          </div>
        </form>
        <FinanceExport
          kind="transactions"
          filename={view === "all" ? undefined : `finance-${view}.csv`}
          filters={
            view === "all"
              ? filters
              : {
                  ...filters,
                  activity: view,
                  ...(view !== "expenses" ? { type: "", category: "" } : {}),
                }
          }
        />
      </HistoryFilters>
      {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}
      {categories.error && <FinanceLoadError error={categories.error} retry={categories.retry} />}
      {deleting && (
        <section role="alert" className="card space-y-3 border-rose-500">
          <h3 className="break-words font-semibold">Delete “{deleting.description}”?</h3>
          <p>
            {deleting.transfer
              ? "Both sides of this transfer will be deleted."
              : "This transaction will be permanently deleted."}
          </p>
          {error && <p className="text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <button
              ref={deleteConfirmation}
              disabled={busy}
              onClick={remove}
              className={`${primaryButton} bg-rose-600 hover:bg-rose-700`}
            >
              {busy ? "Deleting…" : "Confirm deletion"}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDeleting(null);
                setError("");
              }}
              className={secondaryButton}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {history.error && <FinanceLoadError error={history.error} retry={history.retry} />}
      {history.loading ? (
        <p role="status">Loading {view === "all" ? "transactions" : view}…</p>
      ) : (
        !history.error &&
        history.data && (
          <>
            <p className="text-sm text-gray-500">
              {history.data.total}{" "}
              {history.data.total === 1
                ? singular
                : view === "income"
                  ? "income records"
                  : view === "all"
                    ? "transactions"
                    : view}
            </p>
            {!history.data.transactions.length ? (
              <div className="card py-10 text-center">
                No {view === "all" ? "transactions" : view} found.
              </div>
            ) : (
              <ul className="grid max-w-[1800px] grid-cols-1 items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {history.data.transactions.map((transaction) => (
                  <li key={transaction.id} className="min-w-0">
                    <ActivityCard
                      transaction={transaction}
                      onDelete={
                        view === "all"
                          ? () => {
                              setDeleting(transaction);
                              setError("");
                            }
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                Page {page} of {Math.max(1, Math.ceil(history.data.total / history.data.pageSize))}
              </p>
              <div className="flex gap-2">
                <button
                  className={secondaryButton}
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className={secondaryButton}
                  disabled={page * history.data.pageSize >= history.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
