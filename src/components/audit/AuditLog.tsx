"use client";
import { twoDecimalAmount } from "@/lib/finance/transactions";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ClockIcon,
  BanknotesIcon,
  BookOpenIcon,
  UsersIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  LanguageIcon,
  BellIcon,
  EnvelopeIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useDateTime, useSettings } from "@/context/SettingsContext";
import TaskModal from "@/components/shared/TaskModal";

type Entry = {
  id: string;
  occurredAt: string;
  category: string;
  action: string;
  outcome: string;
  entityType: string;
  entityReference: string;
  summary: string;
  actorKind: string;
};
type Detail = Entry & {
  changes: Record<string, unknown>;
  href: string | null;
  sourceState: string;
  relatedLinks: { type: string; id: string; href: string }[];
};
const categories = [
  "WORK",
  "CALENDAR",
  "FINANCE",
  "PEOPLE",
  "KNOWLEDGE",
  "JAPANESE",
  "SETTINGS",
  "NOTIFICATIONS",
  "EMAIL",
  "AUTH",
  "SYSTEM",
];
const outcomes = ["SUCCESS", "DENIED", "FAILED", "QUEUED", "ACCEPTED", "UNKNOWN", "SKIPPED"];
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40";
const field = "min-h-11 w-full rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm";
const icons = {
  WORK: ClockIcon,
  CALENDAR: CalendarDaysIcon,
  FINANCE: BanknotesIcon,
  PEOPLE: UsersIcon,
  KNOWLEDGE: BookOpenIcon,
  JAPANESE: LanguageIcon,
  SETTINGS: Cog6ToothIcon,
  NOTIFICATIONS: BellIcon,
  EMAIL: EnvelopeIcon,
  AUTH: ShieldCheckIcon,
  SYSTEM: Cog6ToothIcon,
};
const label = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toUpperCase());
const empty = { from: "", to: "", category: "", outcome: "", action: "", search: "" };
function display(value: unknown) {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" ? value : JSON.stringify(value);
}
export default function AuditLog() {
  const { timeZone } = useSettings(),
    date = useDateTime();
  const [draft, setDraft] = useState(empty),
    [applied, setApplied] = useState(empty),
    [filtersOpen, setFiltersOpen] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{
      items: Entry[];
      nextCursor: string | null;
      startedAt: string | null;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [detailError, setDetailError] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const from = new Date(`${today}T12:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 29);
    const defaults = { ...empty, from: from.toISOString().slice(0, 10), to: today };
    setDraft(defaults);
    setApplied(defaults);
  }, [timeZone]);
  const body = JSON.stringify({ ...applied, cursor: cursors[page] ?? "" });
  useEffect(() => {
    if (!applied.from) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    void fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          window.location.assign(response.status === 403 ? "/access-denied" : "/api/auth/signin");
          throw new Error("Access is no longer available.");
        }
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Unable to load logs.");
        if (!controller.signal.aborted) setData(json);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message || "Unable to load logs.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [body, refresh, applied.from]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    void fetch(`/api/logs/${selected.id}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setData(null);
          setSelected(null);
          setDetail(null);
          window.location.assign(response.status === 403 ? "/access-denied" : "/api/auth/signin");
          return;
        }
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Unable to load entry.");
        if (!controller.signal.aborted) setDetail(json);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setDetailError(failure.message);
      });
    return () => controller.abort();
  }, [selected]);
  function formatValue(key: string, value: unknown) {
    if (typeof value === "string") {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return date.formatInstant(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value))
        return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(
          new Date(`${value}T12:00:00Z`),
        );
      if (/amount|balance|subtotal|tax|tip|total/i.test(key) && /^-?\d+\.\d+$/.test(value))
        return twoDecimalAmount(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    return display(value);
  }
  function resetPage() {
    setPage(0);
    setCursors([null]);
  }
  return (
    <div className="w-full min-w-0 space-y-5 pt-12 md:pt-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClockIcon className="h-7 w-7 text-blue-400" />
          Logs
        </h1>
        <div className="flex gap-2">
          <button
            className={button}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4" />
            Search and filters
          </button>
          <button
            className={button}
            onClick={() => {
              resetPage();
              setRefresh((value) => value + 1);
            }}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh logs
          </button>
        </div>
      </header>
      {filtersOpen && (
        <form
          className="card grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({ ...draft });
            resetPage();
            setRefresh((value) => value + 1);
          }}
        >
          <label className="space-y-1 text-sm">
            From
            <input
              className={field}
              type="date"
              required
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            To
            <input
              className={field}
              type="date"
              required
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            Module
            <select
              className={field}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              <option value="">All modules</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Outcome
            <select
              className={field}
              value={draft.outcome}
              onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
            >
              <option value="">All outcomes</option>
              {outcomes.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Reference or summary
            <input
              className={field}
              maxLength={120}
              value={draft.search}
              onChange={(e) => setDraft({ ...draft, search: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            Action
            <input
              className={field}
              maxLength={100}
              placeholder="Exact action, or leave blank"
              value={draft.action}
              onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            />
          </label>
          <button className={`${button} self-end border-blue-500/40`}>Apply filters</button>
          <button
            type="button"
            className={`${button} self-end`}
            onClick={() => {
              const value = { ...draft, category: "", outcome: "", search: "", action: "" };
              setDraft(value);
              setApplied(value);
              resetPage();
            }}
          >
            Clear filters
          </button>
        </form>
      )}
      {data?.startedAt && (
        <p className="text-sm text-muted">
          Recording started {date.formatInstant(data.startedAt)} · Older activity was not
          reconstructed.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="card flex flex-wrap items-center justify-between gap-3 text-rose-300"
        >
          {error}
          <button className={button} onClick={() => setRefresh((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}
      {loading && <p role="status">Loading logs…</p>}
      {data && !data.items.length && (
        <div className="card py-10 text-center text-muted">
          No recorded activity matches these filters.
        </div>
      )}
      <ul className="space-y-3">
        {data?.items.map((entry) => {
          const Icon = icons[entry.category as keyof typeof icons] ?? ClockIcon;
          return (
            <li key={entry.id}>
              <button
                className="card flex w-full min-w-0 items-start gap-4 text-left transition-colors hover:border-blue-500/50 focus-visible:outline-2 focus-visible:outline-blue-500"
                onClick={() => setSelected(entry)}
              >
                <span
                  className={`rounded-xl p-3 ${["DENIED", "FAILED"].includes(entry.outcome) ? "bg-rose-500/10 text-rose-300" : "bg-blue-500/10 text-blue-300"}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block break-words font-semibold">{entry.summary}</span>
                  <span className="block break-words text-sm text-muted">
                    {entry.entityReference} · {label(entry.category)}
                  </span>
                  <span className="block text-xs text-muted">
                    {date.formatInstant(entry.occurredAt)} ·{" "}
                    {entry.actorKind === "OWNER"
                      ? "You"
                      : entry.actorKind === "SYSTEM"
                        ? "System"
                        : entry.actorKind === "USER"
                          ? "Member"
                          : "Unauthenticated attempt"}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-card-border px-2 py-1 text-xs">
                  {entry.outcome === "ACCEPTED" ? "Provider accepted" : label(entry.outcome)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {data && (
        <nav className="flex flex-wrap items-center gap-3" aria-label="Log pages">
          <button
            className={button}
            disabled={!page || loading}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-muted">Page {page + 1}</span>
          <button
            className={button}
            disabled={!data.nextCursor || loading}
            onClick={() => {
              setCursors((current) => [...current.slice(0, page + 1), data.nextCursor]);
              setPage((value) => value + 1);
            }}
          >
            Next
          </button>
        </nav>
      )}
      <TaskModal open={!!selected} title="Activity details" onClose={() => setSelected(null)}>
        {detailError ? (
          <p role="alert" className="text-rose-300">
            {detailError}
          </p>
        ) : !detail ? (
          <p role="status">Loading entry…</p>
        ) : (
          <div className="min-w-0 space-y-4">
            <p className="font-semibold">{detail.summary}</p>
            <p className="break-words text-sm text-muted">
              {detail.entityReference} · {date.formatInstant(detail.occurredAt)}
            </p>
            <p className="break-words text-xs text-muted">
              {detail.action} · {label(detail.outcome)}
            </p>
            <dl className="max-h-[45dvh] space-y-3 overflow-y-auto">
              {Object.entries(detail.changes)
                .filter(([key]) => key !== "related")
                .map(([key, value]) => {
                  const change = value as { changed?: boolean; before?: unknown; after?: unknown };
                  return (
                    <div key={key} className="rounded-lg border border-card-border p-3">
                      <dt className="text-sm font-semibold">{key.replace(/([A-Z])/g, " $1")}</dt>
                      <dd className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
                        {change.changed
                          ? "Content changed"
                          : `${formatValue(key, change.before)} → ${formatValue(key, change.after)}`}
                      </dd>
                    </div>
                  );
                })}
            </dl>
            {detail.sourceState === "deleted" && (
              <p className="text-amber-300">Record deleted. This history is retained.</p>
            )}
            {detail.href && (
              <Link
                className={`${button} border-blue-500/40`}
                href={detail.href}
                onClick={() => setSelected(null)}
              >
                Open record
              </Link>
            )}
            {detail.relatedLinks.map((link, index) => (
              <Link
                key={`${link.type}:${link.id}:${index}`}
                href={link.href}
                className={`${button} mr-2`}
                onClick={() => setSelected(null)}
              >
                Open {link.type} #{link.id}
              </Link>
            ))}
          </div>
        )}
      </TaskModal>
    </div>
  );
}
