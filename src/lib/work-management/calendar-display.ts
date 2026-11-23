import type { CalendarItem } from "./calendar-types";
import { localParts, localToday } from "./date-format";
import { writtenEventDate } from "./event-display";

const layers: Record<string, { label: string; symbol: string; color: string }> = {
  birthdays: { label: "Birthday", symbol: "✧", color: "#db2777" },
  holidays: { label: "Holiday", symbol: "✦", color: "#0d9488" },
  events: { label: "Event", symbol: "○", color: "#3b82f6" },
  sessions: { label: "Work session", symbol: "▣", color: "#8b5cf6" },
  deadlines: { label: "Deadline", symbol: "⚑", color: "#f43f5e" },
  followups: { label: "Follow-up", symbol: "↻", color: "#f59e0b" },
  milestones: { label: "Milestone", symbol: "◇", color: "#38bdf8" },
};

type DisplayItem = Pick<
  CalendarItem,
  "title" | "borderColor" | "backgroundColor" | "classNames"
> & {
  extendedProps: {
    layer?: string;
    kind?: string;
    activityType?: string | null;
    plainTitle?: string;
  };
};
export function calendarAppearance(item: DisplayItem) {
  const layer = layers[item.extendedProps.layer || "events"] || layers.events;
  const info = item.extendedProps.kind === "INFORMATIONAL";
  const target = item.extendedProps.kind === "PROJECT_TARGET";
  const holidayLabel =
    item.extendedProps.kind === "HOLIDAY" &&
    ["Holiday", "Bank holiday", "Important date"].includes(item.extendedProps.activityType || "")
      ? item.extendedProps.activityType
      : null;
  // Use the feed's actual color, including customized activity-label colors,
  // rather than assigning a second, conflicting palette to the agenda.
  const candidate = item.borderColor || item.backgroundColor;
  return {
    ...layer,
    label: holidayLabel || (target ? "Project target" : info ? "Information" : layer.label),
    symbol: target ? "◎" : info ? "ⓘ" : layer.symbol,
    color: candidate && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : layer.color,
    title: item.extendedProps.plainTitle || item.title,
    activityType: item.extendedProps.activityType,
    historical: item.classNames?.includes("calendar-historical") ?? false,
  };
}

export function upcomingCalendarItems(items: CalendarItem[], now: Date, timeZone: string) {
  const today = localToday(now, timeZone);
  return items
    .filter((item) =>
      item.allDay
        ? // Date-only deadlines and follow-ups are still upcoming throughout today.
          item.start.slice(0, 10) >= today
        : Number.isFinite(Date.parse(item.start)) && Date.parse(item.start) > now.getTime(),
    )
    .map((item) => ({
      item,
      day: item.allDay ? item.start.slice(0, 10) : localParts(item.start, timeZone).slice(0, 10),
    }))
    .sort((a, b) => {
      const byDay = a.day.localeCompare(b.day);
      if (byDay) return byDay;
      if (a.item.allDay !== b.item.allDay) return a.item.allDay ? -1 : 1;
      return (
        (a.item.allDay ? 0 : Date.parse(a.item.start) - Date.parse(b.item.start)) ||
        a.item.id.localeCompare(b.item.id)
      );
    })
    .map(({ item }) => item);
}

export function calendarItemTiming(item: CalendarItem, timeZone: string) {
  const start = writtenEventDate(item.start, timeZone, item.allDay);
  const dateLabel = item.extendedProps.marker ? "Date only" : "All day";
  if (!item.end) return item.allDay ? `${start} · ${dateLabel}` : start;
  if (item.allDay) {
    const last = new Date(Date.parse(`${item.end.slice(0, 10)}T12:00:00Z`) - 86400000)
      .toISOString()
      .slice(0, 10);
    return `${start}${last === item.start ? "" : ` – ${writtenEventDate(last, timeZone, true)}`} · ${dateLabel}`;
  }
  return `${start} → ${writtenEventDate(item.end, timeZone)}`;
}

export function calendarItemsOnDay(items: CalendarItem[], day: string, timeZone: string) {
  return items
    .filter((item) => {
      if (item.allDay) {
        return (
          item.start.slice(0, 10) <= day &&
          (item.end ? item.end.slice(0, 10) > day : item.start.slice(0, 10) === day)
        );
      }
      const start = Date.parse(item.start);
      if (!Number.isFinite(start)) return false;
      const end = item.end ? Date.parse(item.end) : start;
      const lastInstant = Number.isFinite(end) && end > start ? end - 1 : start;
      return (
        localToday(new Date(start), timeZone) <= day &&
        localToday(new Date(lastInstant), timeZone) >= day
      );
    })
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        (a.allDay ? a.start.localeCompare(b.start) : Date.parse(a.start) - Date.parse(b.start)) ||
        a.id.localeCompare(b.id),
    );
}
