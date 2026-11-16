"use client";

import { useState, type FormEvent } from "react";
import { type CategoryType, type FinanceCategory } from "@/lib/finance/validation";
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
  TrashIcon,
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

const emptyCategory = () => ({ name: "", type: "EXPENSE" as CategoryType, active: true });

export default function CategoriesManager() {
  const { data, setData, loading, error, retry } = useFinanceData<{
    categories: FinanceCategory[];
  }>("/api/finance/categories");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyCategory);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const { showMessage } = useSnackbar();
  const reset = () => {
    setModalOpen(false);
    setEditingId(null);
    setDraft(emptyCategory());
    setActionError("");
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const { category } = await financeRequest<{ category: FinanceCategory }>(
        editingId === null ? "/api/finance/categories" : `/api/finance/categories/${editingId}`,
        {
          method: editingId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      setData((current) => ({
        categories: [
          ...(current?.categories ?? []).filter((item) => item.id !== category.id),
          category,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      showMessage(
        editingId === null ? "Category created successfully." : "Category updated successfully.",
      );
      reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the category.";
      setActionError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }

  async function change(category: FinanceCategory, remove = false) {
    if (busy || (remove && !window.confirm(`Delete the category “${category.name}”?`))) return;
    setBusy(true);
    setActionError("");
    try {
      if (remove) {
        await financeRequest(`/api/finance/categories/${category.id}`, { method: "DELETE" });
        setData((current) => ({
          categories: (current?.categories ?? []).filter((item) => item.id !== category.id),
        }));
        if (editingId === category.id) reset();
        showMessage("Category deleted.");
      } else {
        const { category: updated } = await financeRequest<{ category: FinanceCategory }>(
          `/api/finance/categories/${category.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: !category.active }),
          },
        );
        setData((current) => ({
          categories: (current?.categories ?? []).map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }));
        if (editingId === updated.id)
          setDraft((current) => ({ ...current, active: updated.active }));
        showMessage(updated.active ? "Category reactivated." : "Category deactivated.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the category.";
      setActionError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }

  const categories = (data?.categories ?? []).filter((category) => category.type === "EXPENSE");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Expense categories</h2>
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
            New category
          </button>
        </div>
      </div>
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
          title={editingId === null ? "New category" : "Edit category"}
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
                <span className="text-sm font-medium">Category name</span>
                <input
                  className={fieldClass}
                  value={draft.name}
                  maxLength={100}
                  required
                  autoComplete="off"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                />
                Active
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={`${settingsButton} border-blue-500/40`}>
                  <CheckIcon className="h-4 w-4" aria-hidden="true" />
                  {busy ? "Saving…" : editingId === null ? "Create category" : "Save category"}
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
        <section className="min-w-0 space-y-4" aria-label="Category list">
          {loading && (
            <p role="status" className="card text-gray-500">
              Loading categories…
            </p>
          )}
          {!loading && data && categories.length === 0 && (
            <p className="text-sm text-gray-500">No expense categories yet.</p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {categories.map((category) => (
              <li
                key={category.id}
                className="card flex min-w-0 flex-col gap-4 border-t-2 border-t-rose-500/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{category.name}</span>
                  <FinanceStatus active={category.active} />
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className={`${settingsButton} border-sky-500/40`}
                    aria-label={`Edit expense category ${category.name}`}
                    onClick={() => {
                      setEditingId(category.id);
                      setDraft({
                        name: category.name,
                        type: category.type,
                        active: category.active,
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
                    className={`${settingsButton} ${category.active ? "border-amber-500/40" : "border-emerald-500/40"}`}
                    aria-label={`${category.active ? "Deactivate" : "Reactivate"} expense category ${category.name}`}
                    onClick={() => void change(category)}
                  >
                    {category.active ? (
                      <PauseCircleIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <PlayCircleIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                    {category.active ? "Deactivate" : "Reactivate"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={`${settingsButton} border-rose-500/40`}
                    aria-label={`Delete expense category ${category.name}`}
                    onClick={() => void change(category, true)}
                  >
                    <TrashIcon className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
