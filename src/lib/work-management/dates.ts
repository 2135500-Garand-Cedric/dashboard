import { WorkValidationError, workBody } from "./validation";
import { localParts, localToday, type StoredWorkDate } from "./date-format";
export { localParts, localToday, describeWorkDate, type StoredWorkDate } from "./date-format";
export const emptyWorkDate = (): StoredWorkDate => ({ date: null, at: null, timeZone: null });
export function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d\d-\d\d$/.test(value))
    throw new WorkValidationError("Enter a calendar date as YYYY-MM-DD (years 1000–9999).");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new WorkValidationError("Enter a valid calendar date.");
  return value;
}
export function validTimeZone(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 100)
    throw new WorkValidationError("Enter a valid IANA time zone.");
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new WorkValidationError("Choose a valid timezone in Settings.");
  }
}
// Resolve wall time using the zone's actual offsets around the entered date.
// Round-trip every candidate: gaps have none; folds have two and require a choice.
export function localInstants(local: string, timeZone: string): Date[] {
  if (!/^[1-9]\d{3}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(local))
    throw new WorkValidationError("Enter a valid local date and time.");
  calendarDate(local.slice(0, 10));
  const normalized = local.length === 16 ? `${local}:00` : local,
    naive = Date.parse(`${normalized}Z`),
    offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = new Date(naive + hours * 3600000);
    offsets.add(Date.parse(`${localParts(sample, timeZone)}Z`) - sample.getTime());
  }
  return [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((date) => localParts(date, timeZone) === normalized)
    .sort((a, b) => a.getTime() - b.getTime());
}
export function parseWorkDate(
  value: unknown,
  defaultZone: string,
  nullable = false,
): StoredWorkDate {
  if (value === null && nullable) return emptyWorkDate();
  const body = workBody(value, ["kind", "date", "local", "timeZone", "occurrence"]);
  if (body.kind === "DATE") {
    if (body.local !== undefined || body.timeZone !== undefined || body.occurrence !== undefined)
      throw new WorkValidationError("A date-only value cannot also have a time or time zone.");
    return { date: calendarDate(body.date), at: null, timeZone: null };
  }
  if (body.kind !== "TIME" || body.date !== undefined || typeof body.local !== "string")
    throw new WorkValidationError("Choose either a calendar date or an exact time.");
  if (body.occurrence !== undefined && !["earlier", "later"].includes(String(body.occurrence)))
    throw new WorkValidationError("Choose the earlier or later occurrence of a repeated time.");
  const timeZone = validTimeZone(body.timeZone ?? defaultZone),
    candidates = localInstants(body.local, timeZone);
  if (!candidates.length)
    throw new WorkValidationError(
      "This local time does not exist because the clock moves forward. Choose another time.",
    );
  if (candidates.length > 1 && body.occurrence === undefined)
    throw new WorkValidationError(
      "This local time occurs twice when the clock moves back. Explicitly choose the earlier or later occurrence.",
    );
  return {
    date: null,
    at: candidates[body.occurrence === "later" ? candidates.length - 1 : 0],
    timeZone,
  };
}
export function workDateState(
  value: StoredWorkDate,
  kind: "deadline" | "followup",
  now: Date,
  zone: string,
  actionable = true,
): "OVERDUE" | "DUE" | "UPCOMING" | null {
  if (!actionable || (!value.date && !value.at)) return null;
  if (value.date)
    return value.date < localToday(now, zone)
      ? kind === "deadline"
        ? "OVERDUE"
        : "DUE"
      : value.date === localToday(now, zone) && kind === "followup"
        ? "DUE"
        : "UPCOMING";
  return new Date(value.at!).getTime() < now.getTime() ||
    (kind === "followup" && new Date(value.at!).getTime() === now.getTime())
    ? kind === "deadline"
      ? "OVERDUE"
      : "DUE"
    : "UPCOMING";
}
export function nextCalendarDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
// Filter/sort boundaries may advance over a midnight gap; user-entered times never do.
export function dayStart(date: string, zone: string): Date {
  for (let minute = 0; minute < 2880; minute++) {
    const wall = new Date(Date.parse(`${date}T00:00:00Z`) + minute * 60000)
      .toISOString()
      .slice(0, 19);
    const matches = localInstants(wall, zone);
    if (matches.length) return matches[0];
  }
  throw new WorkValidationError(
    "Unable to resolve this calendar boundary in the configured time zone.",
  );
}
export function dateSortInstant(
  value: StoredWorkDate,
  kind: "deadline" | "followup",
  zone: string,
): number {
  return value.at
    ? new Date(value.at).getTime()
    : value.date
      ? dayStart(kind === "deadline" ? nextCalendarDate(value.date) : value.date, zone).getTime() -
        (kind === "deadline" ? 1 : 0)
      : Infinity;
}
