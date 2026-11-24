// Calendar-day arithmetic, independent of elapsed UTC hours and browser timezone.
export function shiftDay(day: string, days: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function monday(day: string) {
  return shiftDay(day, -(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7);
}
