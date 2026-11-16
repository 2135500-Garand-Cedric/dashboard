import type { CalendarEvent } from "./calendar-types";

type EventTiming = Pick<CalendarEvent, "date" | "endDate" | "allDayStart" | "allDayEnd">;

// Display-only formatting. All-day bounds are calendar dates with an exclusive
// end; timed values remain UTC instants and use the owner's display timezone.
export function writtenEventDate(value: string, timeZone: string, allDay = false) {
  const date = new Date(allDay ? `${value}T12:00:00Z` : value);
  const zone = allDay ? "UTC" : timeZone;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  if (allDay) return day;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const minutes = part("minute");
  return `${part("hour")}${minutes === "00" ? "" : `:${minutes}`}${part("dayPeriod").toLowerCase()}, ${day}`;
}

export function eventDateDisplay(event: EventTiming, timeZone: string) {
  const allDay = !!event.allDayStart;
  const start = event.allDayStart || event.date;
  const end =
    allDay && event.allDayEnd
      ? new Date(Date.parse(`${event.allDayEnd}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
      : event.endDate;
  const weekday = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: allDay ? "UTC" : timeZone,
      weekday: "long",
    }).format(new Date(allDay ? `${value}T12:00:00Z` : value));
  let duration = "";
  if (allDay && start && end) {
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    if (days > 1) duration = `${days} days`;
  } else if (event.date && event.endDate) {
    const minutes = Math.round((Date.parse(event.endDate) - Date.parse(event.date)) / 60000);
    if (minutes > 0) {
      const hours = Math.floor(minutes / 60),
        remainder = minutes % 60;
      duration = [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""]
        .filter(Boolean)
        .join(" ");
    }
  }
  return {
    allDay,
    start: start ? writtenEventDate(start, timeZone, allDay) : "Date to be decided",
    end: end && (!allDay || end !== start) ? writtenEventDate(end, timeZone, allDay) : null,
    startDay: start ? weekday(start) : null,
    endDay: end ? weekday(end) : null,
    duration,
  };
}
