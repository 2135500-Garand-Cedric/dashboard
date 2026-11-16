"use client";
import { useInitialTaskLoad, useTaskRead } from "@/components/work/TaskInitialLoad";
import TaskModal from "@/components/shared/TaskModal";
import { useDateTime } from "@/context/SettingsContext";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter } from "@/lib/work-management/client";
import { localParts, type StoredWorkDate } from "@/lib/work-management/date-format";
import type {
  SupportEditorHandle,
  SupportEditorState,
  WorkDatesView,
  WorkTodo,
} from "@/lib/work-management/types";
const input =
  "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2 text-sm";
const button =
  "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
type Draft = {
  action: string;
  revision: number;
  id?: number;
  kind: string;
  date: string;
  local: string;
  timeZone: string;
  occurrence: string;
  reason: string;
};
const drafts = new Map<number, Draft>(),
  writer = createWorkWriter();
const labels: Record<string, string> = {
  deadline: "Edit deadline",
  "followup-create": "Schedule follow-up",
  "followup-snooze": "Snooze follow-up",
  "followup-complete": "Complete follow-up",
  "followup-cancel": "Cancel follow-up",
};
export default forwardRef<
  SupportEditorHandle,
  {
    task: WorkTodo;
    disabled: boolean;
    onStateChange: (state: SupportEditorState) => void;
    onChanged: (task: WorkTodo) => void;
  }
