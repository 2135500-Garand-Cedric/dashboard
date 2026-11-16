"use client";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resolveLocalInstants } from "@/lib/local-time";
import {
  localParts,
  describeWorkDate,
  type StoredWorkDate,
} from "@/lib/work-management/date-format";

type Settings = { timeZone: string; saveTimeZone: (value: string) => Promise<void> };
const Context = createContext<Settings | null>(null);
export function SettingsProvider({
  children,
  initialTimeZone,
}: {
  children: ReactNode;
  initialTimeZone: string;
}) {
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const router = useRouter();
  useEffect(() => setTimeZone(initialTimeZone), [initialTimeZone]);
  async function saveTimeZone(value: string) {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to save settings.");
    setTimeZone(data.timeZone);
    router.refresh();
  }
  return <Context.Provider value={{ timeZone, saveTimeZone }}>{children}</Context.Provider>;
}
export function useSettings() {
  const value = useContext(Context);
  if (!value) throw new Error("SettingsProvider is required.");
  return value;
}
export function useDateTime() {
  const { timeZone } = useSettings();
  return {
    timeZone,
    toLocalInput: (value: string) => localParts(value, timeZone).slice(0, 16),
    parseLocalInput: (value: string, occurrence = "") => {
      const candidates = resolveLocalInstants(value, timeZone);
      if (!candidates.length)
        throw new Error("This local time does not exist. Choose a different time.");
      if (candidates.length > 1 && !occurrence)
        throw new Error("This local time occurs twice. Choose the earlier or later occurrence.");
      return candidates[occurrence === "later" ? candidates.length - 1 : 0].toISOString();
    },
    formatInstant: (value: Date | string, options: Intl.DateTimeFormatOptions = {}) =>
      new Intl.DateTimeFormat("en-CA", {
        ...(Object.keys(options).length ? options : { dateStyle: "medium", timeStyle: "short" }),
        timeZone,
      }).format(new Date(value)),
    describeWorkDate: (value: StoredWorkDate) => describeWorkDate(value, timeZone),
  };
}
export function DateTime({ value }: { value: string | Date }) {
  return <>{useDateTime().formatInstant(value)}</>;
}
