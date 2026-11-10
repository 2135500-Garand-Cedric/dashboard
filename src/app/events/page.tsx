"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import type { DatesSetArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { describeWorkDate, localParts, localToday } from "@/lib/work-management/date-format";
import { eventTiming, type CalendarFeed } from "@/lib/work-management/calendar-types";
import type { WorkContext, WorkTodo } from "@/lib/work-management/types";
import { useMemory } from "@/context/MemoryContext";
import EventForm from "@/components/calendar/EventForm";
import ActivityTypeSettings from "@/components/calendar/ActivityTypeSettings";
const button =
  "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const allLayers = [
  ["events", "○ Events / information"],
  ["sessions", "▣ Work sessions"],
  ["deadlines", "⚑ Deadlines"],
  ["followups", "↻ Follow-ups"],
  ["keydates", "◇ Key dates"],
];
type Move = { id: number; revision: number; title: string; date: string; endDate: string };
export default function EventsPage() {
  const { pageRouter, get, set } = useMemory(),
    calendar = useRef<FullCalendar>(null),
    writer = useRef(createWorkWriter()),
    dialog = useRef<HTMLDialogElement>(null);
  const [range, setRange] = useState(() => {
    const now = new Date(),
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 7 * 86400000),
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) + 7 * 86400000);
    return { start: start.toISOString(), end: end.toISOString() };
  });
  const [data, setData] = useState<CalendarFeed | null>(null),
    [contexts, setContexts] = useState<WorkContext[]>([]),
    [layers, setLayers] = useState(allLayers.map(([key]) => key)),
    [context, setContext] = useState(""),
    [history, setHistory] = useState(false),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const [view, setView] = useState("dayGridMonth"),
    [title, setTitle] = useState("Calendar"),
    [creating, setCreating] = useState(false),
    [initialTask, setInitialTask] = useState<WorkTodo | null>(null),
    [settings, setSettings] = useState(false),
    [move, setMove] = useState<Move | null>(null),
    [moveError, setMoveError] = useState(""),
    [saving, setSaving] = useState(false);
  const feedZone = useRef("America/Toronto");
  if (data) feedZone.current = data.timeZone;
  useEffect(() => {
    void workRead<WorkContext[]>("/api/work-contexts")
      .then(setContexts)
      .catch((e) => setError(e.message));
    const query = new URLSearchParams(window.location.search);
    if (query.get("new") === "session" && /^\d+$/.test(query.get("task") || "")) {
      void workRead<WorkTodo>(`/api/todos/${query.get("task")}`)
        .then((task) => {
          setInitialTask(task);
          setCreating(true);
        })
        .catch((e) => setError(e.message));
    }
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    const query = new URLSearchParams({
      ...range,
      layers: layers.join(","),
      context,
      history: String(history),
      tbdPage: String(page),
    });
    void workRead<CalendarFeed>(`/api/work-calendar?${query}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [range, layers, context, history, page, refresh]);
  const datesSet = useCallback(
    (info: DatesSetArg) => {
      setRange((previous) =>
        previous.start === info.start.toISOString() && previous.end === info.end.toISOString()
          ? previous
          : { start: info.start.toISOString(), end: info.end.toISOString() },
      );
      setTitle(info.view.title);
      setView(info.view.type);
      const local = localParts(info.view.currentStart, feedZone.current);
      set("calendar_currentMonth", Number(local.slice(5, 7)));
      set("calendar_currentYear", Number(local.slice(0, 4)));
    },
    [set],
  );
  function proposeMove(info: EventDropArg | EventResizeDoneArg) {
    const props = info.event.extendedProps;
    if (props.layer !== "sessions" || !info.event.start || !info.event.end) {
      info.revert();
      return;
    }
    const candidate = {
      id: Number(props.eventId),
      revision: Number(props.revision),
      title: info.event.title,
      date: info.event.start.toISOString(),
      endDate: info.event.end.toISOString(),
    };
    info.revert();
    setMove(candidate);
    setMoveError("");
  }
  useEffect(() => {
    if (move) dialog.current?.showModal();
  }, [move]);
  const today = data
      ? localToday(new Date(), data.timeZone)
      : new Date().toISOString().slice(0, 10),
    initialDate = `${get("calendar_currentYear", Number(today.slice(0, 4)))}-${String(get("calendar_currentMonth", Number(today.slice(5, 7)))).padStart(2, "0")}-01`;
  return (
    <div className="calendar-page min-w-0 space-y-5 pb-8 pt-12 md:pt-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-gray-500">{data?.timeZone ?? "Loading timezone…"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSettings(true)} className={button}>
            Activity type settings
          </button>
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setInitialTask(null);
                setCreating(true);
              }}
              className={`${button} bg-blue-600 text-white`}
            >
              New event / session
            </button>
          )}
        </div>
      </header>
      <section
        aria-label="Calendar layers and context"
        className="space-y-4 rounded-xl border border-card-border bg-card-bg p-4"
      >
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {allLayers.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={label}
                checked={layers.includes(key)}
                onChange={(e) => {
                  setLayers(
                    e.target.checked ? [...layers, key] : layers.filter((item) => item !== key),
                  );
                  setPage(1);
                }}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm">
            Context
            <select
              aria-label="Calendar context"
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
                setPage(1);
              }}
              className="ml-2 max-w-full rounded border border-card-border bg-card-bg p-2"
            >
              <option value="">All contexts</option>
              <option value="none">Unclassified / unlinked</option>
              {contexts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            Show closed-task date history
          </label>
          <button type="button" onClick={() => setRefresh((value) => value + 1)} className={button}>
            Refresh calendar
          </button>
        </div>
      </section>
      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 p-3 text-rose-500">
          {error}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3 rounded-xl border border-card-border bg-card-bg p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous calendar range"
                onClick={() => calendar.current?.getApi().prev()}
                className={button}
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => calendar.current?.getApi().today()}
                className={button}
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next calendar range"
                onClick={() => calendar.current?.getApi().next()}
                className={button}
              >
                →
              </button>
            </div>
            <h2 className="text-lg font-medium">{title}</h2>
            <div className="flex gap-2">
              {[
                ["dayGridMonth", "Month"],
                ["timeGridWeek", "Week"],
                ["timeGridDay", "Day"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={view === key}
                  onClick={() => calendar.current?.getApi().changeView(key)}
                  className={`${button} ${view === key ? "bg-blue-600 text-white" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!data ? (
            <p role="status">Loading calendar…</p>
          ) : (
            <div className="fullcalendar-theme">
              <FullCalendar
                ref={calendar}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
                initialDate={initialDate}
                initialView="dayGridMonth"
                timeZone={data.timeZone}
                headerToolbar={false}
                events={data.items}
                datesSet={datesSet}
                height={view === "dayGridMonth" ? "auto" : 650}
                scrollTime="07:00:00"
                nowIndicator
                dayMaxEvents={3}
                eventDisplay="block"
                displayEventTime={view !== "dayGridMonth"}
                eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
                nextDayThreshold="00:00:00"
                editable={false}
                eventDrop={proposeMove}
                eventResize={proposeMove}
                eventClick={(info) => {
                  info.jsEvent.preventDefault();
                  const href = info.event.extendedProps.href;
                  if (typeof href === "string" && /^\/(todos|events)\//.test(href))
                    pageRouter("/events", href);
                }}
                eventContent={(info) => (
                  <span
                    className="block min-w-0 max-w-full truncate text-xs"
                    title={info.event.title}
                  >
                    {info.event.extendedProps.completed ? "✓ " : ""}
                    {view !== "dayGridMonth" && info.timeText ? `${info.timeText} · ` : ""}
                    {info.event.title}
                  </span>
                )}
                eventDidMount={(info) => {
                  info.el.title = info.event.title;
                  info.el.setAttribute("aria-label", info.event.title);
                }}
              />
            </div>
          )}
        </div>
        <aside className="min-w-0 space-y-5">
          {creating && data ? (
            <EventForm
              key={initialTask?.id ?? "new"}
              timeZone={data.timeZone}
              initialTask={initialTask}
              onSaved={() => {
                setCreating(false);
                setInitialTask(null);
                setRefresh((value) => value + 1);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : null}
          <section className="space-y-3 rounded-xl border border-card-border bg-card-bg p-4">
            <h2 className="font-medium">In this calendar range</h2>
            <ul className="max-h-[500px] space-y-3 overflow-y-auto">
              {data?.items.slice(0, 40).map((item) => (
                <li key={item.id} className="min-w-0 rounded-lg border border-card-border p-3">
                  <Link
                    href={item.extendedProps.href}
                    className="block break-words text-sm text-blue-400"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 break-words text-xs text-gray-500">
                    {item.allDay
                      ? `${item.start} · calendar date`
                      : describeWorkDate({ date: null, at: item.start, timeZone: data.timeZone })}
                  </p>
                  {item.extendedProps.eventId && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await writer.current(
                            `/api/events/${item.extendedProps.eventId}`,
                            "PATCH",
                            { completed: !item.extendedProps.completed },
                            item.extendedProps.revision,
                          );
                          setRefresh((value) => value + 1);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Unable to save completion.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className={`${button} mt-2`}
                    >
                      {item.extendedProps.completed ? "Mark incomplete" : "Mark completed"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {data?.items.length === 0 && (
              <p className="text-sm text-gray-500">
                No items match these layers, context and range.
              </p>
            )}
            {!!data && data.items.length > 40 && (
              <p className="text-xs text-gray-500">
                First 40 listed; all matching items appear on the calendar.
              </p>
            )}
          </section>
          <section className="space-y-3 rounded-xl border border-card-border bg-card-bg p-4">
            <h2 className="font-medium">TBD events ({data?.tbdTotal ?? 0})</h2>
            <ul className="space-y-3">
              {data?.tbd.map((event) => (
                <li key={event.id}>
                  <Link href={`/events/${event.id}`} className="break-words text-sm text-blue-400">
                    ○ {event.title}
                  </Link>
                  <p className="text-xs text-gray-500">{eventTiming(event)}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!data || data.tbdPage <= 1}
                onClick={() => setPage(page - 1)}
                className={button}
              >
                Previous TBD
              </button>
              <button
                type="button"
                disabled={!data || data.tbdPage * data.tbdPageSize >= data.tbdTotal}
                onClick={() => setPage(page + 1)}
                className={button}
              >
                Next TBD
              </button>
            </div>
          </section>
        </aside>
      </div>
      {settings && (
        <ActivityTypeSettings
          onClose={() => setSettings(false)}
          onChanged={() => setRefresh((value) => value + 1)}
        />
      )}
      {move && (
        <dialog
          ref={dialog}
          aria-label="Confirm session move"
          onCancel={(e) => {
            e.preventDefault();
            if (!saving) setMove(null);
          }}
          className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg space-y-4 overflow-y-auto rounded-xl border border-card-border bg-card-bg p-5 text-foreground backdrop:bg-black/60"
        >
          <h2 className="font-medium">Move only this work session?</h2>
          <p className="break-words">{move.title}</p>
          <p className="break-words text-sm">
            {describeWorkDate({ date: null, at: move.date, timeZone: data!.timeZone })} →{" "}
            {describeWorkDate({ date: null, at: move.endDate, timeZone: data!.timeZone })}
          </p>
          <p className="text-sm text-gray-500">
            The task deadline, follow-up, other sessions and task status remain unchanged.
          </p>
          {moveError && (
            <p role="alert" className="text-rose-500">
              {moveError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setMoveError("");
                try {
                  await writer.current(
                    `/api/events/${move.id}`,
                    "PATCH",
                    { date: move.date, endDate: move.endDate },
                    move.revision,
                  );
                  setMove(null);
                  setRefresh((value) => value + 1);
                } catch (e) {
                  setMoveError(e instanceof Error ? e.message : "Unable to move session.");
                } finally {
                  setSaving(false);
                }
              }}
              className={`${button} bg-blue-600 text-white`}
            >
              Confirm session move
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setMove(null)}
              className={button}
            >
              Keep original time
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
