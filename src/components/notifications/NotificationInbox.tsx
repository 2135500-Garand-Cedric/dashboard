"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellIcon,
  CalendarDaysIcon,
  ClockIcon,
  FlagIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import TaskModal from "@/components/shared/TaskModal";
import { useDateTime } from "@/context/SettingsContext";
import { useSnackbar } from "@/context/SnackbarContext";
import { repeatedTimeChoices } from "@/lib/local-time";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { useInbox } from "./InboxProvider";

type Reminder = {
  id: string;
  revision: number;
  titleSnapshot: string;
  labelSnapshot: string;
  category: string;
  targetAt: string;
  dueAt: string;
  createdAt: string;
  sourceDate: string | null;
  lifecycle: string;
  retiredReason: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  snoozedUntil: string | null;
  color: string | null;
  url: string | null;
  deliveries: { status: string; sentAt: string | null; device: string; generation: number }[];
};
type Page = { items: Reminder[]; unread: number; cutoff: string; nextCursor: string | null };
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-50";
const views = ["active", "unread", "snoozed", "history"] as const;

function ReminderIcon({ category }: { category: string }) {
  const Icon =
    category === "deadlines" || category === "milestones"
      ? FlagIcon
      : category === "followUps"
        ? ClockIcon
        : CalendarDaysIcon;
  return <Icon className="h-5 w-5 shrink-0" />;
}
export function NotificationBell({ mobile = false }: { mobile?: boolean }) {
  const { unread, error, version } = useInbox();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Page | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const date = useDateTime();
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds)
      setPosition({
        top: bounds.bottom + 12,
        left: Math.max(16, Math.min(bounds.left, window.innerWidth - 368)),
      });
    setFailed(false);
    void workRead<Page>("/api/notifications/inbox?limit=5")
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    function outside(event: PointerEvent) {
      if (
        !ref.current?.contains(event.target as Node) &&
        !preview.current?.contains(event.target as Node)
      )
        setOpen(false);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open, version, retry]);
  return (
    <div
      ref={ref}
      className={
        mobile
          ? "fixed right-4 top-[calc(var(--shell-top,0px)+1rem)] z-40 md:hidden"
          : "relative hidden md:block"
      }
    >
      <button
        className={`${button} relative bg-card-bg`}
        aria-label={`Notifications${unread === null ? "" : `, ${unread} unread`}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <BellIcon className="h-5 w-5" />
        {!!unread && (
          <span className="absolute -right-2 -top-2 rounded-full bg-blue-600 px-1.5 text-xs text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        {error && (
          <span title="Inbox temporarily unavailable" className="text-amber-400">
            !
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <section
            ref={preview}
            style={{ top: position.top, left: position.left }}
            aria-label="Recent notifications"
            className={`fixed z-50 max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-card-border bg-card-bg p-4 shadow-2xl`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Notifications</h2>
              <Link
                href="/settings/notifications"
                onClick={() => setOpen(false)}
                className="text-sm text-blue-400"
              >
                Settings
              </Link>
            </div>
            {failed ? (
              <button onClick={() => setRetry(retry + 1)} className={button}>
                Unable to load. Retry
              </button>
            ) : !data ? (
              <p role="status">Loading reminders…</p>
            ) : !data.items.length ? (
              <p className="text-sm text-muted">You’re all caught up.</p>
            ) : (
              <div className="divide-y divide-card-border">
                {data.items.map((item) => (
                  <Link
                    href={`/notifications/${item.id}`}
                    key={item.id}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 py-3 hover:bg-white/5"
                  >
                    <span style={{ color: item.color || "#60a5fa" }}>
                      <ReminderIcon category={item.category} />
                    </span>
                    <div className="min-w-0">
                      <p className={item.readAt ? "text-sm" : "text-sm font-semibold"}>
                        {item.titleSnapshot}
                      </p>
                      <p className="text-xs text-muted">
                        {item.labelSnapshot} · {date.formatInstant(item.targetAt)}
                      </p>
                    </div>
                    {!item.readAt && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                    )}
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/notifications"
              className={`${button} mt-3 w-full`}
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </section>,
          document.body,
        )}
    </div>
  );
}

function ReminderCard({ item, changed }: { item: Reminder; changed: () => void }) {
  const date = useDateTime();
  const { showMessage } = useSnackbar();
  const { refresh } = useInbox();
  const router = useRouter();
  const [write] = useState(createWorkWriter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snooze, setSnooze] = useState(false);
  const [local, setLocal] = useState("");
  const [occurrence, setOccurrence] = useState("");
  const repeated = local ? repeatedTimeChoices(local, date.timeZone) : null;
  async function act(action: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await write(
        `/api/notifications/inbox/${item.id}${action === "snooze" ? "/snooze" : ""}`,
        action === "snooze" ? "POST" : "PATCH",
        body ?? { action },
        item.revision,
      );
      setSnooze(false);
      refresh();
      changed();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function openSource() {
    setBusy(true);
    setError("");
    try {
      const current = await workRead<Reminder>(`/api/notifications/inbox/${item.id}`);
      if (!current.url) {
        setError("This source was removed or rescheduled. The reminder remains in history.");
        changed();
        return;
      }
      try {
        await write(
          `/api/notifications/inbox/${item.id}`,
          "PATCH",
          { action: "read" },
          current.revision,
        );
        refresh();
      } catch {
        showMessage("Unable to mark the reminder read. You can retry from the inbox.");
      }
      router.push(current.url);
    } catch {
      setError("Unable to open this reminder. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const active = item.lifecycle === "ACTIVE";
  return (
    <article
      className={`min-w-0 rounded-xl border bg-card-bg p-4 sm:p-5 ${!item.readAt && active && !item.dismissedAt ? "border-blue-500/60" : "border-card-border"}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1" style={{ color: item.color || "#60a5fa" }}>
          <ReminderIcon category={item.category} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: item.color || "#93c5fd" }}>{item.labelSnapshot}</span>
            <span className="text-muted">{item.readAt ? "Read" : "Unread"}</span>
            {item.dismissedAt && <span className="text-muted">Dismissed</span>}
          </div>
          <h2 className="mt-1 break-words text-lg font-semibold">{item.titleSnapshot}</h2>
          <p className="mt-1 text-sm">
            {item.sourceDate
              ? new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(
                  new Date(`${item.sourceDate}T12:00:00Z`),
                )
              : date.formatInstant(item.targetAt)}
          </p>
          {new Date(item.createdAt).getTime() - new Date(item.dueAt).getTime() > 15 * 60000 && (
            <p className="mt-1 text-xs text-amber-300">Recovered after reminder downtime</p>
          )}
          {item.snoozedUntil && (
            <p className="mt-2 text-sm text-blue-300">
              Remind me {date.formatInstant(item.snoozedUntil)}
            </p>
          )}
          {item.retiredReason && (
            <p className="mt-2 text-sm text-muted">
              {item.retiredReason.toLowerCase().replaceAll("_", " ")}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.url && (
          <button
            disabled={busy}
            className={`${button} border-blue-400/50 text-blue-300`}
            onClick={openSource}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            Open source
          </button>
        )}
        <button
          disabled={busy}
          className={button}
          onClick={() => act(item.readAt ? "unread" : "read")}
        >
          {item.readAt ? "Mark unread" : "Mark read"}
        </button>
        {active && !item.dismissedAt && (
          <button disabled={busy} className={button} onClick={() => setSnooze(true)}>
            Remind me later
          </button>
        )}
        <button
          disabled={busy}
          className={button}
          onClick={() => act(item.dismissedAt ? "undo" : "dismiss")}
        >
          {item.dismissedAt ? "Undo dismissal" : "Dismiss"}
        </button>
      </div>
      {error && (
        <div role="alert" className="mt-3 text-sm text-red-400">
          {error}{" "}
          <button onClick={changed} className="underline">
            Reload
          </button>
        </div>
      )}
      {!!item.deliveries.length && (
        <details className="mt-4 text-xs text-muted">
          <summary className="cursor-pointer">Push delivery details</summary>
          <ul className="mt-2 space-y-2">
            {item.deliveries.map((delivery, index) => (
              <li key={index}>
                {delivery.status === "SENT"
                  ? "Accepted by push service"
                  : delivery.status === "FAILED"
                    ? "Push failed"
                    : delivery.status === "SKIPPED"
                      ? "Push skipped"
                      : "Push queued"}{" "}
                on {delivery.device}
                {delivery.sentAt ? ` · ${date.formatInstant(delivery.sentAt)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      <TaskModal open={snooze} title="Remind me later" busy={busy} onClose={() => setSnooze(false)}>
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy}
            className={button}
            onClick={() => act("snooze", { preset: "hour" })}
          >
            In one hour
          </button>
          <button
            disabled={busy}
            className={button}
            onClick={() => act("snooze", { preset: "tomorrow" })}
          >
            Tomorrow at 9 a.m.
          </button>
        </div>
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void act("snooze", { local, occurrence });
          }}
        >
          <label className="block text-sm">
            Choose a date and time
            <input
              required
              type="datetime-local"
              step="60"
              value={local}
              onChange={(event) => {
                setLocal(event.target.value);
                setOccurrence("");
              }}
              className="mt-2 block w-full rounded border border-card-border bg-background p-2"
            />
          </label>
          {repeated && (
            <label className="block text-sm">
              This clock time happens twice when daylight saving ends.
              <select
                required
                value={occurrence}
                onChange={(event) => setOccurrence(event.target.value)}
                className="mt-2 w-full rounded border border-card-border bg-background p-2"
              >
                <option value="">Choose which occurrence</option>
                {repeated.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-muted">
            Uses your dashboard timezone. Choose a time within 30 days; the source date stays the
            same.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <button disabled={busy} className={button}>
            Save reminder
          </button>
        </form>
      </TaskModal>
    </article>
  );
}

export default function NotificationInbox({ id }: { id?: string }) {
  const { version, refresh } = useInbox();
  const [view, setView] = useState<(typeof views)[number]>("active");
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [undo, setUndo] = useState<Reminder | null>(null);
  const [write] = useState(createWorkWriter);
  const { showMessage } = useSnackbar();
  const request = useRef(0);
  const changed = () => setRetry((value) => value + 1);
  useEffect(() => {
    const generation = ++request.current;
    setLoading(true);
    setError("");
    const task = id
      ? workRead<Reminder>(`/api/notifications/inbox/${id}`).then((item) => ({
          items: [item],
          unread: 0,
          cutoff: new Date().toISOString(),
          nextCursor: null,
        }))
      : workRead<Page>(`/api/notifications/inbox?view=${view}`);
    void task
      .then((value) => {
        if (request.current === generation) {
          setData(value);
        }
      })
      .catch((failure) => {
        if (request.current === generation) setError(failure.message);
      })
      .finally(() => {
        if (request.current === generation) setLoading(false);
      });
    return () => {
      request.current = generation + 1;
    };
  }, [id, view, version, retry]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(timer);
  }, [undo]);
  async function loadMore() {
    if (!data?.nextCursor) return;
    const generation = request.current;
    setLoading(true);
    try {
      const next = await workRead<Page>(
        `/api/notifications/inbox?view=${view}&cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      if (generation === request.current)
        setData({ ...next, cutoff: data.cutoff, items: [...data.items, ...next.items] });
    } catch {
      setError("Unable to load more reminders. Try again.");
    } finally {
      if (generation === request.current) setLoading(false);
    }
  }
  async function markAll() {
    if (!data) return;
    setBusy(true);
    try {
      await write("/api/notifications/inbox/read-all", "POST", { cutoff: data.cutoff });
      refresh();
      showMessage("Notifications marked read.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{id ? "Reminder" : "Notifications"}</h1>
        <div className="flex flex-wrap gap-2">
          {id && (
            <Link className={button} href="/notifications">
              ← Inbox
            </Link>
          )}
          <Link className={button} href="/settings/notifications">
            Notification settings
          </Link>
          {!id && (
            <button disabled={busy || !data || !data.unread} onClick={markAll} className={button}>
              Mark all read
            </button>
          )}
        </div>
      </header>
      {!id && (
        <nav aria-label="Inbox views" className="flex flex-wrap gap-2">
          {views.map((value) => (
            <button
              key={value}
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                setData(null);
              }}
              className={`${button} capitalize ${view === value ? "border-blue-400 bg-blue-500/10 text-blue-300" : ""}`}
            >
              {value}
            </button>
          ))}
        </nav>
      )}
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 p-4 text-red-300">
          {error}{" "}
          <button onClick={changed} className="underline">
            Retry
          </button>
        </div>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted">
          Loading reminders…
        </p>
      )}
      {!loading && data && !data.items.length && (
        <div className="rounded-xl border border-card-border bg-card-bg p-8 text-center">
          {view === "active" || view === "unread"
            ? "You’re all caught up."
            : "No reminders in this view."}
        </div>
      )}
      {undo && (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-card-border p-3"
        >
          Reminder dismissed.
          <button
            className={button}
            onClick={async () => {
              try {
                await write(
                  `/api/notifications/inbox/${undo.id}`,
                  "PATCH",
                  { action: "undo" },
                  undo.revision,
                );
                refresh();
              } catch {
                setError("Unable to undo. Open History to retry.");
              }
            }}
          >
            Undo
          </button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.items.map((item) => (
          <ReminderCard
            key={`${item.id}:${item.revision}`}
            item={item}
            changed={() => {
              void workRead<Reminder>(`/api/notifications/inbox/${item.id}`)
                .then((updated) => {
                  if (updated.dismissedAt && !item.dismissedAt) setUndo(updated);
                })
                .catch(() => {});
              changed();
            }}
          />
        ))}
      </div>
      {data?.nextCursor && (
        <button disabled={loading} onClick={loadMore} className={button}>
          Load more
        </button>
      )}
    </div>
  );
}
