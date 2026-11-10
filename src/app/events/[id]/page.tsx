"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { workRead, createWorkWriter } from "@/lib/work-management/client";
import { eventTiming, type CalendarEvent } from "@/lib/work-management/calendar-types";
import EventForm from "@/components/calendar/EventForm";
import EventConversion from "@/components/calendar/EventConversion";
const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
export default function EventPage() {
  const params = useParams(),
    router = useRouter(),
    id = Number(params.id),
    [event, setEvent] = useState<CalendarEvent | null>(null),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [activity, setActivity] = useState<{ id: number; action: string; createdAt: string }[]>([]);
  const writer = useRef(createWorkWriter()),
    lock = useRef(false),
    generation = useRef(0);
  const currentId = useRef(id);
  if (currentId.current !== id) {
    currentId.current = id;
    generation.current++;
  }
  const load = useCallback(async () => {
    setError("");
    try {
      const version = ++generation.current;
      const result = await workRead<CalendarEvent>(`/api/events/${id}`);
      if (version === generation.current) setEvent(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load event.");
    }
  }, [id]);
  useEffect(() => {
    setEditing(false);
    void load();
  }, [load]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update event.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-5 pb-8 pt-12 md:pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/events" className={button}>
          ← Calendar
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || editing}
            onClick={() => void load()}
            className={button}
          >
            Reload event
          </button>
          {event?.id === id && !editing && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
                className={button}
              >
                Edit event
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete only this event/session? Linked tasks and conversion history will remain.",
                    )
                  )
                    void perform(async () => {
                      await writer.current(
                        `/api/events/${id}`,
                        "DELETE",
                        undefined,
                        event.revision,
                      );
                      router.push("/events");
                    });
                }}
                className={`${button} text-rose-500`}
              >
                Delete event
              </button>
            </>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="break-words text-rose-500">
          {error}
        </p>
      )}
      {!event || event.id !== id ? (
        <p role="status">Loading event…</p>
      ) : editing ? (
        <EventForm
          key={event.revision}
          event={event}
          timeZone={event.appTimeZone}
          onSaved={(updated) => {
            setEvent(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <article className="space-y-5 rounded-xl border border-card-border bg-card-bg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1
                className={`min-w-0 break-words text-2xl font-semibold ${event.completed ? "line-through text-gray-500" : ""}`}
              >
                {event.title}
              </h1>
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-sm">
                {event.kind === "WORK_SESSION"
                  ? "▣ Work session"
                  : event.kind === "INFORMATIONAL"
                    ? "ⓘ Informational event"
                    : "○ Event"}
              </span>
            </div>
            <p className="break-words">{eventTiming(event)}</p>
            <p className="text-sm text-gray-500">
              Activity label: {event.type || "None"} · Availability:{" "}
              {event.busy === null ? "Not specified" : event.busy ? "Busy" : "Free"}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {event.description || "No description"}
            </p>
            {event.kind === "WORK_SESSION" && (
              <p className="text-sm text-gray-500">
                This reserves time to work. Passing its end or marking the session completed never
                completes the task.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span>{event.completed ? "✓ Completed" : "Open"}</span>
              <button
                type="button"
                disabled={busy}
                aria-pressed={event.completed}
                onClick={() =>
                  void perform(async () =>
                    setEvent(
                      await writer.current<CalendarEvent>(
                        `/api/events/${id}`,
                        "PATCH",
                        { completed: !event.completed },
                        event.revision,
                      ),
                    ),
                  )
                }
                className={button}
              >
                {event.completed ? "Mark incomplete" : "Mark completed"}
              </button>
            </div>
            <section
              aria-label="Linked tasks"
              className="space-y-3 border-t border-card-border pt-4"
            >
              <h2 className="font-medium">Linked tasks</h2>
              {!event.taskLinks.length && (
                <p className="text-sm text-gray-500">
                  No linked tasks. Edit the event to link existing tasks.
                </p>
              )}
              <ul className="space-y-3">
                {event.taskLinks.map((link) => (
                  <li key={link.todoId} className="space-y-1">
                    <p className="text-xs text-gray-500">
                      {link.role === "SESSION_TARGET" ? "Session task" : "Related task"}
                      {link.reviewReason ? ` · Needs review: ${link.reviewReason}` : ""}
                    </p>
                    {link.task.status ? (
                      <Link
                        href={`/todos/${link.todoId}`}
                        className="break-words text-sm text-blue-400 underline"
                      >
                        {link.task.reference} · {link.task.title}
                      </Link>
                    ) : (
                      <p>Unavailable legacy task</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {link.task.status}
                      {link.task.archivedAt ? " · Archived" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </article>
          <EventConversion
            key={`${event.id}-${event.revision}`}
            event={event}
            onChanged={setEvent}
          />
          <details className="rounded-xl border border-card-border bg-card-bg p-4">
            <summary
              className="cursor-pointer"
              onClick={() => {
                void workRead<typeof activity>(`/api/events/${id}/activity`)
                  .then(setActivity)
                  .catch((error) => setError(error.message));
              }}
            >
              Event activity
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {activity.map((item) => (
                <li key={item.id}>
                  {item.action.replaceAll("_", " ")} · {new Date(item.createdAt).toISOString()}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
