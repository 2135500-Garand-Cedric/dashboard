"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { WorkTodo } from "@/lib/work-management/types";
export default function TaskClosureDialog({ task, status, busy, error, onCancel, onConfirm }: { task: WorkTodo; status: "DONE" | "CANCELLED"; busy: boolean; error?: string; onCancel: () => void; onConfirm: (body: Record<string, unknown>) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  const [mode, setMode] = useState("OUTCOME_ACHIEVED"), [summary, setSummary] = useState("");
  const [accepted, setAccepted] = useState(false);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-card-border bg-card-bg p-5 text-foreground backdrop:bg-black/60">
    <h2 id={titleId} className="mb-4 text-xl font-semibold">{status === "DONE" ? "Complete task" : "Cancel task"}</h2>
    <p className="mb-4 break-words">{task.title}</p>
    {error && <p role="alert" className="mb-4 text-rose-500">{error}</p>}
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void onConfirm({ status, completionSummary: summary || null, ...(status === "DONE" ? { closureMode: mode, acceptWorkaround: mode === "ACCEPTED_WORKAROUND" && accepted } : {}) }); }}>
      {status === "DONE" && <label className="block text-sm">Completion outcome<select aria-label="Completion outcome" disabled={busy} value={mode} onChange={event => { setMode(event.target.value); setAccepted(false); }} className="mt-1 w-full rounded border bg-card-bg p-2"><option value="OUTCOME_ACHIEVED">Outcome achieved</option><option value="ACCEPTED_WORKAROUND" disabled={!task.workaround?.trim()}>Accepted workaround</option></select></label>}
      <label className="block text-sm">{mode === "ACCEPTED_WORKAROUND" ? "Completion explanation (required)" : "Summary (optional)"}<textarea aria-label="Completion summary" value={summary} disabled={busy} required={mode === "ACCEPTED_WORKAROUND"} rows={3} onChange={event => setSummary(event.target.value)} className="mt-1 w-full rounded border bg-card-bg p-2" /></label>
      {status === "DONE" && mode === "ACCEPTED_WORKAROUND" && <><p className="whitespace-pre-wrap text-sm">{task.workaround}</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} />I explicitly accept this workaround as the task outcome.</label></>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="rounded border px-4 py-2">Back</button><button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white">{busy ? "Saving…" : status === "DONE" ? "Complete task" : "Confirm cancellation"}</button></div>
    </form>
  </dialog>;
}
