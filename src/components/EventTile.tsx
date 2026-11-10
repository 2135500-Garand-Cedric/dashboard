"use client";

import { useEffect, useState } from "react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { useMemory } from "@/context/MemoryContext";
import { localToday, localParts } from "@/lib/work-management/date-format";
import { eventTiming, type CalendarEvent } from "@/lib/work-management/calendar-types";

export default function EventDashboardTile() {
  const { pageRouter } = useMemory();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const loadEvents = async () => {
    const res = await fetch("/api/events");
    if (!res.ok) return;
    const data: CalendarEvent[] = await res.json();

    // Sort by date and filter out past events
    const now = new Date();
    const upcoming = data
      .filter(
        (e) =>
          !e.superseded &&
          (e.allDayStart
            ? !!e.allDayEnd && e.allDayEnd > localToday(now, e.appTimeZone || "America/Toronto")
            : e.date && new Date(e.endDate || e.date) >= now),
      )
      .sort((a, b) =>
        (a.allDayStart
          ? `${a.allDayStart}T00:00:00`
          : localParts(a.date!, a.appTimeZone || "America/Toronto")
        ).localeCompare(
          b.allDayStart
            ? `${b.allDayStart}T00:00:00`
            : localParts(b.date!, b.appTimeZone || "America/Toronto"),
        ),
      );

    setEvents(upcoming.slice(0, 3));
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const today = new Date();
  const day = today.getDate();
  const month = today.toLocaleString("default", { month: "long" });
  const weekday = today.toLocaleString("default", { weekday: "long" });

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow p-4 max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-lg font-semibold flex items-center gap-2"
          style={{ color: "var(--color-foreground)" }}
        >
          <CalendarDaysIcon className="w-5 h-5 text-[var(--color-accent)]" />
          Calendar
        </h2>

        {/* Date bubble */}
        <div className="text-center px-3 py-1 rounded-lg bg-[var(--hover-bg)] border border-[var(--card-border)]">
          <div className="text-xl font-bold text-[var(--color-foreground)]">{day}</div>
          <div className="text-xs text-gray-500 uppercase">{month.slice(0, 3)}</div>
          <div className="text-xs text-gray-400">{weekday}</div>
        </div>
      </div>

      {/* Events list */}
      {events.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming events.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => {
            const date = new Date(event.date || `${event.allDayStart}T12:00:00Z`);
            const time = event.allDayStart
              ? "All day"
              : date.toLocaleTimeString([], {
                  timeZone: event.timeZone || event.appTimeZone || "America/Toronto",
                  hour: "2-digit",
                  minute: "2-digit",
                });

            return (
              <li
                key={event.id}
                onClick={() => pageRouter("/", `/events/${event.id}`)}
                className="flex flex-col p-3 rounded hover:bg-[var(--hover-bg)] transition border border-[var(--card-border)] cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <h3
                    className={`font-medium text-[var(--color-foreground)] ${event.completed ? "line-through" : ""}`}
                  >
                    {event.completed && "✓ "}
                    {event.title}
                  </h3>
                  <span className="text-xs text-gray-500">{time}</span>
                </div>
                <span className="text-xs text-gray-400">{eventTiming(event)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
