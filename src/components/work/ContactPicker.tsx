"use client";
import { useEffect, useState } from "react";
import { workRead } from "@/lib/work-management/client";
import type { WorkContact } from "@/lib/work-management/types";
const labelOf = (contact: WorkContact) => `${contact.name}${contact.company ? ` · ${contact.company}` : ""}${!contact.active ? " (inactive)" : ""} · #${contact.id}`;
export default function ContactPicker({ label, value, onChange, multiple = false, disabled = false, allowInactive = false }: { label: string; value: WorkContact[]; onChange: (contacts: WorkContact[]) => void; multiple?: boolean; disabled?: boolean; allowInactive?: boolean }) {
  const [query, setQuery] = useState(""), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [data, setData] = useState<{ items: WorkContact[]; total: number; page: number; pageSize: number } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setData(null); setError("");
    const timer = setTimeout(() => {
      void workRead<{ items: WorkContact[]; total: number; page: number; pageSize: number }>(`/api/work-contacts?q=${encodeURIComponent(query)}&page=${page}`).then(result => { if (active) setData(result); }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Unable to load contacts."); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, page, retry]);
  const choices = [...value, ...(data?.items ?? []).filter(contact => !value.some(selected => selected.id === contact.id))];
  return <fieldset disabled={disabled} className="min-w-0 space-y-2 rounded-lg border border-card-border p-3">
    <legend className="px-1 text-sm font-medium">{label}</legend>
    <input aria-label={`Search ${label.toLowerCase()}`} placeholder="Search contacts" maxLength={120} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} className="w-full min-w-0 rounded border bg-card-bg p-2 text-sm" />
    {error ? <p role="alert" className="text-sm text-rose-500">{error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : !data && <p role="status" className="text-xs text-gray-500">Loading contacts…</p>}
    {multiple ? <div className="max-h-44 space-y-2 overflow-y-auto">{choices.map(contact => <label key={contact.id} className="flex items-start gap-2 break-words text-sm"><input type="checkbox" aria-label={`${label}: ${labelOf(contact)}`} checked={value.some(selected => selected.id === contact.id)} disabled={!allowInactive && !contact.active && !value.some(selected => selected.id === contact.id)} onChange={event => onChange(event.target.checked ? [...value, contact] : value.filter(selected => selected.id !== contact.id))} />{labelOf(contact)}</label>)}{data && !choices.length && <p className="text-sm text-gray-500">No contacts found.</p>}</div> : <select aria-label={label} value={value[0]?.id ?? ""} onChange={event => onChange(choices.filter(contact => contact.id === Number(event.target.value)))} className="w-full min-w-0 rounded border bg-card-bg p-2 text-sm"><option value="">None</option>{choices.map(contact => <option key={contact.id} value={contact.id} disabled={!allowInactive && !contact.active && value[0]?.id !== contact.id}>{labelOf(contact)}</option>)}</select>}
    {!!value.length && multiple && <p className="break-words text-xs text-gray-500">Selected: {value.map(contact => contact.name).join(", ")}</p>}
    {data && data.total > data.pageSize && <div className="flex flex-wrap items-center gap-2 text-xs"><button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} className="scroll-mt-24 rounded border px-2 py-1">Previous contacts</button><span>{data.page}/{Math.ceil(data.total / data.pageSize)}</span><button type="button" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)} className="scroll-mt-24 rounded border px-2 py-1">Next contacts</button></div>}
  </fieldset>;
}
