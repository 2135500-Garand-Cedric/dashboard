"use client";
import Link from "next/link";
import { occasionHref } from "@/lib/calendar-annual";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDaysIcon,
  PlusIcon,
  TrashIcon,
  BuildingLibraryIcon,
  ArrowPathIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import {
  HOLIDAY_DISPLAY_TYPES,
  holidayDisplayType,
  type HolidayOverview,
  type SelectedHoliday,
  type HolidayDisplayType,
} from "@/lib/holiday-types";
import TaskModal from "@/components/shared/TaskModal";
import HolidayAppearanceFields from "./HolidayAppearanceFields";

const input = "mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-3 text-sm";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/settings/holidays${path}`, {
    method,
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error || "Unable to load calendar holidays. Try again.");
  return data;
}
export default function HolidaySettings() {
  const [adding, setAdding] = useState(false);
  const [data, setData] = useState<HolidayOverview | null>(null);
  const [country, setCountry] = useState("");
  const [holiday, setHoliday] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<HolidayDisplayType>("holiday");
  const [editing, setEditing] = useState<SelectedHoliday | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<HolidayDisplayType>("holiday");
  const [editError, setEditError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const result = await request<HolidayOverview>(
          country ? `?country=${encodeURIComponent(country)}` : "",
          "GET",
          undefined,
          signal,
        );
        if (generation.current === current) setData(result);
      } catch (error) {
        if (!signal?.aborted && generation.current === current) setError((error as Error).message);
      } finally {
        if (generation.current === current) setLoading(false);
      }
    },
    [country],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retry]);
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setAdding(false);
      setHoliday("");
      await load();
      setNotice(message);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function saveAppearance() {
    if (!editing || lock.current) return;
    lock.current = true;
    setBusy(true);
    setEditError("");
    setNotice("");
    try {
      await request(`/${editing.id}`, "PATCH", { name: editName, type: editType });
      setEditing(null);
      await load();
      setNotice("Calendar date updated.");
    } catch (error) {
      setEditError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const selected = new Set(data?.selected.map((item) => item.key) || []);
  const choices = data?.choices.filter((item) => item.country === country) || [];
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  return (
    <div className="space-y-6">
      <TaskModal open={adding} title="Add a holiday" busy={busy} onClose={() => setAdding(false)}>
        <form
          aria-label="Add calendar holiday"
          className="space-y-4 rounded-xl border border-card-border bg-card-bg p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(
              () => request("", "POST", { country, key: holiday, name, type }),
              "Holiday added to your calendar.",
            );
          }}
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)] lg:items-end">
            <label className="block min-w-0 text-sm">
              Country
              <select
                aria-label="Holiday country"
                className={input}
                value={country}
                disabled={busy || (!data && loading)}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setHoliday("");
                  setNotice("");
                }}
              >
                <option value="">Choose a country</option>
                {data?.countries.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 text-sm">
              Holiday
              <select
                aria-label="Holiday"
                className={input}
                value={holiday}
                disabled={busy || loading || !country}
                required
                onChange={(event) => {
                  const choice = choices.find((item) => item.key === event.target.value);
                  setHoliday(event.target.value);
                  setName(choice?.name || "");
                  setType(holidayDisplayType(choice?.type || ""));
                }}
              >
                <option value="">
                  {loading && country ? "Loading holidays…" : "Choose a holiday"}
                </option>
                {choices.map((item) => (
                  <option key={item.key} value={item.key} disabled={selected.has(item.key)}>
                    {item.name} · {item.location}
                    {item.type === "bank" ? " · Bank holiday" : ""}
                    {selected.has(item.key) ? " · Added" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {holiday && (
            <HolidayAppearanceFields
              name={name}
              type={type}
              onName={setName}
              onType={setType}
              disabled={busy}
            />
          )}
          <div className="flex justify-end">
            <button
              disabled={busy || loading || !holiday || !name.trim()}
              className={`${button} border-teal-500/60 text-teal-300`}
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              {busy ? "Saving…" : "Save holiday"}
            </button>
          </div>
          {country && !loading && !choices.length && !error && (
            <p className="text-sm text-muted">No holidays are available for this country.</p>
          )}
          {error && (
            <p role="alert" className="text-rose-500">
              {error}
            </p>
          )}
        </form>
      </TaskModal>
      {!adding && error && (
        <p role="alert" className="flex flex-wrap items-center gap-3 text-rose-500">
          {error}
          <button
            type="button"
            disabled={busy}
            className={`${button} border-card-border`}
            onClick={() => setRetry((value) => value + 1)}
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-400">
          {notice}
        </p>
      )}
      <section aria-label="Selected calendar holidays" className="space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Your holidays</h2>
          {data && (
            <span className="rounded-full border border-card-border px-2 py-0.5 text-sm">
              {data.selected.length}
            </span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              setAdding(true);
            }}
            className={`${button} ml-auto border-teal-500/50 text-teal-300`}
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add holiday
          </button>
        </header>
        {loading && !data ? (
          <p role="status">Loading your holidays…</p>
        ) : data && !data.selected.length ? (
          <div className="rounded-xl border border-dashed border-card-border p-8 text-center">
            <CalendarDaysIcon className="mx-auto mb-3 h-8 w-8 text-teal-400" aria-hidden="true" />
            <p>No holidays added yet.</p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data?.selected.map((item) => (
              <article
                key={item.id}
                aria-label={`${item.name}, ${item.countryName}, ${item.location}`}
                className="flex min-w-0 flex-col gap-4 rounded-xl border border-card-border bg-card-bg p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-teal-500/10 p-2 text-teal-400">
                    <CalendarDaysIcon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">
                      {item.nextDate ? (
                        <Link
                          href={occasionHref("holiday", item.id, item.nextDate)}
                          className="hover:underline"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        item.name
                      )}
                    </h3>
                    {item.name !== item.sourceName && (
                      <p className="mt-1 break-words text-xs text-muted">
                        Based on {item.sourceName}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Next occurrence
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {item.nextDate ? formatDate(item.nextDate) : "No upcoming date available"}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${item.type === "bank" ? "border-amber-500/40 text-amber-300" : item.type === "important" ? "border-blue-500/40 text-blue-300" : "border-teal-500/40 text-teal-300"}`}
                  >
                    {item.type === "bank" && (
                      <BuildingLibraryIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                    {HOLIDAY_DISPLAY_TYPES[item.type].label}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Edit ${item.name}, ${item.location}`}
                      className={`${button} border-blue-500/40 text-blue-300`}
                      onClick={() => {
                        setEditing(item);
                        setEditName(item.name);
                        setEditType(item.type);
                        setEditError("");
                      }}
                    >
                      <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${item.name}, ${item.location}`}
                      className={`${button} border-rose-500/40 text-rose-400`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${item.name} (${item.countryName} · ${item.location}) from your calendar?`,
                          )
                        )
                          void mutate(
                            () => request(`/${item.id}`, "DELETE"),
                            "Holiday removed from your calendar.",
                          );
                      }}
                    >
                      <TrashIcon className="h-4 w-4" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <TaskModal
        open={!!editing}
        title="Edit calendar date"
        busy={busy}
        onClose={() => setEditing(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAppearance();
          }}
        >
          <HolidayAppearanceFields
            name={editName}
            type={editType}
            onName={setEditName}
            onType={setEditType}
            disabled={busy}
          />
          {editing && (
            <p className="text-sm text-muted">
              Date calculated from {editing.sourceName} · {editing.countryName} · {editing.location}
            </p>
          )}
          {editError && (
            <p role="alert" className="text-rose-500">
              {editError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || !editName.trim()}
              className={`${button} border-blue-500/50 text-blue-300`}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              className={`${button} border-card-border`}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      </TaskModal>
    </div>
  );
}
