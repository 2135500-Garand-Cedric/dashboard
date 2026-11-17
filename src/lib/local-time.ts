import { localParts } from "./work-management/date-format";

export function repeatedTimeChoices(local: string, timeZone: string) {
  try {
    const instants = resolveLocalInstants(local, timeZone);
    if (instants.length < 2) return null;
    const first = instants[0],
      last = instants[instants.length - 1];
    const format = new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "longOffset",
    });
    return {
      minutesApart: (last.getTime() - first.getTime()) / 60000,
      choices: [
        { value: "earlier", label: `Earlier — ${format.format(first)}` },
        { value: "later", label: `Later — ${format.format(last)}` },
      ],
    };
  } catch {
    return null;
  }
}

// Resolve wall time against actual offsets instead of the browser's timezone.
export function resolveLocalInstants(local: string, timeZone: string): Date[] {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(local))
    throw new Error("Enter a valid date and time.");
  const normalized = local.length === 16 ? `${local}:00` : local;
  const naive = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(naive)) throw new Error("Enter a valid date and time.");
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = new Date(naive + hours * 3600000);
    offsets.add(Date.parse(`${localParts(sample, timeZone)}Z`) - sample.getTime());
  }
  return [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((value) => localParts(value, timeZone) === normalized)
    .sort((a, b) => a.getTime() - b.getTime());
}
