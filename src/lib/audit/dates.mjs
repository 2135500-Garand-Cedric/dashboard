import { DateTime } from "luxon";

export function logDateDefaults(zone) {
  const today = DateTime.now().setZone(zone);
  return { from: today.minus({ days: 29 }).toISODate(), to: today.toISODate() };
}
export function logDateRange(from, to, zone) {
  const start = DateTime.fromISO(from, { zone });
  const end = DateTime.fromISO(to, { zone });
  if (
    ![from, to].every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)) ||
    !start.isValid ||
    !end.isValid ||
    from > to ||
    end.diff(start, "days").days > 3660
  ) {
    return null;
  }
  return {
    gte: start.startOf("day").toJSDate(),
    lt: end.plus({ days: 1 }).startOf("day").toJSDate(),
  };
}
