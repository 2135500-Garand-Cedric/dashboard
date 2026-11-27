export function logDateDefaults(zone: string): { from: string; to: string };
export function logDateRange(
  from: string,
  to: string,
  zone: string,
): { gte: Date; lt: Date } | null;
