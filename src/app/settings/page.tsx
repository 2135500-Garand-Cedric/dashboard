"use client";
import { useState } from "react";
import { useSettings } from "@/context/SettingsContext";
export default function SettingsPage() {
  const { timeZone, saveTimeZone } = useSettings();
  const [selected, setSelected] = useState(timeZone),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const cities = [
    ["Pacific/Honolulu", "Honolulu"],
    ["America/Anchorage", "Anchorage"],
    ["America/Los_Angeles", "Los Angeles / Vancouver"],
    ["America/Denver", "Denver / Edmonton"],
    ["America/Phoenix", "Phoenix"],
    ["America/Chicago", "Chicago / Winnipeg"],
    ["America/Toronto", "Toronto / New York"],
    ["America/Halifax", "Halifax"],
    ["America/St_Johns", "St. John's"],
    ["America/Sao_Paulo", "São Paulo"],
    ["UTC", "Coordinated Universal Time"],
    ["Europe/London", "London"],
    ["Europe/Paris", "Paris / Berlin"],
    ["Africa/Johannesburg", "Johannesburg"],
    ["Africa/Cairo", "Cairo"],
    ["Europe/Helsinki", "Helsinki / Athens"],
    ["Asia/Dubai", "Dubai"],
    ["Asia/Kolkata", "New Delhi / Mumbai"],
    ["Asia/Dhaka", "Dhaka"],
    ["Asia/Bangkok", "Bangkok"],
    ["Asia/Singapore", "Singapore / Beijing"],
    ["Asia/Tokyo", "Tokyo / Seoul"],
    ["Australia/Perth", "Perth"],
    ["Australia/Adelaide", "Adelaide"],
    ["Australia/Sydney", "Sydney"],
    ["Pacific/Auckland", "Auckland"],
  ];
  if (!cities.some(([zone]) => zone === timeZone)) {
    cities.push([timeZone, timeZone.split("/").at(-1)!.replaceAll("_", " ")]);
  }
  const offset = (zone: string) =>
    new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")!.value;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8 pt-12 md:pt-2">
      <h1 className="text-2xl font-bold">Settings</h1>
      <form
        className="space-y-4 rounded-xl border border-card-border bg-card-bg p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          try {
            await saveTimeZone(selected);
            setNotice("Settings saved.");
          } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to save settings.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm">
          Display timezone
          <select
            aria-label="Display timezone"
            value={selected}
            disabled={busy}
            onChange={(event) => setSelected(event.target.value)}
            className="mt-2 w-full rounded border border-card-border bg-card-bg p-3"
          >
            {cities.map(([zone, city]) => (
              <option key={zone} value={zone}>
                {city} ({offset(zone)})
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-rose-500">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-emerald-500">
            {notice}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
