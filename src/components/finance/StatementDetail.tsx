"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FinanceAccount, FinanceCategory } from "@/lib/finance/validation";
import { IMPORT_ACTIONS, type ImportBatch, type ImportMapping } from "@/lib/finance/statement-imports";
import { useSnackbar } from "@/context/SnackbarContext";
import StatementMapping from "./StatementMapping";
import StatementRow from "./StatementRow";
import { fieldClass, financeRequest, FinanceLoadError, primaryButton, secondaryButton, useFinanceData } from "./shared";

export default function StatementDetail({ id }: { id: string }) {
  const result = useFinanceData<{ batch: ImportBatch }>(`/api/finance/imports/${id}`);
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const categories = useFinanceData<{ categories: FinanceCategory[] }>("/api/finance/categories");
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (accounts.error) return <FinanceLoadError error={accounts.error} retry={accounts.retry} />;
  if (categories.error) return <FinanceLoadError error={categories.error} retry={categories.retry} />;
  if (result.loading || accounts.loading || categories.loading || !result.data) return <p role="status">Loading statement review…</p>;
  return <Workspace batch={result.data.batch} accounts={accounts.data?.accounts ?? []} categories={categories.data?.categories ?? []} onBatch={batch => result.setData({ batch })} reload={result.retry} />;
}
function Workspace({ batch, accounts, categories, onBatch, reload }: { batch: ImportBatch; accounts: FinanceAccount[]; categories: FinanceCategory[]; onBatch: (batch: ImportBatch) => void; reload: () => void }) {
  const [rows, setRows] = useState(batch.rows), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [page, setPage] = useState(1), [filter, setFilter] = useState("ALL"), [confirmation, setConfirmation] = useState<"commit" | "draft" | "document" | null>(null);
  const guard = useRef(false), { showMessage } = useSnackbar();
  const completed = batch.status === "COMPLETED", blocked = rows.filter(row => row.action !== "SKIP" && (row.errors.length || row.action === "REVIEW")).length;
  const counts = rows.reduce((result, row) => { result[row.action]++; return result; }, { REVIEW: 0, CREATE: 0, MATCH: 0, SKIP: 0 });
  const filtered = rows.filter(row => filter === "ALL" || (filter === "ATTENTION" ? row.action !== "SKIP" && (row.errors.length > 0 || row.action === "REVIEW") : row.action === filter));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25)), currentPage = Math.min(page, pageCount);
  async function mutate(operation: "mapping" | "review" | "commit" | "draft" | "document", mapping?: ImportMapping) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      if (operation === "draft" || operation === "document") {
        await financeRequest(`/api/finance/imports/${batch.id}${operation === "document" ? "/document" : ""}`, { method: "DELETE", headers: { "If-Match": String(batch.revision) } });
        showMessage(operation === "draft" ? "Draft import deleted. No transactions were removed." : "Original CSV deleted. Import history and transactions were kept.");
        if (operation === "draft") window.location.assign("/finance/imports"); else reload();
      } else {
        const body = operation === "commit" ? { expectedRevision: batch.revision } : operation === "mapping" ? { expectedRevision: batch.revision, mapping } : { expectedRevision: batch.revision, rows: rows.filter(row => row.review).map(row => ({ id: row.id, action: row.action, review: row.review })) };
        const result = await financeRequest<{ batch: ImportBatch }>(`/api/finance/imports/${batch.id}${operation === "commit" ? "/commit" : ""}`, { method: operation === "commit" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        onBatch(result.batch); setRows(result.batch.rows); setDirty(false);
        showMessage(operation === "commit" ? "Statement imported successfully." : "Review saved and duplicates checked.");
      }
    } catch (error) { const message = error instanceof Error ? error.message : "Could not update the statement import."; setError(message); showMessage(message); }
    finally { guard.current = false; setBusy(false); setConfirmation(null); }
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{completed ? "Import details" : "Review statement import"}</h2><Link href="/finance/imports" className={secondaryButton}>← Import history</Link></div>
    <section className="card min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words text-xl font-semibold">{batch.originalName ?? `Import #${batch.id}`}</h3><span className={completed ? "text-emerald-500" : "text-amber-500"}>{completed ? "Completed" : "Draft — nothing imported yet"}</span></div><p className="text-sm text-gray-400">{batch.account.name} · {batch.account.currency} · {rows.length} rows{batch.byteSize ? ` · ${(batch.byteSize / 1024).toFixed(0)} KB` : ""}</p><p className="text-sm">{counts.CREATE} {completed ? "created" : "to create"} · {counts.MATCH} {completed ? "matched to existing" : "to match"} · {counts.SKIP} skipped{!completed ? ` · ${blocked} need attention` : ""}</p>
      <div className="flex flex-wrap gap-2">{batch.documentAvailable && <><a href={`/api/finance/imports/${batch.id}/document`} className={secondaryButton}>Download original CSV</a><button type="button" disabled={busy || dirty} className={secondaryButton} onClick={() => { setConfirmation("document"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Delete source CSV</button></>}{!completed && <button type="button" disabled={busy} className={`${secondaryButton} text-rose-500`} onClick={() => setConfirmation("draft")}>Delete draft</button>}</div>
      {completed && <p className="text-sm text-gray-400">This batch is read-only. Re-uploading this file or retrying completion will not create its transactions again. Skipped rows remain in this history.</p>}
    </section>
    {busy && <p role="status" className="card text-sm">Processing statement… Retrying this batch after a connection failure is safe.</p>}
    {error && <div role="alert" className="card space-y-3"><p className="text-rose-500">{error}</p><button type="button" disabled={busy} className={secondaryButton} onClick={() => { if (!dirty || window.confirm("Reload and discard unsaved row corrections?")) reload(); }}>Reload saved import</button></div>}
    {confirmation && <div role="alert" className="card space-y-3"><p>{confirmation === "commit" ? `Create ${counts.CREATE} new movements, link ${counts.MATCH} rows to existing movements and skip ${counts.SKIP} rows? All reviewed rows are saved together. Transfers create both account entries without income or expense.` : confirmation === "draft" ? "Delete this draft and its original CSV? No committed financial transactions will be deleted." : "Delete only the original CSV? Parsed source rows, import history and financial transactions will remain."}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={primaryButton} onClick={() => mutate(confirmation)}>{confirmation === "commit" ? "Confirm import" : "Confirm deletion"}</button><button type="button" disabled={busy} className={secondaryButton} onClick={() => setConfirmation(null)}>Cancel</button></div></div>}
    {!completed ? <details open={!batch.mapping}><summary className="mb-3 cursor-pointer font-semibold">Column mapping</summary><StatementMapping key={batch.revision} batch={batch} categories={categories} busy={busy} onSave={mapping => mutate("mapping", mapping)} /></details> : batch.mapping && <details><summary className="mb-3 cursor-pointer font-semibold">Saved column mapping</summary><StatementMapping batch={batch} categories={categories} busy onSave={() => {}} /></details>}
    {batch.mapping && <><section className="card space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><label className="w-full space-y-1 text-sm sm:w-72">Rows to display<select aria-label="Statement row filter" className={fieldClass} value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="ALL">All rows</option><option value="ATTENTION">Need decisions / corrections</option>{Object.entries(IMPORT_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{!completed && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={secondaryButton} onClick={() => mutate("review")}>{busy ? "Checking…" : "Save review & recheck duplicates"}</button><button type="button" disabled={busy || dirty || blocked > 0 || !batch.account.active} className={primaryButton} onClick={() => { setConfirmation("commit"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Import reviewed rows</button></div>}</div>
      {!completed && <p className={`text-sm ${dirty ? "text-amber-500" : "text-gray-400"}`}>{dirty ? "Unsaved corrections. Save review to refresh errors and duplicate matches before importing." : "Review the type and amount of each movement. Match existing entries instead of adding receipts, pay stubs or previously recorded purchases/deposits again."}</p>}
    </section>
      <div className="space-y-4">{filtered.slice((currentPage - 1) * 25, currentPage * 25).map(row => <StatementRow key={row.id} row={row} batch={batch} accounts={accounts} categories={categories} disabled={busy || completed} onChange={updated => { setRows(current => current.map(item => item.id === updated.id ? updated : item)); setDirty(true); setConfirmation(null); }} />)}{!filtered.length && <div className="card py-8 text-center">No rows in this view.</div>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{filtered.length} rows · Page {currentPage} of {pageCount}</p><div className="flex gap-2"><button className={secondaryButton} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous rows</button><button className={secondaryButton} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next rows</button></div></div>
    </>}
  </div>;
}
