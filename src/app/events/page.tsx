"use client";
import { useDateTime } from "@/context/SettingsContext";
import FilterPanel from "@/components/shared/FilterPanel";
import { useViewState } from "@/context/ViewStateContext";
import { useSettings } from "@/context/SettingsContext";
import Link from "next/link";
import ProjectPicker from "@/components/projects/ProjectPicker";
import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import type { DatesSetArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { localParts, localToday } from "@/lib/work-management/date-format";
import { eventTiming, type CalendarFeed } from "@/lib/work-management/calendar-types";
import type { WorkActivityType, WorkTodo } from "@/lib/work-management/types";
import { useMemory } from "@/context/MemoryContext";
import TaskModal from "@/components/shared/TaskModal";
import EventForm from "@/components/calendar/EventForm";
import CalendarAgenda from "@/components/calendar/CalendarAgenda";
import { calendarAppearance, calendarItemTiming } from "@/lib/work-management/calendar-display";
import ActivityTypeSettings from "@/components/calendar/ActivityTypeSettings";
const button =
  "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const allLayers = [
  ["events", "○ Events / information"],
  ["sessions", "▣ Work sessions"],
  ["deadlines", "⚑ Deadlines"],
  ["followups", "↻ Follow-ups"],
  ["milestones", "◇ Project milestones"],
];
const defaultLayers = allLayers.map(([key]) => key);
type Move = { id: number; revision: number; title: string; date: string; endDate: string };
export default function EventsPage() {
  const { describeWorkDate } = useDateTime();
  const { timeZone } = useSettings();
  const { pageRouter, get, set } = useMemory(),
    calendar = useRef<FullCalendar>(null),
    writer = useRef(createWorkWriter()),
    dialog = useRef<HTMLDialogElement>(null),
    eventEditor = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(() => {
    const now = new Date(),
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 7 * 86400000),
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) + 7 * 86400000);
    return { start: start.toISOString(), end: end.toISOString() };
  });
  const [data, setData] = useState<CalendarFeed | null>(null),
    [activityTypes, setActivityTypes] = useState<WorkActivityType[]>([]),
    [layers, setLayers] = useViewState<string[]>("calendar:layers", defaultLayers),
    [activityType, setActivityType] = useViewState("calendar:activityType", ""),
    [project, setProject] = useViewState("calendar:project", ""),
    [history, setHistory] = useViewState("calendar:history", false),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const [view, setView] = useViewState("calendar:view", "dayGridMonth"),
    [title, setTitle] = useState("Calendar"),
    [creating, setCreating] = useState(false),
    [eventSaving, setEventSaving] = useState(false),
    [initialTask, setInitialTask] = useState<WorkTodo | null>(null),
    [settings, setSettings] = useState(false),
    [move, setMove] = useState<Move | null>(null),
    [moveError, setMoveError] = useState(""),
    [saving, setSaving] = useState(false);
  const [savedDate, setSavedDate] = useViewState("calendar:date", "");
  const feedZone = useRef(timeZone);
  if (data) feedZone.current = data.timeZone;
  useEffect(() => {
    void workRead<WorkActivityType[]>("/api/activity-types")
      .then(setActivityTypes)
      .catch((e) => setError(e.message));
    const query = new URLSearchParams(window.location.search);
    if (query.has("project")) setProject(query.get("project") || "");
    if (query.get("new") === "session" && /^\d+$/.test(query.get("task") || "")) {
      void workRead<WorkTodo>(`/api/todos/${query.get("task")}`)
        .then((task) => {
          setInitialTask(task);
          setCreating(true);
        })
        .catch((e) => setError(e.message));
    }
  }, [setProject]);
  useEffect(() => {
    let active = true;
    setError("");
    const query = new URLSearchParams({
      ...range,
      layers: layers.join(","),
      activityType,
      project,
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
  }, [range, layers, activityType, project, history, page, refresh, timeZone]);
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
      setSavedDate(local.slice(0, 10));
      set("calendar_currentMonth", Number(local.slice(5, 7)));
      set("calendar_currentYear", Number(local.slice(0, 4)));
    },
    [set, setSavedDate, setView],
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
  const today = data ? localToday(new Date(), data.timeZone) : localToday(new Date(), timeZone),
    initialDate = `${get("calendar_currentYear", Number(today.slice(0, 4)))}-${String(get("calendar_currentMonth", Number(today.slice(5, 7)))).padStart(2, "0")}-01`;
  return (
    <div className="calendar-page min-w-0 space-y-5 pb-8 pt-12 md:pt-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
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
      <FilterPanel
        name="calendar"
        actions={
          <button
            type="button"
            className={button}
            onClick={() => {
              setLayers(defaultLayers);
              setActivityType("");
              setProject("");
              setHistory(false);
              setPage(1);
              window.history.replaceState(null, "", "/events");
            }}
          >
            Clear filters
          </button>
        }
      >
        <section
          aria-label="Calendar layers and activity type"
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
            <div className="w-full max-w-sm">
              <ProjectPicker
                label="Calendar project"
                value={project}
                onChange={(value) => {
                  setProject(value);
                  setPage(1);
                }}
              />
            </div>
            <label className="text-sm">
              Activity type
              <select
                aria-label="Calendar activity type"
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value);
                  setPage(1);
                }}
                className="ml-2 max-w-full rounded border border-card-border bg-card-bg p-2"
              >
                <option value="">All activity types</option>
                <option value="none">No activity type</option>
                {activityTypes.map((item) => (
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
              Show closed task/project date history
            </label>
            <button
              type="button"
              onClick={() => setRefresh((value) => value + 1)}
              className={button}
            >
              Refresh calendar
            </button>
          </div>
        </section>
      </FilterPanel>
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
                initialDate={savedDate || initialDate}
                initialView={view}
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
                  if (typeof href === "string" && /^\/(todos|events|projects)\//.test(href))
                    pageRouter("/events", href);
                }}
                eventContent={(info) => {
                  const style = calendarAppearance(info.event);
                  return (
                    <span
                      className="block min-w-0 max-w-full truncate text-xs"
                      ref={(node) => {
                        // FullCalendar list markers put their border color on
                        // the inner dot. Keep the outer accent in sync on edits.
                        node
                          ?.closest<HTMLElement>(".fc-event")
                          ?.style.setProperty("border-left-color", style.color, "important");
                      }}
                    >
                      {info.event.extendedProps.completed ? "✓ " : ""}
                      {style.historical ? "History · " : ""}
                      {style.symbol}{" "}
                      {view !== "dayGridMonth" && info.timeText ? `${info.timeText} · ` : ""}
                      {style.title}
                    </span>
                  );
                }}
                eventDidMount={(info) => {
                  const item = data.items.find((item) => item.id === info.event.id);
                  const style = calendarAppearance(info.event);
                  const label = `${style.label} · ${style.title}${item ? ` · ${calendarItemTiming(item, data.timeZone)}` : ""}`;
                  info.el.style.setProperty("border-left-color", style.color, "important");
                  info.el.title = label;
                  info.el.setAttribute("aria-label", label);
                }}
              />
            </div>
          )}
          <details className="space-y-3 rounded-xl border border-card-border bg-card-bg p-4">
            <summary className="cursor-pointer font-medium">
              Unscheduled events ({data?.tbdTotal ?? 0})
            </summary>
            <ul className="space-y-3">
              {data?.tbd.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.id}`}
                    className="block space-y-1 rounded-lg border border-card-border border-l-4 p-3 transition-colors hover:bg-white/5"
                    style={{ borderLeftColor: event.activityColor ?? "#3b82f6" }}
                  >
                    <span
                      className="flex items-center gap-2 text-xs"
                      style={{ color: event.activityColor ?? "#3b82f6" }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-current"
                        aria-hidden="true"
                      />
                      {event.activityLabel || event.type || "Event"}
                    </span>
                    <span
                      className={`block break-words text-sm font-medium ${event.completed ? "line-through opacity-60" : ""}`}
                    >
                      {event.completed ? "✓ " : ""}
                      {event.title}
                    </span>
                    <span className="block text-xs text-gray-500">{eventTiming(event)}</span>
                  </Link>
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
          </details>
        </div>
        <aside className="min-w-0 space-y-5">
          <CalendarAgenda
            items={data?.items ?? null}
            timeZone={data?.timeZone || timeZone}
            saving={saving}
            onToggleCompleted={async (item) => {
              setSaving(true);
              try {
                await writer.current(
                  `/api/events/${item.extendedProps.eventId}`,
                  "PATCH",
                  { completed: !item.extendedProps.completed },
                  item.extendedProps.revision,
                );
                setRefresh((value) => value + 1);
              } catch (error) {
                setError(error instanceof Error ? error.message : "Unable to save completion.");
              } finally {
                setSaving(false);
              }
            }}
          />
        </aside>
      </div>
      <TaskModal
        open={creating && !!data}
        title="New event or work session"
        busy={eventSaving}
        onClose={() =>
          eventEditor.current?.querySelector<HTMLButtonElement>("[data-event-cancel]")?.click()
        }
      >
        <div ref={eventEditor}>
          {creating && data ? (
            <EventForm
              key={initialTask?.id ?? "new"}
              embedded
              onBusyChange={setEventSaving}
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
        </div>
      </TaskModal>
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
