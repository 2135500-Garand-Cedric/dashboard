import type { Prisma } from "@/generated/prisma";
import { dayStart, nextCalendarDate, calendarDate } from "./dates";
export const PLANNING_SECTIONS = [
  "new",
  "focus",
  "overdue",
  "upcoming",
  "followups",
  "waiting",
  "blocked",
  "urgent",
  "undated",
  "backlog",
] as const;
export type PlanningSection = (typeof PLANNING_SECTIONS)[number];
export function planningWindow(day: string, zone: string) {
  calendarDate(day);
  let through = day;
  for (let i = 0; i < 7; i++) through = nextCalendarDate(through);
  return {
    start: dayStart(day, zone),
    end: dayStart(nextCalendarDate(day), zone),
    through,
    upcomingEnd: dayStart(through, zone),
  };
}
export function planningWhere(
  section: PlanningSection,
  day: string,
  zone: string,
  now: Date,
  owner: number,
): Prisma.TodoWhereInput {
  const window = planningWindow(day, zone);
  switch (section) {
    case "new":
      return { status: "NEW" };
    case "focus":
      return { focusRecords: { some: { userId: owner, date: day, active: true } } };
    case "overdue":
      return { OR: [{ deadlineDate: { lt: day } }, { deadlineAt: { lt: now } }] };
    case "upcoming":
      return {
        OR: [
          { deadlineDate: { gte: day, lt: window.through } },
          { deadlineAt: { gte: now, lt: window.upcomingEnd } },
        ],
      };
    case "followups":
      return {
        followUps: {
          some: { status: "ACTIVE", OR: [{ date: { lte: day } }, { at: { lte: now } }] },
        },
      };
    case "waiting":
      return { status: "WAITING" };
    case "blocked":
      return {
        prerequisites: {
          some: {
            OR: [
              { legacyReviewReason: { not: null } },
              { prerequisite: { userId: { not: owner } } },
              { prerequisite: { status: { not: "DONE" } } },
            ],
          },
        },
      };
    case "urgent":
      return { priorityLevel: "URGENT" };
    case "undated":
      return { deadlineDate: null, deadlineAt: null };
    case "backlog":
      return { status: "BACKLOG" };
  }
}
