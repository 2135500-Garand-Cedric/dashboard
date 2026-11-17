"use client";
import RepeatedTimeChoice from "@/components/shared/RepeatedTimeChoice";
import { useInitialTaskLoad, useTaskRead } from "@/components/work/TaskInitialLoad";
import Link from "next/link";
import TaskModal from "@/components/shared/TaskModal";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter } from "@/lib/work-management/client";
import { eventTiming, type CalendarEvent } from "@/lib/work-management/calendar-types";
import { useDateTime } from "@/context/SettingsContext";
import { localParts } from "@/lib/work-management/date-format";
import { resolveLocalInstants } from "@/lib/local-time";
import type { SupportEditorHandle, SupportEditorState } from "@/lib/work-management/types";
type ScheduleDraft = { start: string; minutes: string; occurrence: string; revision: number };
const drafts = new Map<number, ScheduleDraft>();
const write = createWorkWriter();
const TaskCalendar = forwardRef<
  SupportEditorHandle,
  {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    id: number;
    revision: number;
    title: string;
    archived?: boolean;
    disabled?: boolean;
    onStateChange: (state: SupportEditorState) => void;
    onScheduled: () => Promise<void>;
  }
>(function TaskCalendar(
  {
    id,
    revision,
    title,
    archived = false,
    disabled,
    onStateChange,
    onScheduled,
    open,
    onOpen,
    onClose,
  },
  ref,
) {
  const read = useTaskRead();
  const { timeZone, parseLocalInput } = useDateTime();
  const [draft, setDraft] = useState<ScheduleDraft>(
    () => drafts.get(id) ?? { start: "", minutes: "30", occurrence: "", revision },
  );
  const [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    currentDraft = useRef(draft);
  currentDraft.current = draft;
  const dirty = !!draft.start || draft.minutes !== "30" || !!draft.occurrence;
  const reset = () => {
    drafts.delete(id);
    setDraft({ start: "", minutes: "30", occurrence: "", revision });
  };
  useImperativeHandle(ref, () => ({
    discard: () => {
      reset();
      onClose();
    },
    isDirty: () =>
      !!currentDraft.current.start ||
      currentDraft.current.minutes !== "30" ||
      !!currentDraft.current.occurrence,
    isBusy: () => lock.current,
  }));
  useEffect(() => {
    onStateChange({ dirty, busy: saving });
  }, [dirty, saving, onStateChange]);
  useEffect(
    () => () => {
      const value = currentDraft.current;
      if (value.start || value.minutes !== "30" || value.occurrence) drafts.set(id, value);
    },
    [id],
  );
  useEffect(() => {
    if (!dirty && draft.revision !== revision) setDraft((old) => ({ ...old, revision }));
  }, [dirty, revision, draft.revision]);
  useEffect(() => {
    if (dirty && !open) onOpen();
  }, [dirty, open, onOpen]);
  const dismiss = () => {
    if (!lock.current) {
      reset();
      setError("");
      onClose();
    }
  };
  const [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [data, setData] = useState<{
      items: CalendarEvent[];
      total: number;
      page: number;
      pageSize: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    void read<NonNullable<typeof data>>(`/api/todos/${id}/calendar?page=${page}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision, page, reload, read]);
  useInitialTaskLoad(!data && !error);
  const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
  return (
    <section
      aria-label="Task calendar links"
      className="space-y-3 rounded-xl border border-card-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Work sessions & linked events</h2>
      </div>
      <TaskModal
        open={open && !archived}
        title="Schedule work session"
        busy={saving}
        onClose={dismiss}
      >
        {!archived && (
          <form
            aria-label="Schedule work session"
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current || disabled) return;
              lock.current = true;
              setSaving(true);
              setError("");
              setNotice("");
              try {
                const minutes = Number(draft.minutes);
                if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
                  throw new Error("Choose a duration between 1 and 10,080 minutes.");
                const start = new Date(parseLocalInput(draft.start, draft.occurrence));
                const end = new Date(start.getTime() + minutes * 60000);
                const endLocal = localParts(end, timeZone),
                  endCandidates = resolveLocalInstants(endLocal, timeZone);
                const endOccurrence =
                  endCandidates.length > 1
                    ? endCandidates[0].getTime() === end.getTime()
                      ? "earlier"
                      : "later"
                    : undefined;
                await write<CalendarEvent>("/api/events", "POST", {
                  title: `Work on ${title}`.slice(0, 500),
                  kind: "WORK_SESSION",
                  busy: true,
                  timing: {
                    kind: "TIMED",
                    start: {
                      kind: "TIME",
                      local: draft.start,
                      timeZone,
                      ...(draft.occurrence ? { occurrence: draft.occurrence } : {}),
                    },
                    end: {
                      kind: "TIME",
                      local: endLocal,
                      timeZone,
                      ...(endOccurrence ? { occurrence: endOccurrence } : {}),
                    },
                  },
                  links: [{ todoId: id, role: "SESSION_TARGET", revision: draft.revision }],
                });
                reset();
                onClose();
                setNotice("Work session scheduled.");
                setPage(1);
                setReload((old) => old + 1);
                try {
                  await onScheduled();
                } catch {
                  setError("The session was saved. Reload the task to refresh its details.");
                }
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "Unable to schedule this work session.",
                );
              } finally {
                lock.current = false;
                setSaving(false);
              }
            }}
          >
            {error && (
              <p role="alert" className="text-sm text-rose-500">
                {error}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,10rem)]">
              <label className="text-sm">
                Start date and time
                <input
                  aria-label="Work session start"
                  type="datetime-local"
                  required
                  value={draft.start}
                  disabled={saving || disabled}
                  onChange={(event) =>
                    setDraft((old) => ({ ...old, start: event.target.value, occurrence: "" }))
                  }
                  className="mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2"
                />
              </label>
              <label className="text-sm">
                Minutes
                <input
                  aria-label="Work session minutes"
                  type="number"
                  min={1}
                  max={10080}
                  required
                  value={draft.minutes}
                  disabled={saving || disabled}
                  onChange={(event) => setDraft((old) => ({ ...old, minutes: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-card-border bg-card-bg p-2"
                />
              </label>
            </div>
            <RepeatedTimeChoice
              local={draft.start}
              timeZone={timeZone}
              value={draft.occurrence}
              disabled={saving || disabled}
              ariaLabel="Work session time occurrence"
              onChange={(value) => setDraft((old) => ({ ...old, occurrence: value }))}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={disabled || saving || !draft.start}
                className={`${button} bg-blue-600 text-white`}
              >
                {saving ? "Scheduling…" : "Schedule work session"}
              </button>
              <button type="button" disabled={saving} className={button} onClick={dismiss}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </TaskModal>
      {notice && (
        <p role="status" className="text-sm text-emerald-500">
          {notice}
        </p>
      )}
      {error && !open && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading calendar links…</p>}
      <ul className="space-y-3">
        {data?.items.map((event) => (
          <li key={event.id} className="space-y-1 border-t border-card-border pt-3">
            <Link
              href={`/events/${event.id}`}
              className="break-words text-sm text-blue-400 underline"
            >
              {event.kind === "WORK_SESSION" ? "▣ Session" : "○ Event"} · {event.title}
            </Link>
            <p className="break-words text-xs text-gray-500">
              {eventTiming(event)}
              {event.superseded ? " · Superseded placeholder" : ""}
              {event.completed ? " · Completed event" : ""}
            </p>
          </li>
        ))}
      </ul>
      {data?.total === 0 && <p className="text-sm text-gray-500">No sessions or related events.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setReload((value) => value + 1)} className={button}>
          Reload calendar links
        </button>
        {data && data.total > data.pageSize && (
          <>
            <button
              type="button"
              disabled={!data || data.page <= 1}
              onClick={() => setPage(page - 1)}
              className={button}
            >
              Previous events
            </button>
            <button
              type="button"
              disabled={!data || data.page * data.pageSize >= data.total}
              onClick={() => setPage(page + 1)}
              className={button}
            >
              Next events
            </button>
          </>
        )}
      </div>
    </section>
  );
});
export default TaskCalendar;
