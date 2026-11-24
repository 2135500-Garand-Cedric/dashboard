"use client";
import { useState } from "react";
import { useSnackbar } from "@/context/SnackbarContext";
import { secondaryButton } from "./shared";
export default function FinanceExport({
  kind,
  filters,
  filename,
}: {
  kind: "transactions" | "receipts" | "income";
  filters: Record<string, string>;
  filename?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { showMessage } = useSnackbar();
  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/finance/exports/${kind}?${new URLSearchParams(filters)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          typeof data?.error === "string" ? data.error : "Unable to export records. Please retry.",
        );
      }
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = filename ?? `finance-${kind}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not download the export. Check your connection and retry.";
      setError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" disabled={busy} onClick={download} className={secondaryButton}>
        {busy ? "Preparing CSV…" : "Export CSV"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
    </div>
  );
}
