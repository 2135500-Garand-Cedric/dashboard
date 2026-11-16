import type { GraphTaskStub } from "./types";
import { describeWorkDate } from "./date-format";
export interface CalendarEvent {
  id: number;
  revision: number;
  title: string;
  description: string | null;
  type: string | null;
  activityLabel?: string | null;
  activityColor?: string;
  date: string | null;
  endDate: string | null;
  completed: boolean;
  kind: string;
  busy: boolean | null;
  timeZone: string | null;
  allDayStart: string | null;
  allDayEnd: string | null;
  appTimeZone: string;
  taskLinks: {
    todoId: number;
    role: string;
    task: GraphTaskStub;
    contextId: number | null;
    reviewReason?: string | null;
  }[];
  linkedTodo?: GraphTaskStub | null;
  superseded: boolean;
  conversion: {
    id: number;
    mode: string;
    todoId: number;
    deadlineChanged: boolean;
    active: boolean;
  } | null;
}
export function eventTiming(event: CalendarEvent): string {
  if (event.allDayStart)
    return `${event.allDayStart} through ${new Date(Date.parse(`${event.allDayEnd}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)} · all day`;
  if (!event.date) return "TBD";
  const format = (value: string) =>
    describeWorkDate({
      date: null,
      at: value,
      timeZone: event.appTimeZone || event.timeZone || "UTC",
    });
  return `${format(event.date)}${event.endDate ? ` → ${format(event.endDate)}` : ""}`;
}
export interface CalendarFeed {
  items: {
    id: string;
    title: string;
    start: string;
    end?: string;
    allDay: boolean;
    editable?: boolean;
    display?: string;
    classNames?: string[];
    backgroundColor?: string;
    borderColor?: string;
    extendedProps: {
      layer: string;
      plainTitle?: string;
      activityType?: string | null;
      kind?: string;
      href: string;
      eventId?: number;
      revision?: number;
      completed?: boolean;
      marker?: boolean;
      actionable?: boolean;
      busy?: boolean;
    };
  }[];
  timeZone: string;
  tbd: CalendarEvent[];
  tbdTotal: number;
  tbdPage: number;
  tbdPageSize: number;
}

export type CalendarItem = CalendarFeed["items"][number];
