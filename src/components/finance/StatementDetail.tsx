"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ImportBatch } from "@/lib/finance/statement-imports";
import { useSnackbar } from "@/context/SnackbarContext";
import StatementMatchRow from "./StatementMatchRow";
import {
  fieldClass,
  financeRequest,
  FinanceLoadError,
  primaryButton,
  secondaryButton,
  useFinanceData,
} from "./shared";

export default function StatementDetail({ id }: { id: string }) {
  const result = useFinanceData<{ batch: ImportBatch }>(`/api/finance/imports/${id}`);
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (result.loading || !result.data) return <p role="status">Loading statement…</p>;
  return (
    <Workspace
      batch={result.data.batch}
      onBatch={(batch) => result.setData({ batch })}
      reload={result.retry}
    />
  );
}

function Workspace({
  batch,
  onBatch,
  reload,
}: {
  batch: ImportBatch;
  onBatch: (batch: ImportBatch) => void;
  reload: () => void;
}) {
  const [rows, setRows] = useState(batch.rows),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState("ALL"),
    [confirmation, setConfirmation] = useState<"draft" | "document" | null>(null);
  const guard = useRef(false),
    { showMessage } = useSnackbar();
  const saved = batch.status === "COMPLETED",
    editable = batch.matchingOnly;
  const selectedCount = rows.filter((row) => row.review?.matchId).length;
  const matchedCount = rows.filter((row) => row.transactionId).length;
  const filtered = rows.filter(
    (row) =>
      filter === "ALL" || (filter === "MATCHED" ? !!row.review?.matchId : !row.review?.matchId),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25)),
    currentPage = Math.min(page, pageCount);

  async function save() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await financeRequest<{ batch: ImportBatch }>(
        `/api/finance/imports/${batch.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: batch.revision,
            rows: rows
              .filter((row) => row.review)
              .map((row) => ({ id: row.id, action: "MATCH", review: row.review })),
          }),
        },
      );
      onBatch(result.batch);
      setRows(result.batch.rows);
      setDirty(false);
      showMessage("Statement matches saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save statement matches.";
      setError(message);
      showMessage(message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmation || guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await financeRequest(
        `/api/finance/imports/${batch.id}${confirmation === "document" ? "/document" : ""}`,
        { method: "DELETE", headers: { "If-Match": String(batch.revision) } },
      );
      if (confirmation === "draft") window.location.assign("/finance/imports");
      else reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete this item.");
    } finally {
      guard.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Statement import</h2>
        <Link href="/finance/imports" className={secondaryButton}>
          ← Import history
        </Link>
      </div>
      <section className="card min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="break-words text-xl font-semibold">
            {batch.originalName ?? `Import #${batch.id}`}
          </h3>
          <span className={saved ? "text-emerald-500" : "text-amber-500"}>
            {saved ? "Saved" : "Draft"}
          </span>
        </div>
        <p className="text-sm text-gray-400">
          {batch.account.name} · {batch.account.currency} · {rows.length} rows
        </p>
        {batch.periodStart && batch.periodEnd && (
          <p className="text-sm">
            Statement period: {batch.periodStart} → {batch.periodEnd}
          </p>
        )}
        <p className="text-sm">
          {matchedCount} matched · {rows.length - matchedCount} remaining
          {dirty ? ` · ${selectedCount} selected (unsaved changes)` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {batch.documentAvailable && (
            <>
              <a href={`/api/finance/imports/${batch.id}/document`} className={secondaryButton}>
                Download original CSV
              </a>
              <button
                disabled={busy || dirty}
                className={secondaryButton}
                onClick={() => setConfirmation("document")}
              >
                Delete source CSV
              </button>
            </>
          )}
          {!saved && (
            <button
              disabled={busy}
              className={`${secondaryButton} text-rose-500`}
              onClick={() => setConfirmation("draft")}
            >
              Delete draft
            </button>
          )}
        </div>
      </section>
      {error && (
        <div role="alert" className="card space-y-3">
          <p className="text-rose-500">{error}</p>
          <button className={secondaryButton} onClick={reload}>
            Reload saved import
          </button>
        </div>
      )}
      {confirmation && (
        <div role="alert" className="card space-y-3">
          <p>
            {confirmation === "draft"
              ? "Delete this draft and its original CSV? Financial records will be kept."
              : "Delete only the original CSV? Statement rows and financial records will be kept."}
          </p>
          <div className="flex gap-2">
            <button disabled={busy} className={primaryButton} onClick={remove}>
              Confirm deletion
            </button>
            <button
              disabled={busy}
              className={secondaryButton}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <section className="card flex flex-wrap items-end justify-between gap-3">
        <label className="w-full space-y-1 text-sm sm:w-64">
          Rows to display
          <select
            aria-label="Statement row filter"
            className={fieldClass}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All rows</option>
            <option value="MATCHED">Matched / selected</option>
            <option value="UNMATCHED">Unmatched</option>
          </select>
        </label>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || dirty} className={secondaryButton} onClick={reload}>
              Refresh suggestions
            </button>
            <button disabled={busy} className={primaryButton} onClick={save}>
              {busy ? "Saving…" : "Save matches"}
            </button>
          </div>
        )}
      </section>
      <div className="space-y-4">
        {filtered.slice((currentPage - 1) * 25, currentPage * 25).map((row) => (
          <StatementMatchRow
            key={row.id}
            row={row}
            batch={batch}
            disabled={busy}
            usedIds={rows.flatMap((item) => (item.review?.matchId ? [item.review.matchId] : []))}
            onChange={(updated) => {
              setRows((current) =>
                current.map((item) => (item.id === updated.id ? updated : item)),
              );
              setDirty(true);
            }}
          />
        ))}
        {!filtered.length && <div className="card py-8 text-center">No rows in this view.</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {filtered.length} rows · Page {currentPage} of {pageCount}
        </p>
        <div className="flex gap-2">
          <button
            className={secondaryButton}
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous rows
          </button>
          <button
            className={secondaryButton}
            disabled={currentPage >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next rows
          </button>
        </div>
      </div>
    </div>
  );
}
