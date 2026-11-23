export type HolidayType = "public" | "bank" | "optional" | "observance";
export type HolidayOption = {
  key: string;
  country: string;
  state: string;
  region: string;
  location: string;
  name: string;
  type: HolidayType;
};
export const HOLIDAY_DISPLAY_TYPES = {
  holiday: { label: "Holiday", color: "#0d9488" },
  bank: { label: "Bank holiday", color: "#d97706" },
  important: { label: "Important date", color: "#2563eb" },
} as const;
export type HolidayDisplayType = keyof typeof HOLIDAY_DISPLAY_TYPES;
export function holidayDisplayType(value: string): HolidayDisplayType {
  return value === "bank" || value === "important" ? value : "holiday";
}
export type SelectedHoliday = Omit<HolidayOption, "type"> & {
  type: HolidayDisplayType;
  sourceName: string;
  id: number;
  countryName: string;
  nextDate: string | null;
};
export type HolidayOverview = {
  countries: { code: string; name: string }[];
  choices: HolidayOption[];
  selected: SelectedHoliday[];
};
