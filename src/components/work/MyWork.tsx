"use client";
import { useDateTime } from "@/context/SettingsContext";
import FilterPanel from "@/components/shared/FilterPanel";
import { usePersistentQuery, newTaskHref } from "./usePersistentQuery";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  PLANNING_LABELS as labels,
  priorityOf,
  type WorkTodo,
  type WorkActivityType,
} from "@/lib/work-management/types";
import TaskQuickPanel from "./TaskQuickPanel";
import ProjectPicker from "@/components/projects/ProjectPicker";
type Data = {
  date: string;
  timeZone: string;
  nextDayAt: string;
  totalActive: number;
  sections: Record<string, { total: number; items: (WorkTodo & { focused: boolean })[] }>;
  sessions: {
    total: number;
    page: number;
    pageSize: number;
    items: {
      id: number;
      title: string;
      date: string;
      endDate: string;
      timeZone: string | null;
      taskLinks: {
        todo: { id: number; title: string; status: string; archivedAt: string | null };
      }[];
    }[];
  };
};
const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50",
  input = "mt-1 w-full min-w-0 rounded border border-card-border bg-card-bg p-2 text-sm";
export default function MyWork() {
  const { describeWorkDate } = useDateTime();
  const params = useSearchParams(),
    serialized = params.toString(),
    selected = params.get("task"),
    taskId = selected && /^[1-9]\d*$/.test(selected) ? Number(selected) : null;
  usePersistentQuery("my-work", "/my-work", serialized);
  const filterQuery = new URLSearchParams(serialized);
  filterQuery.delete("task");
  const query = filterQuery.toString();
  const [data, setData] = useState<Data | null>(null),
    [activityTypes, setActivityTypes] = useState<WorkActivityType[]>([]),
    [catalogError, setCatalogError] = useState(""),
    [catalogRefresh, setCatalogRefresh] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  const writer = useRef(createWorkWriter()),
    lock = useRef(false);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    const timer = setTimeout(() => {
      void workRead<Data>(`/api/my-work?${query}`)
        .then((value) => {
          if (active) setData(value);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, refresh]);
  useEffect(() => {
    let active = true;
    setCatalogError("");
    void workRead<WorkActivityType[]>("/api/activity-types")
      .then((rows) => {
        if (active) setActivityTypes(rows);
      })
      .catch((error) => {
        if (active) setCatalogError(error.message);
      });
    return () => {
      active = false;
    };
  }, [catalogRefresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !lock.current) reload();
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);
  useEffect(() => {
    if (!data?.nextDayAt) return;
    const timer = setTimeout(
      reload,
      Math.max(100, Math.min(2147483647, Date.parse(data.nextDayAt) - Date.now() + 100)),
    );
    return () => clearTimeout(timer);
  }, [data?.nextDayAt, reload]);
  function navigate(key: string, value: string) {
    const next = new URLSearchParams(serialized);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "task" && key !== "sessionPage") next.delete("sessionPage");
    window.history[key === "task" && value ? "pushState" : "replaceState"](
      null,
      "",
      `/my-work${next.size ? `?${next}` : ""}`,
    );
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this change.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const filters = new URLSearchParams(query);
  filters.delete("sessionPage");
  function allWork(section?: string) {
    const next = new URLSearchParams(filters);
    if (section) next.set("planning", section);
    return `/todos${next.size ? `?${next}` : ""}`;
  }
  return (
    <div className="min-w-0 space-y-5 pb-8 pt-12 md:pt-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Work</h1>
          <p className="mt-1 text-sm text-gray-500">
            {data ? `${data.date} · ${data.totalActive} active tasks` : "Daily planning"}
          </p>
        </div>
      </header>
      <FilterPanel
        name="my-work"
        actions={
          <>
            <Link
              href={newTaskHref(filters, `/my-work${query ? `?${query}` : ""}`)}
              className={`${button} bg-blue-600 text-white`}
            >
              New task
            </Link>
            <button type="button" disabled={busy} onClick={reload} className={button}>
              Refresh My Work
            </button>
          </>
        }
      >
        <section
          aria-label="My Work filters"
          className="grid min-w-0 gap-3 rounded-xl border border-card-border bg-card-bg p-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="text-sm">
            Activity type
            <select
              aria-label="My Work activity type"
              value={params.get("activityType") || ""}
              onChange={(e) => navigate("activityType", e.target.value)}
              className={input}
            >
              <option value="">All activity types</option>
              <option value="none">Unclassified</option>
              {activityTypes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <ProjectPicker
            value={params.get("project") || ""}
            onChange={(value) => navigate("project", value)}
            label="My Work project"
          />
        </section>
      </FilterPanel>
      {catalogError && (
        <p role="alert" className="rounded border border-rose-500/40 p-3 text-rose-500">
          {catalogError}{" "}
          <button
            type="button"
            onClick={() => setCatalogRefresh((value) => value + 1)}
            className="underline"
          >
            Retry activity types
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="rounded border border-rose-500/40 p-3 text-rose-500">
          {error}{" "}
          <button type="button" onClick={reload} className="underline">
            Retry My Work
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-500">
          {notice}
        </p>
      )}
      {!data ? (
        !error && <p role="status">Loading My Work…</p>
      ) : (
        <>
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {Object.entries(labels).map(([key, label]) => {
              const section = data.sections[key];
              return (
                <section
                  key={key}
                  aria-label={label}
                  className="min-w-0 space-y-3 rounded-xl border border-card-border bg-card-bg p-4"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">
                      {label} <span className="text-gray-500">({section.total})</span>
                    </h2>
                    <Link href={allWork(key)} className="text-sm text-blue-400 underline">
                      View all
                    </Link>
                  </header>
                  {section.total === 0 ? (
                    <p className="text-sm text-gray-500">
                      {key === "focus"
                        ? "Choose focus from any task here or in All Work."
                        : "No matching tasks."}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {section.items.map((task) => (
                        <li
                          key={task.id}
                          className="min-w-0 space-y-2 rounded border border-card-border p-3"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              navigate("task", String(task.id));
                            }}
                            className="w-full break-words text-left text-sm font-medium text-blue-400"
                          >
                            {task.reference} · {task.title}
                          </button>
                          <p className="text-xs text-gray-500">
                            {task.activityType?.name || "Unclassified"} ·{" "}
                            {STATUS_LABELS[task.status] ?? task.status} ·{" "}
                            {priorityOf(task)
                              ? PRIORITY_LABELS[priorityOf(task)!]
                              : "Priority not recorded"}
                            {task.isBlocked ? " · Blocked" : ""}
                          </p>
                          {task.nextAction && (
                            <p className="break-words text-sm">{task.nextAction}</p>
                          )}
                          {task.deadlineDate || task.deadlineAt ? (
                            <p className="text-xs">
                              Due:{" "}
                              {describeWorkDate({
                                date: task.deadlineDate ?? null,
                                at: task.deadlineAt ?? null,
                                timeZone: task.deadlineTimeZone ?? null,
                              })}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500">No deadline</p>
                          )}
                          {task.activeFollowUp && (
                            <Link
                              href={`/todos/${task.id}#task-dates`}
                              className="block text-xs text-blue-400 underline"
                            >
                              Follow-up: {describeWorkDate(task.activeFollowUp)}
                            </Link>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`${task.focused ? "Remove focus" : "Focus today"} ${task.reference}`}
                            onClick={() =>
                              void perform(async () => {
                                await writer.current(
                                  `/api/todos/${task.id}/focus`,
                                  "POST",
                                  { date: data.date, active: !task.focused },
                                  task.revision,
                                );
                              })
                            }
                            className={button}
                          >
                            {task.focused ? "Remove focus" : "Focus today"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            <section
              aria-label="Today's work sessions"
              className="space-y-3 rounded-xl border border-card-border bg-card-bg p-4"
            >
              <h2 className="font-semibold">Today&apos;s work sessions ({data.sessions.total})</h2>
              <p className="text-xs text-gray-500">
                Uncompleted sessions overlapping this local day. Session counts are events, not
                additional tasks. Closed/archived targets remain labelled.
              </p>
              {data.sessions.items.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No sessions scheduled.{" "}
                  <Link href="/events" className="text-blue-400 underline">
                    Open calendar
                  </Link>
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.sessions.items.map((event) => (
                    <li key={event.id} className="rounded border border-card-border p-3">
                      <Link
                        href={`/events/${event.id}`}
                        className="break-words text-blue-400 underline"
                      >
                        {event.title}
                      </Link>
                      <p className="mt-1 text-xs">
                        {describeWorkDate({
                          date: null,
                          at: event.date,
                          timeZone: event.timeZone || data.timeZone,
                        })}{" "}
                        →{" "}
                        {describeWorkDate({
                          date: null,
                          at: event.endDate,
                          timeZone: event.timeZone || data.timeZone,
                        })}
                      </p>
                      {event.taskLinks.map((link) => (
                        <Link
                          key={link.todo.id}
                          href={`/todos/${link.todo.id}`}
                          className="mt-1 block break-words text-xs text-blue-400"
                        >
                          {link.todo.title} · {link.todo.status}
                          {link.todo.archivedAt ? " · Archived" : ""}
                        </Link>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={data.sessions.page <= 1}
                  onClick={() => navigate("sessionPage", String(data.sessions.page - 1))}
                  className={button}
                >
                  Previous sessions
                </button>
                <button
                  type="button"
                  disabled={data.sessions.page * data.sessions.pageSize >= data.sessions.total}
                  onClick={() => navigate("sessionPage", String(data.sessions.page + 1))}
                  className={button}
                >
                  Next sessions
                </button>
              </div>
            </section>
          </div>
        </>
      )}
      {taskId && (
        <TaskQuickPanel
          key={taskId}
          id={taskId}
          returnTo={`/my-work${query ? `?${query}` : ""}`}
          onClose={() => navigate("task", "")}
          onChanged={reload}
        />
      )}
    </div>
  );
}
