"use client";

import { useRef, useState, type FormEvent } from "react";
import { CATEGORY_TYPES, type CategoryType, type FinanceCategory } from "@/lib/finance/validation";
import { useSnackbar } from "@/context/SnackbarContext";
import { fieldClass, primaryButton, secondaryButton, FinanceLoadError, FinanceStatus, financeRequest, useFinanceData } from "./shared";

const emptyCategory = () => ({ name: "", type: "EXPENSE" as CategoryType, active: true });

export default function CategoriesManager() {
  const { data, setData, loading, error, retry } = useFinanceData<{ categories: FinanceCategory[] }>("/api/finance/categories");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyCategory);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { showMessage } = useSnackbar();
  const reset = () => { setEditingId(null); setDraft(emptyCategory()); setActionError(""); };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setActionError("");
    try {
      const { category } = await financeRequest<{ category: FinanceCategory }>(editingId === null ? "/api/finance/categories" : `/api/finance/categories/${editingId}`, { method: editingId === null ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      setData(current => ({ categories: [...(current?.categories ?? []).filter(item => item.id !== category.id), category].sort((a, b) => a.name.localeCompare(b.name)) }));
      showMessage(editingId === null ? "Category created successfully." : "Category updated successfully.");
      reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the category.";
      setActionError(message); showMessage(message);
    } finally { setBusy(false); }
  }

  async function change(category: FinanceCategory, remove = false) {
    if (busy || (remove && !window.confirm(`Delete the category “${category.name}”?`))) return;
    setBusy(true); setActionError("");
    try {
      if (remove) {
        await financeRequest(`/api/finance/categories/${category.id}`, { method: "DELETE" });
        setData(current => ({ categories: (current?.categories ?? []).filter(item => item.id !== category.id) }));
        if (editingId === category.id) reset();
        showMessage("Category deleted.");
      } else {
        const { category: updated } = await financeRequest<{ category: FinanceCategory }>(`/api/finance/categories/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !category.active }) });
        setData(current => ({ categories: (current?.categories ?? []).map(item => item.id === updated.id ? updated : item) }));
        if (editingId === updated.id) setDraft(current => ({ ...current, active: updated.active }));
        showMessage(updated.active ? "Category reactivated." : "Category deactivated.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the category.";
      setActionError(message); showMessage(message);
    } finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <h2 className="text-2xl font-semibold">Income & expense categories</h2>
    {error && <FinanceLoadError error={error} retry={retry} />}
    {actionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-500">{actionError}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <form ref={formRef} onSubmit={save} className="card space-y-4">
        <h3 className="text-lg font-semibold">{editingId === null ? "New category" : "Edit category"}</h3>
        <fieldset disabled={busy || loading} className="space-y-4">
          <label className="block space-y-2"><span className="text-sm font-medium">Category name</span><input className={fieldClass} value={draft.name} maxLength={100} required autoComplete="off" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="block space-y-2"><span className="text-sm font-medium">Category type</span><select className={fieldClass} value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as CategoryType })}>{Object.entries(CATEGORY_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />Active</label>
          <div className="flex flex-wrap gap-2"><button type="submit" className={primaryButton}>{busy ? "Saving…" : editingId === null ? "Create category" : "Save category"}</button>{editingId !== null && <button type="button" className={secondaryButton} onClick={reset}>Cancel</button>}</div>
        </fieldset>
      </form>
      <section className="min-w-0 space-y-4" aria-label="Category list">
        {loading && <p role="status" className="card text-gray-500">Loading categories…</p>}
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {(Object.keys(CATEGORY_TYPES) as CategoryType[]).map(type => {
            const categories = (data?.categories ?? []).filter(category => category.type === type);
            return <section key={type} className="card min-w-0 space-y-4"><h3 className={`text-lg font-semibold ${type === "EXPENSE" ? "text-rose-500" : "text-emerald-500"}`}>{CATEGORY_TYPES[type]} ({categories.length})</h3>
              {!loading && data && categories.length === 0 && <p className="text-sm text-gray-500">No {CATEGORY_TYPES[type].toLowerCase()} categories yet.</p>}
              <ul className="divide-y divide-card-border">{categories.map(category => <li key={category.id} className="space-y-3 py-4"><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{category.name}</span><FinanceStatus active={category.active} /></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={secondaryButton} aria-label={`Edit ${CATEGORY_TYPES[type].toLowerCase()} category ${category.name}`} onClick={() => { setEditingId(category.id); setDraft({ name: category.name, type: category.type, active: category.active }); setActionError(""); formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Edit</button><button type="button" disabled={busy} className={secondaryButton} aria-label={`${category.active ? "Deactivate" : "Reactivate"} ${CATEGORY_TYPES[type].toLowerCase()} category ${category.name}`} onClick={() => void change(category)}>{category.active ? "Deactivate" : "Reactivate"}</button><button type="button" disabled={busy} className={`${secondaryButton} text-rose-500`} aria-label={`Delete ${CATEGORY_TYPES[type].toLowerCase()} category ${category.name}`} onClick={() => void change(category, true)}>Delete</button></div></li>)}</ul>
            </section>;
          })}
        </div>
      </section>
    </div>
  </div>;
}
