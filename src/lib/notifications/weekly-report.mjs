import { DateTime } from "luxon";

// The report is available after Sunday ends. Notify on Monday at the user's
// configured all-day reminder time, without creating a task or calendar event.
export function weeklyReportSource(id, zone, now = new Date()) {
  if (!Number.isSafeInteger(id)) return null;
  const raw = String(id);
  if (!/^\d{8}$/.test(raw)) return null;
  const week = DateTime.fromFormat(raw, "yyyyMMdd", { zone });
  const localNow = DateTime.fromJSDate(now, { zone });
  if (!week.isValid || week.toFormat("yyyyMMdd") !== raw || week.weekday !== 1) return null;
  const available = week.plus({ weeks: 1 });
  if (available.startOf("day") > localNow) return null;
  const lastDay = week.plus({ days: 6 });
  return {
    kind: "WEEKLY_REPORT",
    id,
    title: `Weekly report · ${week.toFormat("MMM d")} – ${lastDay.toFormat("MMM d, yyyy")}`,
    label: "Weekly report ready",
    option: "weeklyReports",
    date: available.toISODate(),
    minutes: 0,
    url: `/weekly-report?week=${week.toISODate()}`,
    color: "#60a5fa",
  };
}

export function latestWeeklyReportSource(zone, now = new Date()) {
  const local = DateTime.fromJSDate(now, { zone });
  if (!local.isValid) return null;
  const previousMonday = local.startOf("week").minus({ weeks: 1 });
  return weeklyReportSource(Number(previousMonday.toFormat("yyyyMMdd")), zone, now);
}
