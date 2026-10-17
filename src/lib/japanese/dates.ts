export const JAPANESE_TIME_ZONE = "America/Toronto";

export function torontoDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAPANESE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function torontoMidnight(key: string): Date {
  const target = new Date(`${key}T00:00:00Z`).getTime();
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAPANESE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const wallTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    instant += target - wallTime;
  }
  return new Date(instant);
}

export function torontoDayRange(now = new Date()) {
  const day = torontoDateKey(now);
  return { start: torontoMidnight(day), end: torontoMidnight(shiftDateKey(day, 1)) };
}
