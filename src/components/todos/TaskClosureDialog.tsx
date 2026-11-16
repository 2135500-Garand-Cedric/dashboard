"use client";

import { useEffect, useId, useRef, useState } from "react";
import { workRead } from "@/lib/work-management/client";
import { STATUS_LABELS, type TransitionReview, type WorkTodo } from "@/lib/work-management/types";
export default function TaskClosureDialog({
  task,
  status,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  task: WorkTodo;
  status: "IN_PROGRESS" | "DONE" | "CANCELLED";
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (body: Record<string, unknown>, revision: number) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const [mode, setMode] = useState("OUTCOME_ACHIEVED"),
    [summary, setSummary] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [review, setReview] = useState<TransitionReview | null>(null),
    [reviewError, setReviewError] = useState(""),
    [reload, setReload] = useState(0);
  const [blockedAccepted, setBlockedAccepted] = useState(false),
    [childrenAccepted, setChildrenAccepted] = useState(false),
    [reason, setReason] = useState("");
  useEffect(() => {
    let active = true;
    setReview(null);
    setReviewError("");
    setBlockedAccepted(false);
    setChildrenAccepted(false);
    setAccepted(false);
    void workRead<TransitionReview>(`/api/todos/${task.id}/transition?status=${status}`)
      .then((value) => {
        if (active) setReview(value);
      })
      .catch((error) => {
        if (active)
          setReviewError(error instanceof Error ? error.message : "Unable to review this action.");
      });
    return () => {
      active = false;
    };
  }, [task.id, status, reload]);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-xl border border-card-border bg-card-bg p-5 text-foreground backdrop:bg-black/60"
    >
      <h2 id={titleId} className="mb-4 text-xl font-semibold">
        {status === "IN_PROGRESS"
          ? "Start task"
          : status === "DONE"
            ? "Complete task"
            : "Cancel task"}
      </h2>
      <p className="mb-4 break-words">{review?.taskTitle ?? task.title}</p>
      {review && (
        <p className="mb-3 text-sm text-gray-500">
          Current status: {STATUS_LABELS[review.currentStatus] ?? review.currentStatus}
        </p>
      )}
      {status !== "IN_PROGRESS" && (
        <p className="mb-4 text-sm text-gray-500">
          Closing retires any active follow-up. The deadline and date history are kept; reopening
          will not recreate a reminder.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-rose-500">
          {error}
        </p>
      )}
      {reviewError && (
        <p role="alert" className="mb-3 text-rose-500">
          {reviewError}
        </p>
      )}
      {!review && !reviewError && <p role="status">Checking current prerequisites and children…</p>}
      {status !== "IN_PROGRESS" && !!review?.futureSessionCount && (
        <div className="mb-4 rounded-lg border border-blue-500/30 p-3 text-sm">
          <p>
            {review.futureSessionCount} future work session(s) will be kept. Review them separately
            if your plans change.
          </p>
          <ul>
            {review.futureSessions?.map((event) => (
              <li key={event.id}>
                <a
                  href={`/events/${event.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-words text-blue-400 underline"
                >
                  Review session: {event.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setReload((value) => value + 1)}
        className="mb-4 rounded border px-3 py-2 text-sm"
      >
        Refresh review
      </button>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!review) return;
          void onConfirm(
            {
              status,
              transitionToken: review.token,
              ...(review.blockingCount
                ? { allowBlocked: blockedAccepted, overrideReason: reason }
                : {}),
              ...(review.unfinishedChildCount ? { allowUnfinishedChildren: childrenAccepted } : {}),
              ...(status === "IN_PROGRESS" ? {} : { completionSummary: summary || null }),
              ...(status === "DONE"
                ? {
                    closureMode: mode,
                    acceptWorkaround: mode === "ACCEPTED_WORKAROUND" && accepted,
                  }
                : {}),
            },
            review.taskRevision,
          );
        }}
      >
        {!!review?.blockingCount && (
          <section className="space-y-3 rounded-lg border border-amber-500/50 p-3 text-sm">
            <h3 className="font-semibold text-amber-500">
              Blocked by {review.blockingCount} prerequisite(s)
            </h3>
            <p>
              Only Done clears a dependency. Cancelling or archiving unfinished work does not clear
              blocking.
            </p>
            <ul className="space-y-2">
              {review.blockers.map((item) => (
                <li key={item.id} className="break-words">
                  {item.reference} · {item.title} · {item.status ?? "Unavailable"}
                  {item.reviewReason ? ` · Legacy review: ${item.reviewReason}` : ""}
                </li>
              ))}
            </ul>
            {review.blockingCount > review.blockers.length && (
              <p>
                Showing the first {review.blockers.length}; the decision includes all{" "}
                {review.blockingCount}.
              </p>
            )}
            <label className="block">
              Override reason
              <textarea
                aria-label="Override reason"
                required
                maxLength={2000}
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded border bg-card-bg p-2"
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                required
                checked={blockedAccepted}
                disabled={busy}
                onChange={(event) => setBlockedAccepted(event.target.checked)}
              />
              I explicitly override these current prerequisites.
            </label>
          </section>
        )}
        {!!review?.unfinishedChildCount && (
          <section className="space-y-3 rounded-lg border border-amber-500/50 p-3 text-sm">
            <h3 className="font-semibold">
              {review.unfinishedChildCount} unfinished child task(s)
            </h3>
            <ul>
              {review.unfinishedChildren.map((item) => (
                <li key={item.id} className="break-words">
                  {item.reference} · {item.title} · {item.status}
                  {item.archivedAt ? " · Archived" : ""}
                </li>
              ))}
            </ul>
            {review.unfinishedChildCount > review.unfinishedChildren.length && (
              <p>
                Showing the first {review.unfinishedChildren.length}; all descendants are included.
              </p>
            )}
            <label className="flex gap-2">
              <input
                type="checkbox"
                required
                checked={childrenAccepted}
                disabled={busy}
                onChange={(event) => setChildrenAccepted(event.target.checked)}
              />
              Close this parent while leaving its unfinished children unchanged.
            </label>
          </section>
        )}
        {status === "DONE" && (
          <label className="block text-sm">
            Completion outcome
            <select
              aria-label="Completion outcome"
              disabled={busy}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value);
                setAccepted(false);
              }}
              className="mt-1 w-full rounded border bg-card-bg p-2"
            >
              <option value="OUTCOME_ACHIEVED">Outcome achieved</option>
              <option value="ACCEPTED_WORKAROUND" disabled={!review?.workaround?.trim()}>
                Accepted workaround
              </option>
            </select>
          </label>
        )}
        {status !== "IN_PROGRESS" && (
          <label className="block text-sm">
            {mode === "ACCEPTED_WORKAROUND"
              ? "Completion explanation (required)"
              : "Summary (optional)"}
            <textarea
              aria-label="Completion summary"
              value={summary}
              disabled={busy}
              required={mode === "ACCEPTED_WORKAROUND"}
              rows={3}
              onChange={(event) => setSummary(event.target.value)}
              className="mt-1 w-full rounded border bg-card-bg p-2"
            />
          </label>
        )}
        {status === "DONE" && mode === "ACCEPTED_WORKAROUND" && (
          <>
            <p className="whitespace-pre-wrap text-sm">{review?.workaround}</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={accepted}
                disabled={busy}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              I explicitly accept this workaround as the task outcome.
            </label>
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded border px-4 py-2"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={
              busy ||
              !review ||
              review.archived ||
              (!!review.blockingCount && (!blockedAccepted || !reason.trim())) ||
              (!!review.unfinishedChildCount && !childrenAccepted)
            }
            className="rounded bg-blue-600 px-4 py-2 text-white"
          >
            {busy
              ? "Saving…"
              : status === "IN_PROGRESS"
                ? "Start task"
                : status === "DONE"
                  ? "Complete task"
                  : "Confirm cancellation"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
