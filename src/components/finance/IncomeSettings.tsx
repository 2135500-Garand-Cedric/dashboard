"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { INCOME_KINDS, type IncomeKind, type IncomeSource, type DeductionType } from "@/lib/finance/income";
import { useSnackbar } from "@/context/SnackbarContext";
import { fieldClass, financeRequest, FinanceLoadError, FinanceStatus, primaryButton, secondaryButton, useFinanceData } from "./shared";

export default function IncomeSettings() {
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Income sources & deductions</h2><Link href="/finance/income" className={secondaryButton}>← Income history</Link></div><div className="grid items-start gap-5 xl:grid-cols-2"><SettingsList source /><SettingsList source={false} /></div></div>;
}
function SettingsList({ source }: { source: boolean }) {
  const endpoint = source ? "income-sources" : "deduction-types", label = source ? "income source" : "deduction type";
  const result = useFinanceData<{ sources?: IncomeSource[]; types?: DeductionType[] }>(`/api/finance/${endpoint}`);
  const items = (source ? result.data?.sources : result.data?.types) ?? [];
  const [editing, setEditing] = useState<number | null>(null), [name, setName] = useState(""), [kind, setKind] = useState<IncomeKind>("EMPLOYMENT");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const guard = useRef(false), form = useRef<HTMLFormElement>(null), { showMessage } = useSnackbar();
  const reset = () => { setEditing(null); setName(""); setKind("EMPLOYMENT"); setError(""); };
  async function save(event: FormEvent) {
    event.preventDefault(); if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      await financeRequest(`/api/finance/${endpoint}${editing === null ? "" : `/${editing}`}`, { method: editing === null ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ...(source ? { kind } : {}) }) });
      showMessage(`${source ? "Income source" : "Deduction type"} saved.`); reset(); result.retry();
    } catch (error) { setError(error instanceof Error ? error.message : `Could not save ${label}.`); }
    finally { guard.current = false; setBusy(false); }
  }
  async function toggle(item: IncomeSource | DeductionType) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      await financeRequest(`/api/finance/${endpoint}/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !item.active }) });
      showMessage(`${source ? "Income source" : "Deduction type"} ${item.active ? "deactivated" : "reactivated"}.`); result.retry();
    } catch (error) { setError(error instanceof Error ? error.message : `Could not update ${label}.`); }
    finally { guard.current = false; setBusy(false); }
  }
  return <section className="card min-w-0 space-y-5"><h3 className="text-xl font-semibold">{source ? "Income sources" : "Deduction types"}</h3>
    {result.error && <FinanceLoadError error={result.error} retry={result.retry} />}{error && <p role="alert" className="text-rose-500">{error}</p>}
    <form ref={form} onSubmit={save}><fieldset disabled={busy || result.loading} className="space-y-3"><h4 className="font-medium">{editing === null ? "New" : "Edit"} {label}</h4><label className="block space-y-1">{source ? "Employer / source name" : "Deduction name"}<input aria-label={source ? "Employer / source name" : "Deduction name"} className={fieldClass} required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      {source && <label className="block space-y-1">Income type<select aria-label="Income source type" className={fieldClass} value={kind} onChange={event => setKind(event.target.value as IncomeKind)}>{Object.entries(INCOME_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <div className="flex flex-wrap gap-2"><button type="submit" className={primaryButton}>{busy ? "Saving…" : `${editing === null ? "Add" : "Save"} ${label}`}</button>{editing !== null && <button type="button" className={secondaryButton} onClick={reset}>Cancel</button>}</div></fieldset></form>
    {result.loading ? <p role="status">Loading {source ? "sources" : "deduction types"}…</p> : !items.length && <p className="text-sm text-gray-400">No {source ? "income sources" : "deduction types"} yet.</p>}
    <ul className="divide-y divide-card-border">{items.map(item => <li key={item.id} className="space-y-3 py-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-medium">{item.name}</p>{source && <p className="text-sm text-gray-400">{INCOME_KINDS[(item as IncomeSource).kind]}</p>}</div><FinanceStatus active={item.active} /></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={secondaryButton} aria-label={`Edit ${label} ${item.name}`} onClick={() => { setEditing(item.id); setName(item.name); if (source) setKind((item as IncomeSource).kind); setError(""); form.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Edit</button><button type="button" disabled={busy} className={secondaryButton} aria-label={`${item.active ? "Deactivate" : "Reactivate"} ${label} ${item.name}`} onClick={() => toggle(item)}>{item.active ? "Deactivate" : "Reactivate"}</button></div></li>)}</ul>
  </section>;
}
