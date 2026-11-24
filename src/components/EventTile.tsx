"use client";
import { useSettings } from "@/context/SettingsContext";
import { useEffect, useState } from "react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useMemory } from "@/context/MemoryContext";
import { localToday, localParts } from "@/lib/work-management/date-format";
import { eventTiming, type CalendarEvent } from "@/lib/work-management/calendar-types";
export default function EventDashboardTile({ refreshToken = 0 }: { refreshToken?: number }) {
  const { timeZone: selectedZone } = useSettings();
  const { pageRouter } = useMemory();
  const [events, setEvents] = useState<CalendarEvent[]>([]),
    [zone, setZone] = useState(selectedZone),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const response = await fetch("/api/events", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load events.");
        const values = data as CalendarEvent[],
          timeZone =
            response.headers.get("X-App-Time-Zone") || values[0]?.appTimeZone || selectedZone,
          now = new Date();
        const upcoming = values
          .filter(
            (event) =>
              !event.superseded &&
              (event.allDayStart
                ? !!event.allDayEnd && event.allDayEnd > localToday(now, timeZone)
                : event.date && new Date(event.endDate || event.date) >= now),
          )
          .sort((a, b) =>
            (a.allDayStart
              ? `${a.allDayStart}T00:00:00`
              : localParts(a.date!, timeZone)
            ).localeCompare(
              b.allDayStart ? `${b.allDayStart}T00:00:00` : localParts(b.date!, timeZone),
            ),
          );
        if (active) {
          setZone(timeZone);
          setEvents(upcoming.slice(0, 3));
        }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "Unable to load events.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((value) => value + 1);
    }, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh, refreshToken, selectedZone]);
  const now = new Date(),
    date = localToday(now, zone),
    month = new Intl.DateTimeFormat("en", { month: "short", timeZone: zone }).format(now),
    weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: zone }).format(now);
  return (
    <div className="max-w-md rounded-xl border border-card-border bg-card-bg p-4 shadow">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDaysIcon className="h-5 w-5" />
          Calendar
        </h2>
        <div className="text-center text-xs text-gray-500">
          <strong className="block text-xl text-foreground">{date.slice(-2)}</strong>
          {month} · {weekday}
        </div>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-rose-500">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            className="underline"
          >
            Retry events
          </button>
        </p>
      ) : loading ? (
        <p role="status">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming events.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => pageRouter("/", `/events/${event.id}`)}
                className="w-full min-w-0 space-y-1 rounded border border-card-border p-3 text-left hover:bg-blue-500/5"
              >
                <p className="text-xs text-gray-500">
                  {event.kind === "WORK_SESSION"
                    ? "Work session"
                    : event.kind === "INFORMATIONAL"
                      ? "Information"
                      : "Event"}
                </p>
                <h3 className={`break-words font-medium ${event.completed ? "line-through" : ""}`}>
                  {event.completed ? "✓ " : ""}
                  {event.title}
                </h3>
                <p className="break-words text-xs text-gray-500">{eventTiming(event)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
