"use client";

import Link from "next/link";
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
import { useRef, useState, type FormEvent } from "react";
import {
  INCOME_KINDS,
  type IncomeKind,
  type IncomeSource,
  type DeductionType,
} from "@/lib/finance/income";
import { useSnackbar } from "@/context/SnackbarContext";
import {
  fieldClass,
  financeRequest,
  FinanceLoadError,
  FinanceStatus,
  settingsButton,
  useFinanceData,
} from "./shared";

export default function IncomeSettings({ source }: { source: boolean }) {
  const endpoint = source ? "income-sources" : "deduction-types",
    label = source ? "income source" : "deduction type";
  const result = useFinanceData<{ sources?: IncomeSource[]; types?: DeductionType[] }>(
    `/api/finance/${endpoint}`,
  );
  const items = (source ? result.data?.sources : result.data?.types) ?? [];
  const [editing, setEditing] = useState<number | null>(null),
    [name, setName] = useState(""),
    [kind, setKind] = useState<IncomeKind>("EMPLOYMENT");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const guard = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { showMessage } = useSnackbar();
  const reset = () => {
    setModalOpen(false);
    setEditing(null);
    setName("");
    setKind("EMPLOYMENT");
    setError("");
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await financeRequest(`/api/finance/${endpoint}${editing === null ? "" : `/${editing}`}`, {
        method: editing === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...(source ? { kind } : {}) }),
      });
      showMessage(`${source ? "Income source" : "Deduction type"} saved.`);
      reset();
      result.retry();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not save ${label}.`;
      setError(message);
      showMessage(message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function toggle(item: IncomeSource | DeductionType) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await financeRequest(`/api/finance/${endpoint}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      showMessage(
        `${source ? "Income source" : "Deduction type"} ${item.active ? "deactivated" : "reactivated"}.`,
      );
      result.retry();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not update ${label}.`;
      setError(message);
      showMessage(message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{source ? "Income sources" : "Deduction types"}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/settings" className={`${settingsButton} border-card-border`}>
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Finance settings
          </Link>
          <button
            type="button"
            disabled={busy || result.loading}
            className={`${settingsButton} border-blue-500/40`}
            onClick={() => {
              reset();
              setModalOpen(true);
            }}
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            New {label}
          </button>
        </div>
      </div>
      {result.error && <FinanceLoadError error={result.error} retry={result.retry} />}
      {error && !modalOpen && (
        <p role="alert" className="text-rose-500">
          {error}
        </p>
      )}
      <TaskModal
        open={modalOpen}
        title={`${editing === null ? "New" : "Edit"} ${label}`}
        busy={busy}
        onClose={reset}
      >
        <form onSubmit={save} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500"
            >
              {error}
            </p>
          )}
          <fieldset disabled={busy || result.loading} className="space-y-3">
            <label className="block space-y-1">
              {source ? "Employer / source name" : "Deduction name"}
              <input
                aria-label={source ? "Employer / source name" : "Deduction name"}
                className={fieldClass}
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {source && (
              <label className="block space-y-1">
                Income type
                <select
                  aria-label="Income source type"
                  className={fieldClass}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as IncomeKind)}
                >
                  {Object.entries(INCOME_KINDS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              <button type="submit" className={`${settingsButton} border-blue-500/40`}>
                <CheckIcon className="h-4 w-4" aria-hidden="true" />
                {busy ? "Saving…" : `${editing === null ? "Add" : "Save"} ${label}`}
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
      {result.loading ? (
        <p role="status">Loading {source ? "sources" : "deduction types"}…</p>
      ) : (
        !items.length && (
          <p className="text-sm text-gray-400">
            No {source ? "income sources" : "deduction types"} yet.
          </p>
        )
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="card flex min-w-0 flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-medium">{item.name}</p>
                {source && (
                  <p className="text-sm text-gray-400">
                    {INCOME_KINDS[(item as IncomeSource).kind]}
                  </p>
                )}
              </div>
              <FinanceStatus active={item.active} />
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={`${settingsButton} border-sky-500/40`}
                aria-label={`Edit ${label} ${item.name}`}
                onClick={() => {
                  setEditing(item.id);
                  setName(item.name);
                  if (source) setKind((item as IncomeSource).kind);
                  setError("");
                  setModalOpen(true);
                }}
              >
                <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                className={`${settingsButton} ${item.active ? "border-amber-500/40" : "border-emerald-500/40"}`}
                aria-label={`${item.active ? "Deactivate" : "Reactivate"} ${label} ${item.name}`}
                onClick={() => toggle(item)}
              >
                {item.active ? (
                  <PauseCircleIcon className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PlayCircleIcon className="h-4 w-4" aria-hidden="true" />
                )}
                {item.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
