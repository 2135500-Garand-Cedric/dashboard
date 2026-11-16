"use client";
import { DateTime, useSettings } from "@/context/SettingsContext";
import { useEffect, useState } from "react";
import { workRead } from "@/lib/work-management/client";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  type WorkActivityEntry,
} from "@/lib/work-management/types";
const timestamp = (value: string) => <DateTime value={value} />;
export function valueLabel(value: unknown, timeZone = "UTC"): string {
  if (value == null || value === "") return "Not recorded";
  if (typeof value === "string")
    return (
      (STATUS_LABELS as Record<string, string>)[value] ??
      (PRIORITY_LABELS as Record<string, string>)[value] ??
      (/^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))
        ? new Date(value).toLocaleString("en-CA", { timeZone })
        : value.replace(/America\/Toronto/g, "Recorded timezone"))
    );
  if (Array.isArray(value))
    return value.map((item) => valueLabel(item, timeZone)).join(", ") || "None";
  if (typeof value === "object" && "name" in value) return String(value.name);
  if (typeof value === "object" && "title" in value)
    return `${value.title}${"done" in value ? (value.done ? " (completed)" : " (not completed)") : ""}`;
  return typeof value === "object"
    ? Object.entries(value)
        .filter(([key]) => !/timeZone/i.test(key))
        .map(([key, item]) => `${key}: ${valueLabel(item, timeZone)}`)
        .join("; ")
    : String(value);
}
export default function TaskActivityPreview({ id, revision }: { id: number; revision: number }) {
  const { timeZone } = useSettings();
  const [open, setOpen] = useState(false),
    [entries, setEntries] = useState<WorkActivityEntry[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setEntries(null);
    setError("");
    void workRead<WorkActivityEntry[]>(`/api/todos/${id}/activity`)
      .then((value) => {
        if (active) setEntries(value);
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : "Unable to load changes.");
      });
    return () => {
      active = false;
    };
  }, [open, id, revision]);
  return (
    <details
      className="mt-6 border-t border-card-border pt-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">Recent changes</summary>
      {open && (
        <div className="mt-3 space-y-3">
          {error ? (
            <p role="alert" className="text-rose-500">
              {error}
            </p>
          ) : entries === null ? (
            <p role="status">Loading changes…</p>
          ) : !entries.length ? (
            <p className="text-sm text-gray-500">
              No changes recorded since activity tracking began.
            </p>
          ) : (
            entries
              .filter((entry) => !entry.action.startsWith("KEY_"))
              .map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-lg border border-card-border p-3 text-sm"
                >
                  <p className="capitalize font-medium">
                    {entry.action.replace(/_/g, " ").toLowerCase()}
                  </p>
                  <time className="text-xs text-gray-500" dateTime={entry.createdAt}>
                    {timestamp(entry.createdAt)}
                  </time>
                  <dl className="mt-2 space-y-1">
                    {Object.entries(entry.changes)
                      .filter(
                        ([field]) =>
                          !field.startsWith("reward") &&
                          !["tags", "waitingOnContact", "company", "course"].includes(field),
                      )
                      .map(([field, change]) => (
                        <div key={field} className="break-words">
                          <dt className="font-medium">
                            {field
                              .replace(/([A-Z])/g, " $1")
                              .replace(/^./, (value) => value.toUpperCase())}
                          </dt>
                          <dd className="whitespace-pre-wrap text-gray-500">
                            {valueLabel(change.before, timeZone)} →{" "}
                            {valueLabel(change.after, timeZone)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </article>
              ))
          )}
        </div>
      )}
    </details>
  );
}
