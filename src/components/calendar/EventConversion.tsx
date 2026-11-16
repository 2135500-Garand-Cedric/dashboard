"use client";
import { useDateTime } from "@/context/SettingsContext";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { workRead, createWorkWriter } from "@/lib/work-management/client";
import { type StoredWorkDate } from "@/lib/work-management/date-format";
import { localParts } from "@/lib/work-management/date-format";
import type { CalendarEvent } from "@/lib/work-management/calendar-types";
import type { WorkActivityType, WorkResults, WorkTodo } from "@/lib/work-management/types";
const input =
    "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2 text-sm",
  button =
    "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
type Preview = {
  token: string;
  event: CalendarEvent;
  task: { id: number; title: string; status: string } | null;
  title: string;
  activityTypeId: number | null;
  beforeDeadline: StoredWorkDate;
  afterDeadline: StoredWorkDate;
  mode: string;
  changeDeadline: boolean;
  warning: string | null;
};
export default function EventConversion({
  event,
  onChanged,
}: {
  event: CalendarEvent;
  onChanged: (event: CalendarEvent) => void;
}) {
  const { describeWorkDate } = useDateTime();
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("RELATED"),
    [title, setTitle] = useState(event.title),
    [taskId, setTaskId] = useState(
      event.taskLinks.length === 1 ? String(event.taskLinks[0].todoId) : "",
    );
  const [q, setQ] = useState(""),
    [choices, setChoices] = useState<WorkTodo[]>([]),
    [activityTypes, setActivityTypes] = useState<WorkActivityType[]>([]),
    [activityTypeId, setActivityTypeId] = useState("");
  const [changeDeadline, setChangeDeadline] = useState(false),
    [kind, setKind] = useState(event.allDayStart ? "DATE" : event.date ? "TIME" : "NONE"),
    [date, setDate] = useState(event.allDayStart ?? ""),
    [local, setLocal] = useState(event.date ? localParts(event.date, event.appTimeZone) : ""),
    [zone] = useState(event.appTimeZone),
    [occurrence, setOccurrence] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState(false),
    [restore, setRestore] = useState(true),
    [ack, setAck] = useState(false);
  const writer = useRef(createWorkWriter()),
    previewBody = useRef<Record<string, unknown> | null>(null),
    lock = useRef(false);
  useEffect(() => {
    void workRead<WorkActivityType[]>("/api/activity-types")
      .then((data) => {
        setActivityTypes(data);
        setActivityTypeId(
          String(
            data.find(
              (item) => item.name.toLowerCase() === event.type?.toLowerCase() && item.active,
            )?.id ?? "",
          ),
        );
      })
      .catch(() => setError("Unable to load activity types."));
  }, [event.type]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      void workRead<WorkResults>(`/api/work-items?view=all&q=${encodeURIComponent(q)}`)
        .then((data) => {
          if (active) setChoices(data.items);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, open]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save conversion.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (event.kind === "WORK_SESSION") return null;
  return (
    <section
      aria-label="Event conversion"
      className="space-y-4 rounded-xl border border-card-border p-4"
    >
      <h2 className="font-semibold">Task and deadline conversion</h2>
      {error && (
        <p role="alert" className="break-words text-sm text-rose-500">
          {error}
        </p>
      )}
      {event.conversion ? (
        <>
          <p className="text-sm">
            {event.superseded
              ? "This explicitly superseded placeholder is hidden from the calendar. Its original data is retained."
              : "This remains a real event, related to its task."}
          </p>
          <Link
            href={`/todos/${event.conversion.todoId}`}
            className={`${button} inline-block text-blue-400`}
          >
            Open converted task
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setUndo(!undo);
              setAck(false);
            }}
            className={button}
          >
            Review undo conversion
          </button>
          {undo && (
            <form
              aria-label="Undo conversion"
              className="space-y-3 border-t border-card-border pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  const result = await writer.current<{ event: CalendarEvent }>(
                    `/api/events/${event.id}/conversion/undo`,
                    "POST",
                    { conversionId: event.conversion!.id, restoreDeadline: restore },
                    event.revision,
                  );
                  setUndo(false);
                  onChanged(result.event);
                });
              }}
            >
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={restore}
                  onChange={(e) => {
                    setRestore(e.target.checked);
                    setAck(false);
                  }}
                />
                Restore the previous deadline if the task is still unchanged
              </label>
              <p className="text-sm text-gray-500">
                Undo keeps the task and its related links. Later event fields are never overwritten.
                If the task changed, restore event display only and review its current deadline
                separately.
              </p>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                {restore
                  ? "I reviewed the retained task and previous deadline policy."
                  : "Keep the current task deadline and restore event display; both may appear."}
              </label>
              <button type="submit" disabled={busy || !ack} className={button}>
                Confirm undo
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setOpen(!open);
              setPreview(null);
            }}
            className={button}
          >
            {open ? "Close conversion" : "Create or link task — preview"}
          </button>
          {open && !preview && (
            <form
              aria-label="Conversion choices"
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  const value =
                    kind === "NONE"
                      ? null
                      : kind === "DATE"
                        ? { kind: "DATE", date }
                        : {
                            kind: "TIME",
                            local,
                            timeZone: zone,
                            ...(occurrence ? { occurrence } : {}),
                          };
                  const body = {
                    mode,
                    taskId: taskId ? Number(taskId) : null,
                    title,
                    activityTypeId: activityTypeId ? Number(activityTypeId) : null,
                    changeDeadline,
                    deadline: changeDeadline ? value : null,
                  };
                  const response = await fetch(`/api/events/${event.id}/conversion/preview`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error || "Unable to preview conversion.");
                  previewBody.current = body;
                  setPreview(data);
                  setAck(false);
                });
              }}
            >
              <label className="block text-sm">
                Event meaning
                <select
                  aria-label="Conversion event meaning"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    if (e.target.value === "PLACEHOLDER") setChangeDeadline(true);
                  }}
                  className={input}
                >
                  <option value="RELATED">Keep as a real event related to the task</option>
                  <option value="PLACEHOLDER">
                    Legacy deadline placeholder — supersede display
                  </option>
                </select>
              </label>
              <label className="block text-sm">
                Find existing task
                <input
                  aria-label="Find conversion task"
                  value={q}
                  maxLength={500}
                  onChange={(e) => setQ(e.target.value)}
                  className={input}
                />
              </label>
              <label className="block text-sm">
                Task
                <select
                  aria-label="Conversion task"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className={input}
                >
                  <option value="">Create a new task</option>
                  {taskId && !choices.some((item) => String(item.id) === taskId) && (
                    <option value={taskId}>TASK-{taskId} (selected linked task)</option>
                  )}
                  {choices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.reference} · {item.title}
                    </option>
                  ))}
                </select>
              </label>
              {!taskId && (
                <>
                  <label className="block text-sm">
                    New task title
                    <input
                      aria-label="Converted task title"
                      required
                      maxLength={500}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={input}
                    />
                  </label>
                  <label className="block text-sm">
                    New task activity type
                    <select
                      aria-label="Converted task activity type"
                      value={activityTypeId}
                      onChange={(e) => setActivityTypeId(e.target.value)}
                      className={input}
                    >
                      <option value="">Unclassified</option>
                      {activityTypes
                        .filter((item) => item.active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={changeDeadline}
                  onChange={(e) => setChangeDeadline(e.target.checked)}
                />
                Explicitly set or replace the task deadline
              </label>
              {changeDeadline && (
                <>
                  <select
                    aria-label="Conversion deadline type"
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    className={input}
                  >
                    <option value="NONE">No deadline / clear current deadline</option>
                    <option value="DATE">Calendar date only</option>
                    <option value="TIME">Exact date and time</option>
                  </select>
                  {kind === "DATE" && (
                    <label className="block text-sm">
                      Task deadline date
                      <input
                        aria-label="Converted deadline date"
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className={input}
                      />
                    </label>
                  )}
                  {kind === "TIME" && (
                    <>
                      <label className="block text-sm">
                        Task deadline local time
                        <input
                          aria-label="Converted deadline time"
                          type="datetime-local"
                          step="1"
                          required
                          value={local}
                          onChange={(e) => {
                            setLocal(e.target.value);
                            setOccurrence("");
                          }}
                          className={input}
                        />
                      </label>

                      <select
                        aria-label="Converted repeated time"
                        value={occurrence}
                        onChange={(e) => setOccurrence(e.target.value)}
                        className={input}
                      >
                        <option value="">Require explicit choice if repeated</option>
                        <option value="earlier">Earlier occurrence</option>
                        <option value="later">Later occurrence</option>
                      </select>
                    </>
                  )}
                </>
              )}
              <button type="submit" disabled={busy} className={`${button} bg-blue-600 text-white`}>
                Preview conversion
              </button>
            </form>
          )}
          {preview && (
            <div
              aria-label="Conversion preview"
              className="space-y-3 rounded-lg border border-blue-500/40 p-4 text-sm"
            >
              <p className="font-medium">
                {preview.task ? "Reuse existing task" : "Create new task"}: {preview.title}
              </p>
              <p>Previous deadline: {describeWorkDate(preview.beforeDeadline)}</p>
              <p>After confirmation: {describeWorkDate(preview.afterDeadline)}</p>
              <p>
                {preview.mode === "PLACEHOLDER"
                  ? "Hide this explicitly identified placeholder; the task deadline is the calendar source."
                  : "Keep the event and its times unchanged. The task deadline is independent."}
              </p>
              <p>
                The original event snapshot is retained. A new task starts New; event completion
                does not complete it.
              </p>
              {preview.warning && <p className="text-amber-500">{preview.warning}</p>}
              <label className="flex gap-2">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I
                reviewed this task, deadline and event meaning.
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !ack}
                  onClick={() =>
                    void perform(async () => {
                      const result = await writer.current<{ event: CalendarEvent }>(
                        `/api/events/${event.id}/conversion`,
                        "POST",
                        { ...previewBody.current, previewToken: preview.token },
                        preview.event.revision,
                      );
                      setPreview(null);
                      setOpen(false);
                      onChanged(result.event);
                    })
                  }
                  className={`${button} bg-blue-600 text-white`}
                >
                  Confirm conversion
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                  className={button}
                >
                  Edit choices / refresh preview
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
