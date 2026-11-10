"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { workRead } from "@/lib/work-management/client";
import { eventTiming, type CalendarEvent } from "@/lib/work-management/calendar-types";
export default function TaskCalendar({
  id,
  revision,
  archived = false,
}: {
  id: number;
  revision: number;
  archived?: boolean;
}) {
  const [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [data, setData] = useState<{
      items: CalendarEvent[];
      total: number;
      page: number;
      pageSize: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    void workRead<NonNullable<typeof data>>(`/api/todos/${id}/calendar?page=${page}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision, page, reload]);
  const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
  return (
    <section
      aria-label="Task calendar links"
      className="space-y-3 rounded-xl border border-card-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Sessions and related events</h2>
        {!archived && (
          <Link href={`/events?new=session&task=${id}`} className={`${button} text-blue-400`}>
            Schedule work session
          </Link>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Session times belong to their event. Ending a session never completes this task.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading calendar links…</p>}
      <ul className="space-y-3">
        {data?.items.map((event) => (
          <li key={event.id} className="space-y-1 border-t border-card-border pt-3">
            <Link
              href={`/events/${event.id}`}
              className="break-words text-sm text-blue-400 underline"
            >
              {event.kind === "WORK_SESSION" ? "▣ Session" : "○ Event"} · {event.title}
            </Link>
            <p className="break-words text-xs text-gray-500">
              {eventTiming(event)}
              {event.superseded ? " · Superseded placeholder" : ""}
              {event.completed ? " · Completed event" : ""}
            </p>
          </li>
        ))}
      </ul>
      {data?.total === 0 && <p className="text-sm text-gray-500">No sessions or related events.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setReload((value) => value + 1)} className={button}>
          Reload calendar links
        </button>
        <button
          type="button"
          disabled={!data || data.page <= 1}
          onClick={() => setPage(page - 1)}
          className={button}
        >
          Previous events
        </button>
        <button
          type="button"
          disabled={!data || data.page * data.pageSize >= data.total}
          onClick={() => setPage(page + 1)}
          className={button}
        >
          Next events
        </button>
      </div>
    </section>
  );
}
