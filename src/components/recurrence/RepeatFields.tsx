"use client";
const input = "mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2.5 text-sm";
export const repeatLabels: Record<string, string> = {
  DAILY: "Every day",
  WEEKLY: "Every week",
  MONTHLY: "Every month",
  YEARLY: "Every year",
};
export default function RepeatFields({
  frequency,
  until,
  onFrequency,
  onUntil,
  disabled = false,
  start,
}: {
  frequency: string;
  until: string;
  onFrequency: (value: string) => void;
  onUntil: (value: string) => void;
  disabled?: boolean;
  start?: string;
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        Repeat
        <select
          aria-label="Repeat"
          className={input}
          value={frequency}
          disabled={disabled}
          onChange={(event) => onFrequency(event.target.value)}
        >
          <option value="">Does not repeat</option>
          {Object.entries(repeatLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {frequency && (
        <label className="block text-sm">
          Repeat until
          <input
            aria-label="Repeat until"
            type="date"
            min={start?.slice(0, 10) || undefined}
            className={input}
            value={until}
            disabled={disabled}
            onChange={(event) => onUntil(event.target.value)}
          />
          <span className="mt-1 block text-xs text-muted">Leave empty to keep repeating.</span>
        </label>
      )}
      {(frequency === "MONTHLY" || frequency === "YEARLY") && (
        <p className="text-xs text-muted sm:col-span-2">
          Repeats on the same date. Months without that date are skipped; February 29 repeats in
          leap years.
        </p>
      )}
    </div>
  );
}
