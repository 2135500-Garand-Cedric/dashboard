"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ReceiptPage } from "@/lib/finance/receipts";
import type { FinanceAccount } from "@/lib/finance/validation";
import { displayAmount } from "@/lib/finance/transactions";
import { fieldClass, primaryButton, secondaryButton, FinanceLoadError, useFinanceData } from "./shared";

const defaults = { search: "", status: "", account: "", from: "", to: "" };
export default function ReceiptHistory() {
  const [draft, setDraft] = useState(defaults), [filters, setFilters] = useState(defaults), [page, setPage] = useState(1);
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const params = new URLSearchParams({ page: String(page) });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const history = useFinanceData<ReceiptPage>(`/api/finance/receipts?${params}`);
  function apply(event: FormEvent) { event.preventDefault(); setFilters({ ...draft }); setPage(1); history.retry(); }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Receipt history</h2><Link href="/finance/receipts/new" className={primaryButton}>Add receipt</Link></div>
    <form onSubmit={apply} className="card grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="space-y-1">Search<input aria-label="Search receipts" placeholder="Merchant or notes" maxLength={200} value={draft.search} className={fieldClass} onChange={event => setDraft({ ...draft, search: event.target.value })} /></label>
      <label className="space-y-1">Status<select aria-label="Receipt status" value={draft.status} className={fieldClass} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="">All receipts</option><option value="unmatched">Unmatched</option><option value="linked">Linked to transaction</option></select></label>
      <label className="space-y-1">Account<select aria-label="Receipt account filter" value={draft.account} className={fieldClass} onChange={event => setDraft({ ...draft, account: event.target.value })}><option value="">All accounts</option>{accounts.data?.accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.active ? "" : " (inactive)"}</option>)}</select></label>
      <label className="space-y-1">From<input aria-label="Receipts from date" type="date" className={fieldClass} value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label><label className="space-y-1">To<input aria-label="Receipts to date" type="date" min={draft.from || undefined} className={fieldClass} value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
      <div className="flex flex-wrap items-end gap-2"><button type="submit" className={primaryButton}>Apply filters</button><button type="button" className={secondaryButton} onClick={() => { setDraft(defaults); setFilters(defaults); setPage(1); }}>Reset</button></div>
    </form>
    {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}{history.error && <FinanceLoadError error={history.error} retry={history.retry} />}
    {history.loading ? <p role="status">Loading receipts…</p> : !history.error && history.data && <>
      <p className="text-sm text-gray-400">{history.data.total} {history.data.total === 1 ? "receipt" : "receipts"}</p>
      {history.data.receipts.length ? <ul className="grid min-w-0 gap-4 lg:grid-cols-2">{history.data.receipts.map(receipt => <li key={receipt.id} className="card min-w-0 space-y-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm text-gray-400">{receipt.date} · {(receipt.transaction || receipt.allocations?.length) ? "Linked" : "Unmatched"}</p><h3 className="break-words text-lg font-semibold">{receipt.merchant || "Receipt"}</h3><p className="break-words text-sm text-gray-400">{receipt.account?.name ?? "No account"} · {receipt.category?.name ?? "Uncategorized"}</p></div><p className="break-all text-lg font-semibold tabular-nums">{displayAmount(receipt.total, receipt.currency).replace(/^\+/, "")}</p></div><p className="text-sm text-gray-400">{receipt.document ? `${receipt.document.mimeType === "application/pdf" ? "PDF" : "Image"} attached` : "No document"}{receipt.difference !== "0.0000" ? " · Totals differ" : ""}</p><Link href={`/finance/receipts/${receipt.id}`} className={secondaryButton}>View receipt</Link></li>)}</ul> : <div className="card py-10 text-center">No receipts found.</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Page {page} of {Math.max(1, Math.ceil(history.data.total / history.data.pageSize))}</p><div className="flex gap-2"><button className={secondaryButton} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className={secondaryButton} disabled={page * history.data.pageSize >= history.data.total} onClick={() => setPage(page + 1)}>Next</button></div></div>
    </>}
  </div>;
}
