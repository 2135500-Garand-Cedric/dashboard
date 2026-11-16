"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { localParts } from "@/lib/work-management/date-format";
import type { CalendarEvent } from "@/lib/work-management/calendar-types";
import type { WorkTodo, WorkResults } from "@/lib/work-management/types";
import { useWorkDraftGuard } from "@/components/work/useWorkDraftGuard";
const input =
    "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2 text-sm",
  button =
    "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export default function EventForm({
  event,
  timeZone,
  initialTask,
  onSaved,
  onCancel,
  onBusyChange,
  embedded = false,
}: {
  event?: CalendarEvent;
  timeZone: string;
  initialTask?: WorkTodo | null;
  onSaved: (event: CalendarEvent) => void;
  onCancel: () => void;
  onBusyChange?: (busy: boolean) => void;
  embedded?: boolean;
}) {
  const [reminder, setReminder] = useState(
    event?.reminderMinutes == null ? "" : String(event.reminderMinutes),
  );
  const [title, setTitle] = useState(
      event?.title ?? (initialTask ? `Work on ${initialTask.title}` : ""),
    ),
    [description, setDescription] = useState(event?.description ?? ""),
    [type, setType] = useState(event?.type ?? "");
  const [kind, setKind] = useState(event?.kind ?? (initialTask ? "WORK_SESSION" : "ORDINARY")),
    [busy, setBusy] = useState(
      event?.busy === false ? "FREE" : event?.busy === true ? "BUSY" : "UNKNOWN",
    );
  const [timing, setTiming] = useState(
      event?.allDayStart ? "ALL_DAY" : event?.date || initialTask ? "TIMED" : "TBD",
    ),
    [zone] = useState(timeZone);
  const [start, setStart] = useState(event?.date ? localParts(event.date, timeZone) : ""),
    [end, setEnd] = useState(event?.endDate ? localParts(event.endDate, timeZone) : "");
  const [first, setFirst] = useState(event?.allDayStart ?? ""),
    [last, setLast] = useState(event?.allDayEnd ? shift(event.allDayEnd, -1) : "");
  const [startOccurrence, setStartOccurrence] = useState(""),
    [endOccurrence, setEndOccurrence] = useState("");
  const [links, setLinks] = useState<
    { todoId: number; role: string; title: string; revision?: number }[]
  >(
    () =>
      event?.taskLinks?.map((link) => ({
        todoId: link.todoId,
        role: link.role,
        title: link.task.title,
        ...(link.task.revision ? { revision: link.task.revision } : {}),
      })) ??
      (initialTask
        ? [
            {
              todoId: initialTask.id,
              role: "SESSION_TARGET",
              title: initialTask.title,
              revision: initialTask.revision,
            },
          ]
        : []),
  );
  const [q, setQ] = useState(""),
    [choices, setChoices] = useState<WorkTodo[]>([]),
    [catalog, setCatalog] = useState<{ id: number; name: string; active: boolean }[]>([]),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const writer = useRef(createWorkWriter()),
    lock = useRef(false),
    clean = useRef(false),
    baseline = useRef("");
  const timingFingerprint = JSON.stringify({
      timing,
      zone,
      start,
      end,
      first,
      last,
      startOccurrence,
      endOccurrence,
    }),
    originalTiming = useRef(timingFingerprint);
  const fingerprint = JSON.stringify({
    reminder,
    title,
    description,
    type,
    kind,
    busy,
    timing,
    zone,
    start,
    end,
    first,
    last,
    links,
    startOccurrence,
    endOccurrence,
  });
  if (!baseline.current) baseline.current = fingerprint;
  const confirmLeave = useWorkDraftGuard(
    () => !clean.current && fingerprint !== baseline.current,
    () => {
      clean.current = true;
    },
  );
  useEffect(() => {
    void workRead<typeof catalog>("/api/activity-types")
      .then(setCatalog)
      .catch(() => setError("Unable to load activity labels. Retry by reopening the form."));
  }, []);
  useEffect(() => {
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
  }, [q]);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      if (
        kind === "WORK_SESSION" &&
        (timing !== "TIMED" ||
          !end ||
          links.filter((link) => link.role === "SESSION_TARGET").length !== 1)
      )
        throw new Error("Choose exact start/end times and one explicit session task.");
      const instant = (value: string, occurrence: string) => ({
        kind: "TIME",
        local: value,
        timeZone: zone,
        ...(occurrence ? { occurrence } : {}),
      });
      const times =
        timing === "TBD"
          ? { kind: "TBD" }
          : timing === "ALL_DAY"
            ? { kind: "ALL_DAY", startDate: first, endExclusive: shift(last || first, 1) }
            : {
                kind: "TIMED",
                start: instant(start, startOccurrence),
                end: end ? instant(end, endOccurrence) : null,
              };
      const availability = busy === "UNKNOWN" ? null : busy === "BUSY",
        sameLinks =
          event &&
          JSON.stringify(
            links.map(({ todoId, role }) => ({ todoId, role })).sort((a, b) => a.todoId - b.todoId),
          ) ===
            JSON.stringify(
              event.taskLinks
                .map(({ todoId, role }) => ({ todoId, role }))
                .sort((a, b) => a.todoId - b.todoId),
            );
      const reminderMinutes = reminder === "" ? null : Number(reminder);
      const fields = {
        ...(!event || reminderMinutes !== (event.reminderMinutes ?? null)
          ? { reminderMinutes }
          : {}),
        ...(!event || title !== event.title ? { title } : {}),
        ...(!event || description !== (event.description ?? "")
          ? { description: description || null }
          : {}),
        ...(!event || type !== (event.type ?? "") ? { type: type || null } : {}),
        ...(!event || kind !== event.kind ? { kind } : {}),
        ...(!event || availability !== event.busy ? { busy: availability } : {}),
        ...(event &&
        originalTiming.current === timingFingerprint &&
        !(kind === "WORK_SESSION" && event.kind !== "WORK_SESSION")
          ? {}
          : { timing: times }),
        ...(sameLinks
          ? {}
          : {
              links: links.map(({ todoId, role, revision }) => ({
                todoId,
                role,
                ...(revision ? { revision } : {}),
              })),
            }),
      };
      const result = await writer.current<CalendarEvent>(
        event ? `/api/events/${event.id}` : "/api/events",
        event ? "PATCH" : "POST",
        fields,
        event?.revision,
      );
      clean.current = true;
      onSaved(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save the event.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);
  return (
    <form
      aria-label="Event editor"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className={
        embedded
          ? "min-w-0 space-y-4"
          : "min-w-0 space-y-4 rounded-xl border border-card-border bg-card-bg p-4"
      }
    >
      {!embedded && (
        <h2 className="text-lg font-semibold">
          {event ? "Edit event" : "New event or work session"}
        </h2>
      )}
      {error && (
        <p role="alert" className="break-words text-sm text-rose-500">
          {error}
        </p>
      )}
      <label className="block text-sm">
        Title
        <input
          aria-label="Event title"
          required
          maxLength={500}
          value={title}
          disabled={saving}
          onChange={(e) => setTitle(e.target.value)}
          className={input}
        />
      </label>
      <label className="block text-sm">
        Description
        <textarea
          aria-label="Event description"
          rows={2}
          maxLength={50000}
          value={description}
          disabled={saving}
          onChange={(e) => setDescription(e.target.value)}
          className={input}
        />
      </label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Event kind
          <select
            aria-label="Event kind"
            value={kind}
            disabled={saving}
            onChange={(e) => {
              setKind(e.target.value);
              if (e.target.value !== "WORK_SESSION")
                setLinks(links.map((link) => ({ ...link, role: "RELATED" })));
              else setTiming("TIMED");
            }}
            className={input}
          >
            <option value="ORDINARY">Ordinary event</option>
            <option value="INFORMATIONAL">Informational event</option>
            <option value="WORK_SESSION">Scheduled work session</option>
          </select>
        </label>
        <label className="block text-sm">
          Availability
          <select
            aria-label="Event availability"
            value={busy}
            disabled={saving}
            onChange={(e) => setBusy(e.target.value)}
            className={input}
          >
            <option value="UNKNOWN">Not specified</option>
            <option value="BUSY">Busy / reserves time</option>
            <option value="FREE">Free / informational</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Activity label
        <select
          aria-label="Activity label"
          value={type}
          disabled={saving}
          onChange={(e) => setType(e.target.value)}
          className={input}
        >
          <option value="">None</option>
          {type && !catalog.some((item) => item.name === type) && (
            <option value={type}>{type}</option>
          )}
          {catalog
            .filter((item) => item.active || item.name === type)
            .map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label className="block text-sm">
        Timing
        <select
          aria-label="Event timing"
          value={timing}
          disabled={saving}
          onChange={(e) => setTiming(e.target.value)}
          className={input}
        >
          <option value="TBD" disabled={kind === "WORK_SESSION"}>
            TBD
          </option>
          <option value="TIMED">Exact date and time</option>
          <option value="ALL_DAY" disabled={kind === "WORK_SESSION"}>
            All-day calendar dates
          </option>
        </select>
      </label>
      {timing === "ALL_DAY" && (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            First day
            <input
              aria-label="First day"
              type="date"
              required
              value={first}
              disabled={saving}
              onChange={(e) => setFirst(e.target.value)}
              className={input}
            />
          </label>
          <label className="text-sm">
            Through (inclusive)
            <input
              aria-label="Through day"
              type="date"
              min={first || undefined}
              value={last}
              disabled={saving}
              onChange={(e) => setLast(e.target.value)}
              className={input}
            />
          </label>
        </div>
      )}
      {timing === "TIMED" && (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {[
              ["Start", start, setStart, startOccurrence, setStartOccurrence],
              ["End", end, setEnd, endOccurrence, setEndOccurrence],
            ].map(([label, value, setValue, occurrence, setOccurrence]) => (
              <div key={String(label)} className="min-w-0 space-y-2">
                <label className="block text-sm">
                  {String(label)} date and time
                  {label === "End" && kind !== "WORK_SESSION" ? " (optional)" : ""}
                  <input
                    aria-label={`${label} date and time`}
                    type="datetime-local"
                    step="1"
                    required={label === "Start" || kind === "WORK_SESSION"}
                    value={String(value)}
                    disabled={saving}
                    onChange={(e) => {
                      (setValue as (value: string) => void)(e.target.value);
                      (setOccurrence as (value: string) => void)("");
                    }}
                    className={input}
                  />
                </label>
                <label className="block text-xs text-gray-500">
                  If {String(label).toLowerCase()} time repeats
                  <select
                    aria-label={`${label} repeated time`}
                    value={String(occurrence)}
                    disabled={saving}
                    onChange={(e) => (setOccurrence as (value: string) => void)(e.target.value)}
                    className={input}
                  >
                    <option value="">Require explicit choice</option>
                    <option value="earlier">Earlier occurrence</option>
                    <option value="later">Later occurrence</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        </>
      )}
      <fieldset className="min-w-0 space-y-3 rounded-lg border border-card-border p-3">
        <legend className="px-1 text-sm font-medium">Linked tasks</legend>
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.todoId}
              className="min-w-0 space-y-2 rounded border border-card-border p-2"
            >
              <p className="break-words text-sm">
                TASK-{String(link.todoId).padStart(4, "0")} · {link.title}
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label={`Task role ${link.todoId}`}
                  value={link.role}
                  disabled={saving}
                  onChange={(e) =>
                    setLinks(
                      links.map((item) => ({
                        ...item,
                        role:
                          item.todoId === link.todoId
                            ? e.target.value
                            : e.target.value === "SESSION_TARGET"
                              ? "RELATED"
                              : item.role,
                      })),
                    )
                  }
                  className={input}
                >
                  <option value="RELATED">Related task</option>
                  {kind === "WORK_SESSION" && (
                    <option value="SESSION_TARGET">Task this session works on</option>
                  )}
                </select>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setLinks(links.filter((item) => item.todoId !== link.todoId))}
                  className={button}
                >
                  Remove task link
                </button>
              </div>
            </li>
          ))}
        </ul>
        <label className="block text-sm">
          Find task
          <input
            aria-label="Find event task"
            maxLength={500}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={input}
          />
        </label>
        <select
          aria-label="Add event task"
          value=""
          disabled={saving || links.length >= 30}
          onChange={(e) => {
            const item = choices.find((item) => item.id === Number(e.target.value));
            if (item)
              setLinks([
                ...links,
                { todoId: item.id, title: item.title, role: "RELATED", revision: item.revision },
              ]);
          }}
          className={input}
        >
          <option value="">Choose a task to link</option>
          {choices
            .filter((item) => !links.some((link) => link.todoId === item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.reference} · {item.title}
              </option>
            ))}
        </select>
        <p className="text-xs text-gray-500">
          Search by TASK reference for a specific task. A session needs one explicitly selected
          session task; other links are related.
        </p>
      </fieldset>
      <label className="block text-sm">
        Reminder
        <select
          aria-label="Event reminder"
          className={input}
          value={reminder}
          disabled={saving}
          onChange={(event) => setReminder(event.target.value)}
        >
          <option value="">Use notification settings</option>
          <option value="-1">No reminder</option>
          <option value="0">At the scheduled time</option>
          <option value="5">5 minutes before</option>
          <option value="15">15 minutes before</option>
          <option value="30">30 minutes before</option>
          <option value="60">1 hour before</option>
          <option value="1440">1 day before</option>
          <option value="10080">1 week before</option>
        </select>
      </label>
      <Link href="/settings" className="inline-block text-sm text-blue-400 underline">
        Manage phone notifications
      </Link>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={`${button} bg-blue-600 text-white`}>
          {saving ? "Saving…" : "Save event"}
        </button>
        <button
          type="button"
          data-event-cancel
          disabled={saving}
          onClick={() => {
            if (confirmLeave()) onCancel();
          }}
          className={button}
        >
          Cancel editor
        </button>
      </div>
    </form>
  );
}
