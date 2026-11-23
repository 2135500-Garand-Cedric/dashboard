export const FREQUENCIES: string[];
export function dateInZone(now: Date, zone: string): string;
export function shiftDate(date: string, days: number): string;
export function occurrenceDates(
  anchor: string,
  frequency: string,
  from: string,
  through: string,
): string[];
export function snapshotTemplate(
  kind: string,
  row: object,
  zone: string,
): {
  anchor: string;
  timeZone: string;
  template: import("@/generated/prisma").Prisma.InputJsonObject;
};
export function seriesTiming(
  series: { kind: string; anchor: string; timeZone: string; template: object },
  date: string,
): Record<string, unknown>;

export function nextOccurrenceDates(
  anchor: string,
  frequency: string,
  from: string,
  count?: number,
): string[];
