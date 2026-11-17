"use client";

import { useId } from "react";
import { repeatedTimeChoices } from "@/lib/local-time";

export default function RepeatedTimeChoice({
  local,
  timeZone,
  value,
  onChange,
  disabled = false,
  label = "Which occurrence?",
  ariaLabel = "Repeated time occurrence",
  className = "",
}: {
  local: string;
  timeZone: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const descriptionId = useId();
  const repeated = repeatedTimeChoices(local, timeZone);
  if (!repeated) return null;
  const gap = repeated.minutesApart === 60 ? "1 hour" : `${repeated.minutesApart} minutes`;
  return (
    <div className="min-w-0 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p id={descriptionId} className="text-sm leading-6">
        This time happens twice because the clocks move back. <strong>Earlier</strong> is the first
        occurrence, before the change. <strong>Later</strong> is the second occurrence, after the
        change—{gap} later in real time.
      </p>
      <label className="block space-y-1 text-sm">
        <span>{label}</span>
        <select
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          required
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2 text-sm ${className}`}
        >
          <option value="">Choose first or second occurrence</option>
          {repeated.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
