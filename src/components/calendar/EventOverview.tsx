"use client";
import { repeatLabels } from "@/components/recurrence/RepeatFields";
import Link from "next/link";
import { CalendarDaysIcon, ClockIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useSettings } from "@/context/SettingsContext";
import { eventDateDisplay } from "@/lib/work-management/event-display";
import { STATUS_LABELS } from "@/lib/work-management/types";
import type { CalendarEvent } from "@/lib/work-management/calendar-types";

export default function EventOverview({
  event,
  busy,
  onToggleCompleted,
}: {
  event: CalendarEvent;
  busy: boolean;
  onToggleCompleted: () => void;
}) {
  const { timeZone } = useSettings();
  const timing = eventDateDisplay(event, timeZone);
  const kind =
    event.kind === "WORK_SESSION"
      ? "Work session"
      : event.kind === "INFORMATIONAL"
        ? "Informational event"
        : "Event";
  return (
    <article
      aria-label="Event overview"
      className="overflow-hidden rounded-2xl border border-card-border bg-card-bg"
    >
      <header className="border-b border-card-border bg-blue-500/5 p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-blue-600 dark:text-blue-300">
            {kind}
          </span>
          {event.type && (
            <span className="rounded-full border border-card-border px-3 py-1">{event.type}</span>
          )}
          {event.recurrence && (
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sky-600 dark:text-sky-300">
              ↻{" "}
              {event.recurrence.active
                ? repeatLabels[event.recurrence.frequency]
                : "Repeat stopped"}
            </span>
          )}
          {event.completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="h-3.5 w-3.5" />
              Completed
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <h1
            className={`min-w-0 flex-1 basis-64 break-words text-3xl font-semibold tracking-tight sm:text-4xl ${event.completed ? "line-through opacity-70" : ""}`}
          >
            {event.title}
          </h1>
          <button
            type="button"
            disabled={busy}
            aria-pressed={event.completed}
            onClick={onToggleCompleted}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${event.completed ? "border-card-border" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-400"}`}
          >
            <CheckIcon className="h-4 w-4" />
            {event.completed ? "Mark incomplete" : "Mark completed"}
          </button>
        </div>
        {event.reminderMinutes != null && (
          <p className="mt-3 text-sm">
            {event.reminderMinutes === -1
              ? "Notifications off for this event"
              : event.reminderMinutes === 0
                ? "Reminder at the scheduled time"
                : event.reminderMinutes >= 1440
                  ? `Reminder ${event.reminderMinutes / 1440} day${event.reminderMinutes > 1440 ? "s" : ""} before`
                  : `Reminder ${event.reminderMinutes} minutes before`}
          </p>
        )}
        <section
          aria-label="Event schedule"
          className="mt-6 rounded-xl border border-blue-400/20 bg-background/50 p-4 sm:p-5"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">
            <CalendarDaysIcon className="h-4 w-4" />
            {timing.allDay ? "All day" : "When"}
            {timing.duration && (
              <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal text-foreground">
                <ClockIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                {timing.duration}
              </span>
            )}
          </div>
          <div className={`grid gap-4 ${timing.end ? "sm:grid-cols-2" : ""}`}>
            <div>
              {timing.end && (
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Starts</p>
              )}
              <p className="break-words text-xl font-semibold sm:text-2xl">{timing.start}</p>
              {timing.startDay && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{timing.startDay}</p>
              )}
            </div>
            {timing.end && (
              <div className="border-t border-card-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Ends</p>
                <p className="break-words text-xl font-semibold sm:text-2xl">{timing.end}</p>
                {timing.endDay && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{timing.endDay}</p>
                )}
              </div>
            )}
          </div>
        </section>
      </header>
      <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_16rem] md:gap-8">
        <section aria-label="Event description" className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold">
            About this {event.kind === "WORK_SESSION" ? "session" : "event"}
          </h2>
          <p
            className={`whitespace-pre-wrap break-words text-sm leading-7 ${event.description ? "" : "text-gray-500 dark:text-gray-400"}`}
          >
            {event.description || "No description added."}
          </p>
          {event.taskLinks.length > 0 && (
            <section aria-label="Linked tasks" className="mt-7">
              <h2 className="mb-3 text-lg font-semibold">
                Linked tasks{" "}
                <span className="ml-1 text-sm font-normal text-gray-500 dark:text-gray-400">
                  {event.taskLinks.length}
                </span>
              </h2>
              <ul className="space-y-2">
                {event.taskLinks.map((link) => (
                  <li key={link.todoId} className="rounded-xl border border-card-border p-4">
                    <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                      {link.role === "SESSION_TARGET" ? "Working on" : "Related task"}
                    </p>
                    {link.task.status ? (
                      <Link
                        href={`/todos/${link.todoId}`}
                        className="block break-words font-medium text-blue-600 dark:text-blue-300 hover:underline"
                      >
                        {link.task.title}
                        <span aria-hidden="true" className="ml-2">
                          ↗
                        </span>
                      </Link>
                    ) : (
                      <p>Unavailable legacy task</p>
                    )}
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {link.task.reference}
                      {link.task.status ? ` · ${STATUS_LABELS[link.task.status]}` : ""}
                      {link.task.archivedAt ? " · Archived" : ""}
                    </p>
                    {link.reviewReason && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        Needs review: {link.reviewReason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
        <aside
          aria-label="Event details"
          className="min-w-0 space-y-5 border-t border-card-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0"
        >
          <h2 className="font-semibold">Details</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="mb-1 text-xs text-gray-500 dark:text-gray-400">Status</dt>
              <dd className={event.completed ? "text-emerald-600 dark:text-emerald-400" : ""}>
                {event.completed ? "Completed" : "Open"}
              </dd>
            </div>
          </dl>
          {event.kind === "WORK_SESSION" && (
            <p className="rounded-lg bg-blue-400/5 p-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Time reserved to work on a task. Completing this session leaves the task status
              unchanged.
            </p>
          )}
          {!event.taskLinks.length && (
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              No linked tasks. Use Edit event to link a task.
            </p>
          )}
        </aside>
      </div>
    </article>
  );
}
