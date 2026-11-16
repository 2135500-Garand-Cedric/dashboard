export type StoredWorkDate = {
  date: string | null;
  at: Date | string | null;
  timeZone: string | null;
};
export function localParts(value: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
export function localToday(now: Date, timeZone: string): string {
  return localParts(now, timeZone).slice(0, 10);
}
export function describeWorkDate(
  value: StoredWorkDate,
  timeZone = value.timeZone || "UTC",
): string {
  return value.date
    ? `${value.date} · date only`
    : value.at
      ? localParts(value.at, timeZone).replace("T", " ")
      : "None";
}
