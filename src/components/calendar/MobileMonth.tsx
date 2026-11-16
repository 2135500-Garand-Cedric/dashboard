"use client";

import { useState } from "react";
import type { CalendarItem } from "@/lib/work-management/calendar-types";
import { calendarAppearance, calendarItemsOnDay } from "@/lib/work-management/calendar-display";
import CalendarAgenda from "./CalendarAgenda";

export default function MobileMonth({
  month,
  today,
  items,
  timeZone,
  saving,
  onToggleCompleted,
}: {
  month: string;
  today: string;
  items: CalendarItem[];
  timeZone: string;
  saving: boolean;
  onToggleCompleted: (item: CalendarItem) => Promise<void>;
}) {
  const [selection, setSelection] = useState(today);
  const prefix = month.slice(0, 7);
  const selectedDay = selection.startsWith(prefix)
    ? selection
    : today.startsWith(prefix)
      ? today
      : `${prefix}-01`;
  const first = new Date(`${prefix}-01T12:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const cellCount = Math.ceil((offset + days) / 7) * 7;
  return (
    <div className="space-y-4 md:hidden" data-mobile-month>
      <section aria-label="Month days" className="border-b border-card-border pb-3">
        <div className="grid grid-cols-7 text-center text-xs text-gray-500 dark:text-gray-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day} className="py-2">
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: cellCount }, (_, index) => {
            const number = index - offset + 1;
            if (number < 1 || number > days) return <div key={index} aria-hidden="true" />;
            const day = `${prefix}-${String(number).padStart(2, "0")}`;
            const entries = calendarItemsOnDay(items, day, timeZone);
            const selected = day === selectedDay;
            const label = new Intl.DateTimeFormat("en", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${day}T12:00:00Z`));
            return (
              <button
                key={day}
                type="button"
                aria-label={`${label}, ${entries.length} ${entries.length === 1 ? "event" : "events"}`}
                aria-pressed={selected}
                aria-current={day === today ? "date" : undefined}
                onClick={() => setSelection(day)}
                className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${selected ? "bg-blue-600 text-white" : day === today ? "text-blue-600 dark:text-blue-400" : ""}`}
                >
                  {number}
                </span>
                <span className="flex h-2 items-center justify-center gap-0.5" aria-hidden="true">
                  {entries.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: calendarAppearance(item).color }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <CalendarAgenda
        items={items}
        timeZone={timeZone}
        selectedDay={selectedDay}
        saving={saving}
        onToggleCompleted={onToggleCompleted}
      />
    </div>
  );
}
