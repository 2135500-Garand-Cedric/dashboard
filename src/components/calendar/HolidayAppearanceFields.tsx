"use client";
import { HOLIDAY_DISPLAY_TYPES, type HolidayDisplayType } from "@/lib/holiday-types";
const input = "mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-3 text-sm";
export default function HolidayAppearanceFields({
  name,
  type,
  onName,
  onType,
  disabled = false,
}: {
  name: string;
  type: HolidayDisplayType;
  onName: (value: string) => void;
  onType: (value: HolidayDisplayType) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <label className="block min-w-0 text-sm">
        Display name
        <input
          aria-label="Holiday display name"
          required
          maxLength={500}
          value={name}
          onChange={(event) => onName(event.target.value)}
          className={input}
        />
      </label>
      <label className="block min-w-0 text-sm">
        Type
        <select
          aria-label="Holiday type"
          value={type}
          onChange={(event) => onType(event.target.value as HolidayDisplayType)}
          className={input}
        >
          {Object.entries(HOLIDAY_DISPLAY_TYPES).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
