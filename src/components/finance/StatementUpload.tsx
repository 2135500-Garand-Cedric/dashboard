"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { FinanceAccount } from "@/lib/finance/validation";
import type { ImportBatch } from "@/lib/finance/statement-imports";
import { MAX_CSV_BYTES } from "@/lib/finance/statement-csv";
import { useSnackbar } from "@/context/SnackbarContext";
import {
  fieldClass,
  financeRequest,
  FinanceLoadError,
  primaryButton,
  secondaryButton,
  useFinanceData,
} from "./shared";

export default function StatementUpload() {
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const [accountId, setAccountId] = useState(""),
    [periodStart, setPeriodStart] = useState(""),
    [periodEnd, setPeriodEnd] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const guard = useRef(false),
    router = useRouter(),
    { showMessage } = useSnackbar();
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    if (!file?.size || file.size > MAX_CSV_BYTES) {
      setError("Choose a non-empty CSV up to 2 MB.");
      showMessage("Choose a non-empty CSV up to 2 MB.");
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append(
        "details",
        JSON.stringify({ accountId: Number(accountId), periodStart, periodEnd }),
      );
      body.append("file", file);
      const result = await financeRequest<{ batch: ImportBatch; reused: boolean }>(
        "/api/finance/imports",
        { method: "POST", body },
      );
      showMessage(
        result.reused
          ? "Opening the saved statement."
          : "Statement parsed. Match each row to a financial record.",
      );
      router.push(`/finance/imports/${result.batch.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload the statement.";
      setError(message);
      showMessage(message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">New statement import</h2>
        <Link href="/finance/imports" className={secondaryButton}>
          ← Import history
        </Link>
      </div>
      {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}
      {error && (
        <p role="alert" className="card text-rose-500">
          {error}
        </p>
      )}
      <form onSubmit={upload} className="card max-w-3xl">
        <fieldset
          disabled={busy || accounts.loading || !!accounts.error}
          className="min-w-0 space-y-5"
        >
          <label className="block space-y-1">
            Statement account
            <select
              aria-label="Statement account"
              required
              value={accountId}
              className={fieldClass}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Choose the bank or card account</option>
              {accounts.data?.accounts
                .filter((account) => account.active)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              Statement from
              <input
                aria-label="Statement from"
                type="date"
                required
                value={periodStart}
                max={periodEnd || undefined}
                className={fieldClass}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              Statement to
              <input
                aria-label="Statement to"
                type="date"
                required
                value={periodEnd}
                min={periodStart || undefined}
                className={fieldClass}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-2">
            CSV file
            <input
              aria-label="Statement CSV file"
              type="file"
              required
              accept=".csv,text/csv"
              className={`${fieldClass} file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white`}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="rounded-lg border border-card-border p-3 text-sm">
            <code>date,ref #,description,amount</code>
            <p className="mt-2">
              Dates: YYYY-MM-DD. Positive amounts: income. Negative amounts: expenses. Transfers can
              use either sign.
            </p>
          </div>
          <button type="submit" className={primaryButton}>
            {busy ? "Parsing…" : "Upload and match rows"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
