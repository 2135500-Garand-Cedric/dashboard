// Keep the existing `date` field as the start for compatibility with saved events.
export function validateEventDates(date: unknown, endDate: unknown): string | null {
  const valid = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" && Number.isFinite(new Date(value).getTime());
  if (date != null && !valid(date)) return "Enter a valid start date and time.";
  if (endDate != null && !valid(endDate)) return "Enter a valid end date and time.";
  if (endDate != null && date == null) return "An end date and time requires a start.";
  if (typeof date === "string" && typeof endDate === "string" && new Date(endDate) <= new Date(date)) {
    return "The end must be after the start.";
  }
  return null;
}

export function toLocalDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatEventRange(date?: string | null, endDate?: string | null): string {
  if (!date) return "TBD";
  const format = (value: string) => new Date(value).toLocaleString([], {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return endDate ? `${format(date)} – ${format(endDate)}` : format(date);
}
