"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CakeIcon, PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import TaskModal from "@/components/shared/TaskModal";
import { occasionHref } from "@/lib/calendar-annual";

type Birthday = { id: number; name: string; month: number; day: number; nextDate: string };
const input = "mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-3 text-sm";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
async function request<T>(path = "", method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/settings/birthdays${path}`, {
    method,
    cache: "no-store",
    ...(data === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result == null)
    throw new Error(result?.error || "Unable to update birthdays. Try again.");
  return result;
}
export default function BirthdaySettings() {
  const [items, setItems] = useState<Birthday[] | null>(null);
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState(""),
    [month, setMonth] = useState(""),
    [day, setDay] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await request<Birthday[]>());
    } catch (error) {
      setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const days = month ? new Date(Date.UTC(2000, Number(month), 0)).getUTCDate() : 31;
  const months = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, index, 1)),
    ),
  );
  function edit(item?: Birthday) {
    setEditing(item?.id || null);
    setName(item?.name || "");
    setMonth(item ? String(item.month) : "");
    setDay(item ? String(item.day) : "");
    setFormError("");
    setOpen(true);
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      await request(editing ? `/${editing}` : "", editing ? "PATCH" : "POST", {
        name,
        month: Number(month),
        day: Number(day),
      });
      setOpen(false);
      await load();
      setNotice("Birthday saved.");
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function remove(item: Birthday) {
    if (
      lock.current ||
      !window.confirm(`Remove ${item.name}’s birthday? Linked tasks will be kept.`)
    )
      return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      await request(`/${item.id}`, "DELETE");
      await load();
      setNotice("Birthday removed.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Your birthdays{items ? ` (${items.length})` : ""}</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => edit()}
          className={`${button} border-pink-500/50 text-pink-300`}
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add birthday
        </button>
      </header>
      {error && (
        <p role="alert" className="text-rose-500">
          {error}{" "}
          <button onClick={() => void load()} className="underline">
            Retry
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-400">
          {notice}
        </p>
      )}
      {!items && !error && <p role="status">Loading birthdays…</p>}
      {items?.length === 0 && (
        <div className="rounded-xl border border-dashed border-card-border p-8 text-center">
          <CakeIcon className="mx-auto mb-3 h-8 w-8 text-pink-400" aria-hidden="true" />
          <p>No birthdays added yet.</p>
        </div>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items?.map((item) => (
          <article
            key={item.id}
            className="flex min-w-0 flex-col gap-4 rounded-xl border border-card-border bg-card-bg p-5"
          >
            <Link
              href={occasionHref("birthday", item.id, item.nextDate)}
              className="flex items-center gap-3 hover:underline"
            >
              <span className="rounded-lg bg-pink-500/10 p-2 text-pink-400">
                <CakeIcon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="break-words font-semibold">{item.name}</h3>
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Next birthday
              </p>
              <p className="mt-1 text-sm font-medium">
                {new Intl.DateTimeFormat("en-CA", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${item.nextDate}T12:00:00Z`))}
              </p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={`${button} border-blue-500/40 text-blue-300`}
                onClick={() => edit(item)}
              >
                <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                className={`${button} border-rose-500/40 text-rose-400`}
                onClick={() => void remove(item)}
              >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      <TaskModal
        open={open}
        title={editing ? "Edit birthday" : "Add birthday"}
        busy={busy}
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="block text-sm">
            Person’s name
            <input
              aria-label="Person's name"
              required
              maxLength={200}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              className={input}
            />
          </label>
          <fieldset className="grid grid-cols-2 gap-3" disabled={busy}>
            <legend className="mb-1 text-sm">Birthday date</legend>
            <label className="text-sm">
              Month
              <select
                aria-label="Birthday month"
                required
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  const limit = new Date(
                    Date.UTC(2000, Number(event.target.value), 0),
                  ).getUTCDate();
                  if (Number(day) > limit) setDay("");
                }}
                className={input}
              >
                <option value="">Month</option>
                {months.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Day
              <select
                aria-label="Birthday day"
                required
                value={day}
                disabled={!month || busy}
                onChange={(event) => setDay(event.target.value)}
                className={input}
              >
                <option value="">Day</option>
                {Array.from({ length: days }, (_, index) => (
                  <option key={index} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {month === "2" && day === "29" && (
            <p className="text-sm text-muted">Shown on February 28 in years without February 29.</p>
          )}
          {formError && (
            <p role="alert" className="text-rose-500">
              {formError}
            </p>
          )}
          <button
            disabled={busy || !name.trim() || !month || !day}
            className={`${button} border-pink-500/50 text-pink-300`}
          >
            {busy ? "Saving…" : "Save birthday"}
          </button>
        </form>
      </TaskModal>
    </div>
  );
}
