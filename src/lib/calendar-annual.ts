export function compareNextDate(
  a: { nextDate: string | null; name: string; id: number },
  b: { nextDate: string | null; name: string; id: number },
) {
  return (
    (a.nextDate || "9999-12-31").localeCompare(b.nextDate || "9999-12-31") ||
    a.name.localeCompare(b.name) ||
    a.id - b.id
  );
}
export function birthdayDate(month: number, day: number, year: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function nextBirthdayDate(month: number, day: number, today: string) {
  const year = Number(today.slice(0, 4));
  const date = birthdayDate(month, day, year);
  return date >= today ? date : birthdayDate(month, day, year + 1);
}
export function occasionHref(kind: string, id: number, date: string) {
  return `/events/${kind === "holiday" ? "holidays" : "birthdays"}/${id}?date=${encodeURIComponent(date)}`;
}
export type OccasionKind = "holiday" | "birthday";
export type OccasionTarget = { kind: OccasionKind; id: number; date: string };
export type OccasionLink = OccasionTarget & { title: string; href: string };
export type OccasionDetails = OccasionTarget & {
  title: string;
  type: string;
  color: string;
  sourceName?: string;
  tasks: {
    id: number;
    title: string;
    status: import("./work-management/types").WorkStatus;
    reference: string;
  }[];
};
