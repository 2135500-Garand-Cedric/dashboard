import { DateTime } from "luxon";

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
export function dateInZone(now, zone) {
  return DateTime.fromJSDate(new Date(now), { zone }).toISODate();
}
export function shiftDate(date, days) {
  return DateTime.fromISO(date, { zone: "UTC" }).plus({ days }).toISODate();
}

// Advance from the original anchor, never from a clamped previous month.
// Missing month days (including February 29) are skipped, not silently moved.
export function occurrenceDates(anchor, frequency, from, through) {
  const base = DateTime.fromISO(anchor.slice(0, 10), { zone: "UTC" });
  const end = DateTime.fromISO(through, { zone: "UTC" });
  const start = DateTime.fromISO(from, { zone: "UTC" });
  if (!base.isValid || !start.isValid || !end.isValid || !FREQUENCIES.includes(frequency))
    throw new Error("Invalid recurrence dates or frequency.");
  if (end.diff(start, "days").days > 3660)
    throw new Error("A repeating schedule can be generated at most ten years at a time.");
  const result = [];
  for (let day = start < base ? base : start; day <= end; day = day.plus({ days: 1 })) {
    const days = Math.round(day.diff(base, "days").days);
    if (
      frequency === "DAILY" ||
      (frequency === "WEEKLY" && days % 7 === 0) ||
      (frequency === "MONTHLY" && day.day === base.day) ||
      (frequency === "YEARLY" && day.month === base.month && day.day === base.day)
    )
      result.push(day.toISODate());
  }
  return result;
}

export function seriesTiming(series, date) {
  const template = series.template;
  if (series.anchor.length === 10) {
    return series.kind === "TASK"
      ? { deadlineDate: date, deadlineAt: null, deadlineTimeZone: null }
      : {
          allDayStart: date,
          allDayEnd: shiftDate(date, template.spanDays),
          date: null,
          endDate: null,
          timeZone: null,
        };
  }
  // Luxon shifts nonexistent spring times forward. Ambiguous fall times use the
  // series' explicit earlier/later choice. The local hour stays fixed otherwise.
  let start = DateTime.fromISO(`${date}T${series.anchor.slice(11)}`, { zone: series.timeZone });
  const options = start.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
  start = options[template.occurrence === "later" ? options.length - 1 : 0];
  if (!start?.isValid) throw new Error("Unable to resolve the repeating local time.");
  return series.kind === "TASK"
    ? { deadlineDate: null, deadlineAt: start.toJSDate(), deadlineTimeZone: series.timeZone }
    : {
        date: start.toJSDate(),
        endDate:
          template.durationMs == null ? null : new Date(start.toMillis() + template.durationMs),
        timeZone: series.timeZone,
        allDayStart: null,
        allDayEnd: null,
      };
}

export function snapshotTemplate(kind, row, zone) {
  const task = kind === "TASK";
  const at = task ? row.deadlineAt : row.date;
  const date = task ? row.deadlineDate : row.allDayStart;
  if (!at && !date)
    throw new Error(
      task
        ? "Set the first task deadline before enabling repeat."
        : "Set the event date before enabling repeat.",
    );
  const timeZone = (task ? row.deadlineTimeZone : row.timeZone) || zone;
  const local = at ? DateTime.fromJSDate(new Date(at), { zone: timeZone }) : null;
  const anchor = local ? local.toFormat("yyyy-MM-dd'T'HH:mm:ss") : date;
  const possible = local?.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis()) || [];
  const fields = task
    ? [
        "title",
        "description",
        "priorityLevel",
        "kind",
        "activityTypeId",
        "projectId",
        "stageId",
        "requesterId",
        "desiredOutcome",
        "nextAction",
        "system",
      ]
    : ["title", "description", "type", "kind", "reminderMinutes"];
  const data = Object.fromEntries(fields.map((key) => [key, row[key] ?? null]));
  return {
    anchor,
    timeZone,
    template: {
      data,
      occurrence:
        possible.length > 1 && possible.at(-1).toMillis() === local.toMillis()
          ? "later"
          : "earlier",
      ...(task
        ? {
            checklist: (row.subtasks || []).map((item) => item.title),
            contacts: (row.affectedPeople || []).map((item) => item.contactId),
          }
        : {
            durationMs: row.endDate
              ? new Date(row.endDate).getTime() - new Date(row.date).getTime()
              : null,
            spanDays: date
              ? Math.round(
                  DateTime.fromISO(row.allDayEnd).diff(DateTime.fromISO(date), "days").days,
                )
              : null,
            links: (row.taskLinks || []).map(({ todoId, role }) => ({ todoId, role })),
          }),
    },
  };
}

// Find a small lookahead without scanning every day between yearly occurrences.
export function nextOccurrenceDates(anchor, frequency, from, count = 4) {
  const base = DateTime.fromISO(anchor.slice(0, 10), { zone: "UTC" });
  const start = DateTime.fromISO(from, { zone: "UTC" });
  if (!base.isValid || !start.isValid || !FREQUENCIES.includes(frequency))
    throw new Error("Invalid recurrence dates or frequency.");
  const unit = { DAILY: "days", WEEKLY: "weeks", MONTHLY: "months", YEARLY: "years" }[frequency];
  let index = Math.max(0, Math.floor(start.diff(base, unit).as(unit)));
  const result = [];
  for (let attempts = 0; result.length < count && attempts < count * 5 + 20; attempts++, index++) {
    const candidate = base.plus({ [unit]: index });
    if (!candidate.isValid || candidate.year > 9999) break;
    if ((frequency === "MONTHLY" || frequency === "YEARLY") && candidate.day !== base.day) continue;
    if (candidate >= start) result.push(candidate.toISODate());
  }
  return result;
}
