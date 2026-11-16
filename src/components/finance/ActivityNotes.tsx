"use client";
import { useState, type FormEvent } from "react";
import type { FinanceTransaction } from "@/lib/finance/transactions";
import { useSnackbar } from "@/context/SnackbarContext";
import { fieldClass, financeRequest, primaryButton } from "./shared";

export default function ActivityNotes({
  transaction,
  onSaved,
  inline = false,
}: {
  transaction: FinanceTransaction;
  onSaved: () => void;
  inline?: boolean;
}) {
  const [notes, setNotes] = useState(transaction.notes ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { showMessage } = useSnackbar();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await financeRequest(`/api/finance/activities/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": transaction.updatedAt },
        body: JSON.stringify({ notes }),
      });
      showMessage("Notes saved.");
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save notes.";
      setError(message);
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }
  const Container = inline ? "div" : "form";
  return (
    <Container
      onSubmit={inline ? undefined : save}
      className={inline ? "space-y-3" : "card max-w-5xl space-y-3"}
    >
      <label className={inline ? "block space-y-1 text-sm" : "block space-y-2 font-semibold"}>
        Notes{inline ? " (optional)" : ""}
        <textarea
          aria-label="Activity notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          rows={inline ? 3 : 4}
          disabled={busy}
          className={`${fieldClass} font-normal`}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
      <button
        type={inline ? "button" : "submit"}
        onClick={inline ? save : undefined}
        disabled={busy}
        className={primaryButton}
      >
        {busy ? "Saving…" : "Save notes"}
      </button>
    </Container>
  );
}
