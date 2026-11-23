"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDaysIcon, LinkIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { occasionHref, type OccasionDetails, type OccasionKind } from "@/lib/calendar-annual";
import { workRead } from "@/lib/work-management/client";
import { STATUS_LABELS, type WorkResults } from "@/lib/work-management/types";
const input = "mt-1 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-3 text-sm";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
export default function CalendarDateDetails({ kind }: { kind: OccasionKind }) {
  const params = useParams(),
    query = useSearchParams();
  const id = Number(params.id),
    date = query.get("date");
  const [data, setData] = useState<OccasionDetails | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""),
    [choices, setChoices] = useState<WorkResults | null>(null),
    [todoId, setTodoId] = useState(""),
    [choiceError, setChoiceError] = useState("");
  const generation = useRef({ value: 0 });
  const url = `/api/calendar-dates/${kind}/${id}`;
  const load = useCallback(async () => {
    const version = ++generation.current.value;
    setError("");
    try {
      const result = await workRead<OccasionDetails>(
        url + (date ? `?date=${encodeURIComponent(date)}` : ""),
      );
      if (generation.current.value === version) setData(result);
    } catch (error) {
      if (generation.current.value === version) setError((error as Error).message);
    }
  }, [url, date]);
  useEffect(() => {
    const pending = generation.current;
    setData(null);
    void load();
    return () => {
      pending.value++;
    };
  }, [load]);
  useEffect(() => {
    let active = true;
    setChoiceError("");
    const timer = setTimeout(() => {
      void workRead<WorkResults>(`/api/work-items?q=${encodeURIComponent(search)}`)
        .then((result) => {
          if (active) setChoices(result);
        })
        .catch((error) => {
          if (active) setChoiceError(error.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  async function link(task: number, remove = false) {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${url}/tasks`, {
        method: remove ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.date, todoId: task }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update task links.");
      setTodoId("");
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const currentHref = data ? occasionHref(kind, id, data.date) : "/events";
  const capture = data
    ? `/todos/new?${new URLSearchParams({ occasionKind: kind, occasionId: String(id), occasionDate: data.date, deadline: data.date, returnTo: currentHref })}`
    : "/todos/new";
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-5 pb-8 pt-12 md:pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/events" className={button}>
          ← Calendar
        </Link>
        <Link
          href={`/settings/${kind === "holiday" ? "holidays" : "birthdays"}`}
          className={button}
        >
          {kind === "holiday" ? "Holiday settings" : "Birthday settings"}
        </Link>
      </header>
      {error && (
        <p role="alert" className="text-rose-500">
          {error}{" "}
          <button onClick={() => void load()} className="underline">
            Retry
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading calendar date…</p>}
      {data && (
        <>
          <article className="overflow-hidden rounded-2xl border border-card-border bg-card-bg">
            <header className="p-5 sm:p-8" style={{ backgroundColor: `${data.color}10` }}>
              <span
                className="inline-flex rounded-full border px-3 py-1 text-xs font-medium"
                style={{ color: data.color, borderColor: `${data.color}60` }}
              >
                {data.type}
              </span>
              <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                {data.title}
              </h1>
              <div className="mt-6 rounded-xl border border-card-border bg-background/50 p-5">
                <p
                  className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: data.color }}
                >
                  <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
                  All day
                </p>
                <p className="text-xl font-semibold sm:text-2xl">
                  {new Intl.DateTimeFormat("en-CA", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${data.date}T12:00:00Z`))}
                </p>
              </div>
              {data.sourceName && data.sourceName !== data.title && (
                <p className="mt-4 text-sm text-muted">Based on {data.sourceName}</p>
              )}
            </header>
          </article>
          <section
            aria-label="Linked tasks"
            className="space-y-4 rounded-xl border border-card-border bg-card-bg p-5"
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Linked tasks ({data.tasks.length})</h2>
              <Link href={capture} className={`${button} border-blue-500/50 text-blue-300`}>
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                New task
              </Link>
            </header>
            {data.tasks.length === 0 && (
              <p className="text-sm text-muted">No tasks linked to this occurrence.</p>
            )}
            <ul className="space-y-3">
              {data.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-card-border p-3"
                >
                  <div className="min-w-0">
                    <Link
                      className="break-words font-medium hover:underline"
                      href={`/todos/${task.id}`}
                    >
                      {task.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted">
                      {task.reference} · {STATUS_LABELS[task.status]}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Unlink ${task.title}`}
                    disabled={busy}
                    className={button}
                    onClick={() => void link(task.id, true)}
                  >
                    <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="grid min-w-0 gap-3 border-t border-card-border pt-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (todoId) void link(Number(todoId));
              }}
            >
              <label className="min-w-0 text-sm">
                Search tasks
                <input
                  aria-label="Search tasks to link"
                  className={input}
                  maxLength={500}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className="min-w-0 text-sm">
                Existing task
                <select
                  aria-label="Existing task"
                  required
                  className={input}
                  disabled={busy || !choices}
                  value={todoId}
                  onChange={(event) => setTodoId(event.target.value)}
                >
                  <option value="">Choose a task</option>
                  {choices?.items
                    .filter((task) => !data.tasks.some((link) => link.id === task.id))
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.reference} · {task.title}
                      </option>
                    ))}
                </select>
              </label>
              {choiceError && (
                <p role="alert" className="text-rose-500 sm:col-span-2">
                  {choiceError}
                </p>
              )}
              <button
                disabled={busy || !todoId}
                className={`${button} justify-self-start border-blue-500/50 text-blue-300`}
              >
                <LinkIcon className="h-4 w-4" aria-hidden="true" />
                Link task
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
