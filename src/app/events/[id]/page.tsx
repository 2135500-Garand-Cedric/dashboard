"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { workRead, createWorkWriter } from "@/lib/work-management/client";
import { type CalendarEvent } from "@/lib/work-management/calendar-types";
import EventOverview from "@/components/calendar/EventOverview";
import { useSettings } from "@/context/SettingsContext";
import { writtenEventDate } from "@/lib/work-management/event-display";
import EventForm from "@/components/calendar/EventForm";
import EventConversion from "@/components/calendar/EventConversion";
const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
export default function EventPage() {
  const { timeZone } = useSettings();
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
          <EventOverview
            event={event}
            busy={busy}
            onToggleCompleted={() =>
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
          />
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
                  {item.action.replaceAll("_", " ")} · {writtenEventDate(item.createdAt, timeZone)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
