"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CalendarItem } from "@/lib/work-management/calendar-types";
import {
  calendarAppearance,
  calendarItemTiming,
  upcomingCalendarItems,
  calendarItemsOnDay,
} from "@/lib/work-management/calendar-display";

export default function CalendarAgenda({
  items,
  timeZone,
  saving,
  onToggleCompleted,
  selectedDay,
}: {
  items: CalendarItem[] | null;
  timeZone: string;
  saving: boolean;
  onToggleCompleted: (item: CalendarItem) => Promise<void>;
  selectedDay?: string;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const upcoming = items
    ? selectedDay
      ? calendarItemsOnDay(items, selectedDay, timeZone)
      : upcomingCalendarItems(items, now, timeZone)
    : [];
  const dayLabel = selectedDay
    ? new Intl.DateTimeFormat("en", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${selectedDay}T12:00:00Z`))
    : "";
  return (
    <section
      aria-label={selectedDay ? "Selected day events" : "Upcoming calendar items"}
      className="space-y-4 rounded-xl border border-card-border bg-card-bg p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{selectedDay ? dayLabel : "Upcoming in this range"}</h2>
        {items && (
          <span className="rounded-full border border-card-border px-2 py-0.5 text-xs">
            {upcoming.length}
          </span>
        )}
      </header>
      {!items ? (
        <p role="status" className="text-sm">
          Loading upcoming items…
        </p>
      ) : !upcoming.length ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {selectedDay
            ? "No events for this day."
            : "No upcoming items match the current range and filters."}
        </p>
      ) : (
        <ul className="space-y-3 xl:max-h-[min(70dvh,48rem)] xl:overflow-y-auto xl:overscroll-contain">
          {upcoming.map((item) => {
            const style = calendarAppearance(item);
            return (
              <li
                key={item.id}
                data-calendar-item={item.id}
                className="min-w-0 rounded-xl border border-card-border border-l-4 p-3"
                style={{ borderLeftColor: style.color, backgroundColor: `${style.color}0c` }}
              >
                <Link
                  href={item.extendedProps.href}
                  className="group block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
                      style={{
                        borderColor: `${style.color}70`,
                        backgroundColor: `${style.color}18`,
                      }}
                    >
                      <span aria-hidden="true" style={{ color: style.color }}>
                        {style.symbol}
                      </span>
                      {style.label}
                    </span>
                    {style.activityType && style.activityType !== style.label && (
                      <span className="text-gray-500 dark:text-gray-400">{style.activityType}</span>
                    )}
                    {style.historical && (
                      <span className="text-gray-500 dark:text-gray-400">History</span>
                    )}
                    {item.extendedProps.completed && (
                      <span className="text-emerald-600 dark:text-emerald-400">✓ Completed</span>
                    )}
                  </div>
                  <p
                    className={`break-words text-sm font-medium group-hover:underline ${item.extendedProps.completed ? "line-through opacity-70" : ""}`}
                  >
                    {style.title}
                  </p>
                  <p className="mt-2 break-words text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {calendarItemTiming(item, timeZone)}
                  </p>
                </Link>
                {item.extendedProps.eventId && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onToggleCompleted(item)}
                    className="mt-3 rounded-lg border border-card-border px-2.5 py-1.5 text-xs disabled:opacity-50"
                  >
                    {item.extendedProps.completed ? "Mark incomplete" : "Mark completed"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
