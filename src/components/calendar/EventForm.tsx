"use client";
import RepeatFields from "@/components/recurrence/RepeatFields";
import RepeatedTimeChoice from "@/components/shared/RepeatedTimeChoice";
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
  const [frequency, setFrequency] = useState(
    event?.recurrence?.active ? event.recurrence.frequency : "",
  );
  const [until, setUntil] = useState(event?.recurrence?.until ?? "");
  const [scope, setScope] = useState("CURRENT");
  const [title, setTitle] = useState(
      event?.title ?? (initialTask ? `Work on ${initialTask.title}` : ""),
    ),
    [description, setDescription] = useState(event?.description ?? ""),
    [type, setType] = useState(event?.type ?? "");
  const kind = event?.kind ?? (initialTask ? "WORK_SESSION" : "ORDINARY");
  const [timing, setTiming] = useState(
      event?.allDayStart ? "ALL_DAY" : event?.date || initialTask ? "TIMED" : "TBD",
    ),
    [zone] = useState(timeZone);
  const [start, setStart] = useState(
      event?.date ? localParts(event.date, timeZone).slice(0, 16) : "",
    ),
    [end, setEnd] = useState(
      event?.endDate ? localParts(event.endDate, timeZone).slice(0, 16) : "",
    );
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
  const [choices, setChoices] = useState<WorkTodo[]>([]),
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
    frequency,
    until,
    scope,
    title,
    description,
    type,
    kind,
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
  const recurrenceChanged = event?.recurrence
    ? frequency !== (event.recurrence.active ? event.recurrence.frequency : "") ||
      until !== (event.recurrence.until ?? "")
    : Boolean(frequency);
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
    async function loadTasks() {
      try {
        const first = await workRead<WorkResults>("/api/work-items?view=all");
        const items = [...first.items];
        for (let page = 2; active && (page - 1) * first.pageSize < first.total; page++) {
          const next = await workRead<WorkResults>(`/api/work-items?view=all&page=${page}`);
          items.push(...next.items);
        }
        if (active) setChoices(items);
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "Unable to load tasks.");
      }
    }
    void loadTasks();
    return () => {
      active = false;
    };
  }, []);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      if (
        frequency &&
        timing === "TBD" &&
        (!event?.recurrence ||
          (scope === "SERIES" &&
            (recurrenceChanged || originalTiming.current !== timingFingerprint)))
      )
        throw new Error("Choose a date before making this event recur.");
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
      const sameLinks =
        event &&
        JSON.stringify(
          links.map(({ todoId, role }) => ({ todoId, role })).sort((a, b) => a.todoId - b.todoId),
        ) ===
          JSON.stringify(
            event.taskLinks
              .map(({ todoId, role }) => ({ todoId, role }))
              .sort((a, b) => a.todoId - b.todoId),
          );
      const fields = {
        ...(!event && frequency ? { recurrence: { frequency, until: until || null } } : {}),
        ...(event
          ? {
              scope,
              ...(event.recurrence ? { seriesRevision: event.recurrence.revision } : {}),
              ...((!event.recurrence && frequency) ||
              (event.recurrence && scope === "SERIES" && recurrenceChanged)
                ? { recurrence: { frequency, until: until || null } }
                : {}),
            }
          : {}),
        reminderMinutes: null,
        ...(!event || title !== event.title ? { title } : {}),
        ...(!event || description !== (event.description ?? "")
          ? { description: description || null }
          : {}),
        ...(!event || type !== (event.type ?? "") ? { type: type || null } : {}),
        ...(!event || kind !== event.kind ? { kind } : {}),
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
      {!embedded && <h2 className="text-lg font-semibold">{event ? "Edit event" : "New event"}</h2>}
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
                    step="60"
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
                <RepeatedTimeChoice
                  local={String(value)}
                  timeZone={timeZone}
                  value={String(occurrence)}
                  disabled={saving}
                  label={`${label} clock-change occurrence`}
                  ariaLabel={`${label} repeated time`}
                  onChange={setOccurrence as (value: string) => void}
                  className={input}
                />
              </div>
            ))}
          </div>
        </>
      )}
      {event?.recurrence && (
        <label className="block space-y-1 text-sm">
          Apply changes to
          <select
            aria-label="Apply changes to"
            className={input}
            value={scope}
            disabled={saving}
            onChange={(e) => {
              setScope(e.target.value);
              if (e.target.value === "CURRENT") {
                setFrequency(event.recurrence?.active ? event.recurrence.frequency : "");
                setUntil(event.recurrence?.until ?? "");
              }
            }}
          >
            <option value="CURRENT">This event only</option>
            <option value="SERIES">Entire series</option>
          </select>
        </label>
      )}
      <RepeatFields
        frequency={frequency}
        until={until}
        onFrequency={setFrequency}
        onUntil={setUntil}
        disabled={saving || (!!event?.recurrence && scope === "CURRENT")}
        start={first || start}
      />
      {event?.recurrence && scope === "CURRENT" && (
        <p className="text-xs text-gray-400">
          Choose Entire series to change the repeating schedule.
        </p>
      )}
      {event?.recurrence && scope === "SERIES" && (
        <p className="text-xs text-gray-400">
          Shared details apply throughout the series. Schedule changes replace untouched upcoming
          copies; completed events and individual exceptions are preserved.
        </p>
      )}
      <label className="block space-y-1 text-sm">
        Linked task
        <select
          aria-label="Choose a task to link"
          value={
            links.find((link) => link.role === "SESSION_TARGET")?.todoId ?? links[0]?.todoId ?? ""
          }
          disabled={saving}
          onChange={(e) => {
            const selected = choices.find((item) => item.id === Number(e.target.value));
            setLinks(
              selected
                ? [
                    {
                      todoId: selected.id,
                      title: selected.title,
                      role: kind === "WORK_SESSION" ? "SESSION_TARGET" : "RELATED",
                      revision: selected.revision,
                    },
                  ]
                : [],
            );
          }}
          className={input}
        >
          <option value="">Choose a task to link</option>
          {links
            .filter((link) => !choices.some((item) => item.id === link.todoId))
            .map((link) => (
              <option key={link.todoId} value={link.todoId}>
                TASK-{String(link.todoId).padStart(4, "0")} · {link.title}
              </option>
            ))}
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.reference} · {item.title}
            </option>
          ))}
        </select>
      </label>
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
