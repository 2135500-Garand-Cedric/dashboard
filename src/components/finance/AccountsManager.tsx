"use client";

import { useState, type FormEvent } from "react";
import {
  currencyOptionLabel,
  ACCOUNT_TYPES,
  type AccountType,
  type FinanceAccount,
} from "@/lib/finance/validation";
import Link from "next/link";
import { BalanceControl } from "./AccountBalances";
import type { AccountBalance } from "@/lib/finance/balances";
import TaskModal from "@/components/shared/TaskModal";
import {
  ArrowLeftIcon,
  PlusIcon,
  PencilSquareIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useSnackbar } from "@/context/SnackbarContext";
import {
  fieldClass,
  settingsButton,
  FinanceLoadError,
  FinanceStatus,
  financeRequest,
  useFinanceData,
} from "./shared";

const emptyAccount = () => ({
  name: "",
  type: "CHEQUING" as AccountType,
  currency: "CAD",
  maskedIdentifier: "",
  active: true,
});

export default function AccountsManager({ currencies }: { currencies: string[] }) {
  const { data, setData, loading, error, retry } = useFinanceData<{ accounts: FinanceAccount[] }>(
    "/api/finance/accounts",
  );
  const balances = useFinanceData<{ balances: AccountBalance[] }>("/api/finance/balances");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyAccount);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const { showMessage } = useSnackbar();
  const reset = () => {
    setModalOpen(false);
    setEditingId(null);
    setDraft(emptyAccount());
    setActionError("");
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const { account } = await financeRequest<{ account: FinanceAccount }>(
        editingId === null ? "/api/finance/accounts" : `/api/finance/accounts/${editingId}`,
        {
          method: editingId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      setData((current) => ({
        accounts: [
          ...(current?.accounts ?? []).filter((item) => item.id !== account.id),
          account,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      showMessage(
        editingId === null ? "Account created successfully." : "Account updated successfully.",
      );
      reset();
      balances.retry();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the account.";
      setActionError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(account: FinanceAccount) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const { account: updated } = await financeRequest<{ account: FinanceAccount }>(
        `/api/finance/accounts/${account.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !account.active }),
        },
      );
      setData((current) => ({
        accounts: (current?.accounts ?? []).map((item) =>
          item.id === updated.id ? updated : item,
        ),
      }));
      if (editingId === updated.id) setDraft((current) => ({ ...current, active: updated.active }));
      showMessage(updated.active ? "Account reactivated." : "Account deactivated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update account status.";
      setActionError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }

  const accounts = (data?.accounts ?? []).filter(
    (account) => filter === "all" || account.active === (filter === "active"),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Financial accounts</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/settings" className={`${settingsButton} border-card-border`}>
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Finance settings
          </Link>
          <button
            type="button"
            className={`${settingsButton} border-blue-500/40`}
            disabled={busy || loading}
            onClick={() => {
              reset();
              setModalOpen(true);
            }}
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            New account
          </button>
        </div>
      </div>
      {balances.error && <FinanceLoadError error={balances.error} retry={balances.retry} />}
      {error && <FinanceLoadError error={error} retry={retry} />}
      {actionError && !modalOpen && (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-500"
        >
          {actionError}
        </p>
      )}
      <div className="space-y-5">
        <TaskModal
          open={modalOpen}
          title={editingId === null ? "New account" : "Edit account"}
          busy={busy}
          onClose={reset}
        >
          <form onSubmit={save} className="space-y-4">
            {actionError && (
              <p
                role="alert"
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500"
              >
                {actionError}
              </p>
            )}
            <fieldset disabled={busy || loading} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Account name</span>
                <input
                  className={fieldClass}
                  value={draft.name}
                  maxLength={100}
                  required
                  autoComplete="off"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Account type</span>
                <select
                  className={fieldClass}
                  value={draft.type}
                  onChange={(event) =>
                    setDraft({ ...draft, type: event.target.value as AccountType })
                  }
                >
                  {Object.entries(ACCOUNT_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Currency</span>
                <select
                  className={fieldClass}
                  value={draft.currency}
                  onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
                >
                  {currencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currencyOptionLabel(currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Masked identifier <span className="font-normal text-gray-500">(optional)</span>
                </span>
                <input
                  className={fieldClass}
                  value={draft.maskedIdentifier}
                  maxLength={32}
                  autoComplete="off"
                  placeholder="**** 1234"
                  onChange={(event) => setDraft({ ...draft, maskedIdentifier: event.target.value })}
                />
                <span className="block text-xs text-gray-500">
                  Last four characters only, with optional masking symbols.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                />
                Active
              </label>
              <div className="mt-auto flex flex-wrap gap-2">
                <button type="submit" className={`${settingsButton} border-blue-500/40`}>
                  <CheckIcon className="h-4 w-4" aria-hidden="true" />
                  {busy ? "Saving…" : editingId === null ? "Create account" : "Save account"}
                </button>
                <button
                  type="button"
                  className={`${settingsButton} border-card-border`}
                  onClick={reset}
                >
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </TaskModal>
        <section className="space-y-4 min-w-0" aria-label="Account list">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Your accounts ({accounts.length})</h3>
            <label className="flex items-center gap-2 text-sm">
              Show
              <select
                className={fieldClass}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All accounts</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          {loading && (
            <p role="status" className="card text-gray-500">
              Loading accounts…
            </p>
          )}
          {!loading && data && accounts.length === 0 && (
            <p className="card text-gray-500">
              {data.accounts.length
                ? "No accounts match this filter."
                : "No accounts yet. Create your first financial account."}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {accounts.map((account) => (
              <article key={account.id} className="card flex min-w-0 flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="min-w-0 break-words text-lg font-semibold">{account.name}</h4>
                  <FinanceStatus active={account.active} />
                </div>
                {balances.data?.balances
                  .filter((row) => row.id === account.id)
                  .map((balance) => (
                    <BalanceControl key={balance.id} balance={balance} onSaved={balances.retry} />
                  ))}
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-500">Type</dt>
                    <dd className="mt-1">{ACCOUNT_TYPES[account.type]}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Currency</dt>
                    <dd className="mt-1">{account.currency}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-gray-500">Masked identifier</dt>
                    <dd className="mt-1">{account.maskedIdentifier || "Not provided"}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className={`${settingsButton} border-sky-500/40`}
                    aria-label={`Edit ${account.name}`}
                    onClick={() => {
                      setEditingId(account.id);
                      setDraft({
                        name: account.name,
                        type: account.type,
                        currency: account.currency,
                        maskedIdentifier: account.maskedIdentifier ?? "",
                        active: account.active,
                      });
                      setActionError("");
                      setModalOpen(true);
                    }}
                  >
                    <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={`${settingsButton} ${account.active ? "border-amber-500/40" : "border-emerald-500/40"}`}
                    aria-label={`${account.active ? "Deactivate" : "Reactivate"} ${account.name}`}
                    onClick={() => void toggle(account)}
                  >
                    {account.active ? (
                      <PauseCircleIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <PlayCircleIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                    {account.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
