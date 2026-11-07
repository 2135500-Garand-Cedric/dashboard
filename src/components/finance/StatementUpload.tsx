"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { FinanceAccount } from "@/lib/finance/validation";
import type { ImportBatch } from "@/lib/finance/statement-imports";
import { MAX_CSV_BYTES, type CsvParsing } from "@/lib/finance/statement-csv";
import { useSnackbar } from "@/context/SnackbarContext";
import { fieldClass, financeRequest, FinanceLoadError, primaryButton, secondaryButton, useFinanceData } from "./shared";

export default function StatementUpload() {
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const [accountId, setAccountId] = useState(""), [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState<CsvParsing>({ delimiter: "AUTO", encoding: "AUTO", headerRow: 1 });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const guard = useRef(false), router = useRouter(), { showMessage } = useSnackbar();
  async function upload(event: FormEvent) {
    event.preventDefault(); if (guard.current) return;
    if (!file || !file.size || file.size > MAX_CSV_BYTES) { setError("Choose a non-empty CSV up to 2 MB."); return; }
    guard.current = true; setBusy(true); setError("");
    try {
      const body = new FormData(); body.append("details", JSON.stringify({ accountId: Number(accountId), ...parsing })); body.append("file", file);
      const result = await financeRequest<{ batch: ImportBatch; reused: boolean }>("/api/finance/imports", { method: "POST", body });
      showMessage(result.reused ? "This CSV already has an import. Opening its saved draft or history." : "CSV uploaded. Map and review its rows before importing.");
      router.push(`/finance/imports/${result.batch.id}`);
    } catch (error) { const message = error instanceof Error ? error.message : "Could not upload the CSV."; setError(message); showMessage(message); }
    finally { guard.current = false; setBusy(false); }
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">New statement import</h2><Link href="/finance/imports" className={secondaryButton}>← Import history</Link></div>
    {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}{error && <p role="alert" className="card text-rose-500">{error}</p>}
    <form onSubmit={upload} className="card max-w-3xl"><fieldset disabled={busy || accounts.loading || !!accounts.error} className="min-w-0 space-y-5"><label className="block space-y-1">Statement account<select aria-label="Statement account" required value={accountId} className={fieldClass} onChange={event => setAccountId(event.target.value)}><option value="">Choose the bank or card account</option>{accounts.data?.accounts.filter(account => account.active).map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
      {!accounts.loading && !accounts.data?.accounts.some(account => account.active) && <Link href="/finance/accounts" className={secondaryButton}>Create an active account</Link>}
      <label className="block space-y-2">CSV file<input aria-label="Statement CSV file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" required className={`${fieldClass} file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white`} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><p className="text-sm text-gray-400">CSV, TSV or text CSV · up to 2 MB and 1,000 transaction rows. The original file is private. Uploading creates a draft; no transactions are added yet.</p>
      <div className="grid gap-4 sm:grid-cols-3"><label className="block space-y-1">Separator<select aria-label="CSV separator" className={fieldClass} value={parsing.delimiter} onChange={event => setParsing({ ...parsing, delimiter: event.target.value as CsvParsing["delimiter"] })}><option value="AUTO">Detect automatically</option><option value=",">Comma</option><option value=";">Semicolon</option><option value={"\t"}>Tab</option><option value="|">Pipe</option></select></label><label className="block space-y-1">Encoding<select aria-label="CSV encoding" className={fieldClass} value={parsing.encoding} onChange={event => setParsing({ ...parsing, encoding: event.target.value as CsvParsing["encoding"] })}><option value="AUTO">UTF-8 / UTF-16 BOM</option><option value="UTF-8">UTF-8</option><option value="WINDOWS-1252">Windows-1252</option></select></label><label className="block space-y-1">Header row<input aria-label="CSV header row" type="number" required min={1} max={20} className={fieldClass} value={parsing.headerRow} onChange={event => setParsing({ ...parsing, headerRow: Number(event.target.value) })} /></label></div>
      <p className="text-sm text-gray-400">If the export starts with account information, choose the row containing column names (excluding an optional Excel sep= directive). Each import belongs to one account; skip any unrelated rows during review.</p><button type="submit" className={primaryButton}>{busy ? "Uploading…" : "Upload and map columns"}</button>
    </fieldset></form>
  </div>;
}