>(function TaskDates({ task, disabled, onStateChange, onChanged }, ref) {
  const { describeWorkDate } = useDateTime();
  const [data, setData] = useState<WorkDatesView | null>(null),
    [reload, setReload] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(() => drafts.get(task.id) ?? null),
    [busy, setBusy] = useState(false);
  const live = useRef(draft),
    lock = useRef(false);
  live.current = draft;
  function clear() {
    drafts.delete(task.id);
    live.current = null;
    setDraft(null);
  }
  useImperativeHandle(ref, () => ({
    discard: clear,
    isDirty: () => !!live.current,
    isBusy: () => lock.current,
  }));
  const read = useTaskRead();
  useInitialTaskLoad(!data && !error);
  useEffect(() => {
    onStateChange({ dirty: !!draft, busy });
  }, [draft, busy, onStateChange]);
  useEffect(
    () => () => {
      if (live.current) drafts.set(task.id, live.current);
    },
    [task.id],
  );
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void read<WorkDatesView>(`/api/todos/${task.id}/dates`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : "Unable to load task dates.");
      });
    return () => {
      active = false;
    };
  }, [task.id, task.revision, reload, read]);
  function start(action: string, value?: StoredWorkDate & { id?: number; reason?: string | null }) {
    setError("");
    setNotice("");
    setDraft({
      action,
      revision: task.revision,
      ...(value?.id ? { id: value.id } : {}),
      kind: value?.at ? "TIME" : "DATE",
      date: value?.date ?? "",
      local: value?.at ? localParts(value.at, data!.timeZone) : "",
      timeZone: data!.timeZone,
      occurrence: "",
      reason: action === "followup-snooze" ? (value?.reason ?? "") : "",
    });
  }
  async function submit() {
    if (!draft || lock.current) return;
    const saved = { ...draft },
      needsDate = ["deadline", "followup-create", "followup-snooze"].includes(saved.action);
    const date =
      saved.kind === "NONE"
        ? null
        : saved.kind === "DATE"
          ? { kind: "DATE", date: saved.date }
          : {
              kind: "TIME",
              local: saved.local,
              timeZone: saved.timeZone,
              ...(saved.occurrence ? { occurrence: saved.occurrence } : {}),
            };
    const body = {
      action: saved.action,
      ...(saved.id ? { id: saved.id } : {}),
      ...(needsDate ? { date } : {}),
      ...(saved.action.startsWith("followup-") ? { reason: saved.reason || null } : {}),
    };
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await writer<WorkTodo>(
        `/api/todos/${task.id}/dates`,
        "POST",
        body,
        saved.revision,
      );
      clear();
      onChanged(result);
      setReload((value) => value + 1);
      setNotice("Task dates saved.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save task dates. Retry or reload the task.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const needsDate =
    draft && ["deadline", "followup-create", "followup-snooze"].includes(draft.action);
  return (
    <section id="task-dates" aria-label="Task dates" className="my-5 min-w-0">
      {error && !draft && (
        <p role="alert" className="mb-3 text-sm text-rose-500">
          {error}{" "}
          <button type="button" onClick={() => setReload((old) => old + 1)} className="underline">
            Retry dates
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 text-sm text-emerald-500">
          {notice}
        </p>
      )}
      {!data ? (
        !error && <p role="status">Loading task dates…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section
            aria-label="Task deadline"
            className={`rounded-xl border p-4 sm:p-5 ${data.deadlineState === "OVERDUE" ? "border-rose-500/60 bg-rose-500/10" : "border-rose-500/25 bg-rose-500/5"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-rose-500">Deadline</h2>
              <button
                type="button"
                disabled={disabled || busy || !!draft}
                onClick={() => start("deadline", data.deadline)}
                className={button}
              >
                {data.deadline.date || data.deadline.at ? "Edit deadline" : "Set deadline"}
              </button>
            </div>
            <p className="mt-3 break-words text-xl font-semibold">
              {data.deadline.date || data.deadline.at
                ? describeWorkDate(data.deadline)
                : "No deadline"}
            </p>
            {data.deadlineState === "OVERDUE" && (
              <p className="mt-2 text-sm font-semibold text-rose-500">Overdue</p>
            )}
          </section>
          <section
            aria-label="Task follow-up"
            className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-amber-500">Follow-up</h2>
              {!data.activeFollowUp && (
                <button
                  type="button"
                  disabled={disabled || busy || !!draft || !data.actionable}
                  onClick={() => start("followup-create")}
                  className={button}
                >
                  Schedule follow-up
                </button>
              )}
            </div>
            {data.activeFollowUp ? (
              <>
                <p className="mt-3 break-words text-xl font-semibold">
                  {describeWorkDate(data.activeFollowUp)}
                </p>
                {data.activeFollowUp.reason && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {data.activeFollowUp.reason}
                  </p>
                )}
                {data.activeFollowUp.state === "DUE" && (
                  <p className="mt-2 text-sm font-semibold text-amber-500">Follow-up due</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {["followup-complete", "followup-snooze", "followup-cancel"].map((action) => (
                    <button
                      type="button"
                      key={action}
                      disabled={disabled || busy || !!draft}
                      onClick={() => start(action, data.activeFollowUp!)}
                      className={button}
                    >
                      {labels[action]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-lg">No active follow-up</p>
            )}
          </section>
        </div>
      )}
      <TaskModal
        open={!!draft}
        title={draft ? labels[draft.action] || "Task date" : "Task date"}
        busy={busy}
        onClose={clear}
      >
        {draft && (
          <form
            aria-label="Task date editor"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {error && (
              <p role="alert" className="text-sm text-rose-500">
                {error}
              </p>
            )}
            {draft.revision !== task.revision && (
              <p role="alert" className="text-sm text-amber-500">
                This draft has an older task version. Discard it and reload the task before editing
                again.
              </p>
            )}
            {needsDate && (
              <>
                <label className="block text-sm">
                  Date type
                  <select
                    aria-label="Date type"
                    value={draft.kind}
                    disabled={busy || disabled}
                    onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
                    className={`${input} mt-1`}
                  >
                    {draft.action === "deadline" && <option value="NONE">No deadline</option>}
                    <option value="DATE">Calendar date only</option>
                    <option value="TIME">Exact date and time</option>
                  </select>
                </label>
                {draft.kind === "DATE" && (
                  <label className="block text-sm">
                    Calendar date
                    <input
                      aria-label="Calendar date"
                      type="date"
                      min="1000-01-01"
                      max="9999-12-31"
                      required
                      disabled={busy || disabled}
                      value={draft.date}
                      onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                      className={`${input} mt-1`}
                    />
                  </label>
                )}
                {draft.kind === "TIME" && (
                  <>
                    <label className="block text-sm">
                      Local date and time
                      <input
                        aria-label="Local date and time"
                        type="datetime-local"
                        step="1"
                        required
                        value={draft.local}
                        disabled={busy || disabled}
                        onChange={(event) =>
                          setDraft({ ...draft, local: event.target.value, occurrence: "" })
                        }
                        className={`${input} mt-1`}
                      />
                    </label>

                    <label className="block text-sm">
                      If the clock repeats this time
                      <select
                        aria-label="Repeated time occurrence"
                        value={draft.occurrence}
                        disabled={busy || disabled}
                        onChange={(event) => setDraft({ ...draft, occurrence: event.target.value })}
                        className={`${input} mt-1`}
                      >
                        <option value="">Require a choice if ambiguous</option>
                        <option value="earlier">Earlier occurrence</option>
                        <option value="later">Later occurrence</option>
                      </select>
                    </label>
                  </>
                )}
              </>
            )}
            {draft.action.startsWith("followup-") && (
              <label className="block text-sm">
                {draft.action === "followup-create" || draft.action === "followup-snooze"
                  ? "Follow-up reason (optional)"
                  : "Outcome note (optional)"}
                <textarea
                  aria-label="Follow-up reason"
                  maxLength={2000}
                  rows={2}
                  value={draft.reason}
                  disabled={busy || disabled}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                  className={`${input} mt-1`}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={disabled || busy || draft.revision !== task.revision}
                className={`${button} bg-blue-600 text-white`}
              >
                {busy
                  ? "Saving…"
                  : draft.action === "deadline"
                    ? "Save deadline"
                    : labels[draft.action]}
              </button>
              <button type="button" disabled={busy} onClick={clear} className={button}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </TaskModal>
    </section>
  );
});
