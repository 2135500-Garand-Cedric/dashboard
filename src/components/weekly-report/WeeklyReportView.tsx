"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  AcademicCapIcon,
  BookOpenIcon,
  BanknotesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useDateTime } from "@/context/SettingsContext";
import { localToday } from "@/lib/work-management/date-format";
import { formatPracticeDuration } from "@/lib/japanese/practice-session-types";
import { displayAmount } from "@/lib/finance/transactions";
import { monday, shiftDay } from "@/lib/weekly-report/calendar";
import type { WeeklyReport } from "@/lib/weekly-report/server";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40";
const input = "min-h-11 min-w-0 rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm";

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function Section({
  title,
  icon,
  color,
  error,
  retry,
  children,
}: {
  title: string;
  icon: ReactNode;
  color: string;
  error: string | null;
  retry: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-xl border border-card-border bg-card-bg p-4 sm:p-5"
    >
      <h2 className={`mb-5 flex items-center gap-2 text-lg font-semibold ${color}`}>
        {icon}
        {title}
      </h2>
      {error ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-rose-400">{error}</p>
          <button type="button" className={button} onClick={retry}>
            Retry {title.toLowerCase()}
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  color = "text-foreground",
}: {
  label: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-white/[0.03] p-3 sm:p-4">
      <dt className="text-xs text-muted sm:text-sm">{label}</dt>
      <dd className={`mt-1 break-words text-2xl font-bold tabular-nums sm:text-3xl ${color}`}>
        {value}
      </dd>
    </div>
  );
}

function Practice({
  label,
  data,
}: {
  label: string;
  data: NonNullable<WeeklyReport["japanese"]["data"]>["vocab"];
}) {
  const statuses = [
    { label: "Weak", count: data.weak, color: "bg-rose-500", text: "text-rose-400" },
    { label: "Good", count: data.good, color: "bg-amber-500", text: "text-amber-400" },
    { label: "Perfect", count: data.perfect, color: "bg-emerald-500", text: "text-emerald-400" },
  ];
  const total = data.weak + data.good + data.perfect;
  return (
    <div
      aria-label={label}
      className="min-w-0 space-y-4 rounded-lg border border-card-border p-3 sm:p-4"
    >
      <h3 className="font-semibold">{label}</h3>
      <dl className="grid grid-cols-2 gap-2">
        <Stat label="Sessions" value={data.sessions} />
        <Stat label="Word reviews" value={data.reviews} />
      </dl>
      <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-white/5">
        {statuses.map((status) => (
          <span
            key={status.label}
            className={status.color}
            style={{ width: `${total ? (status.count / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        {statuses.map((status) => (
          <span className={status.text} key={status.label}>
            {status.label} {status.count}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-card-border pt-3">
        <div>
          <p className="text-xs text-muted">Practice time</p>
          <p className="mt-1 text-sm font-medium">
            {formatPracticeDuration(data.durationSeconds)}
            {data.partialTime && data.durationSeconds !== null ? " (partial)" : ""}
          </p>
        </div>
        <div title="Sum of measured session changes in the list average, in percentage points. Not the list’s net weekly change.">
          <p className="text-xs text-muted">Practice impact</p>
          <p
            className={`mt-1 text-lg font-semibold ${data.impact !== null && data.impact > 0 ? "text-emerald-400" : ""}`}
          >
            {data.impact === null
              ? "Not recorded"
              : `${data.impact > 0 ? "+" : ""}${data.impact.toFixed(2)} pp`}
            {data.partialImpact && data.impact !== null ? (
              <span className="ml-1 text-xs text-muted">(partial)</span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WeeklyReportView() {
  const [navigating, startTransition] = useTransition();
  const params = useSearchParams(),
    router = useRouter();
  const { timeZone } = useDateTime();
  const current = monday(localToday(new Date(), timeZone));
  const latest = shiftDay(current, -7);
  const requestedWeek = params.get("week");
  const week = requestedWeek && requestedWeek < current ? requestedWeek : latest,
    currency = "CAD",
    dataset = "all";
  const controlWeek =
    /^\d{4}-\d\d-\d\d$/.test(week) && Number.isFinite(Date.parse(`${week}T12:00:00Z`))
      ? week
      : latest;
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const refresh = () => setRetry((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setError("");
    void fetch(`/api/weekly-report?${new URLSearchParams({ week, currency, dataset })}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load the weekly report.");
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) setReport(data);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(failure.message || "Unable to load the weekly report.");
      });
    return () => controller.abort();
  }, [week, currency, dataset, timeZone, retry]);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams({ week, ...values });
    startTransition(() => router.replace(`/weekly-report?${next}`, { scroll: false }));
  }
  const range = report?.period;
  const finance = report?.finance.data;
  const money = (amount: string) =>
    displayAmount(amount, report!.period.currency).replace(/^\+/, "");
  const largestFlow = finance
    ? Math.max(
        Math.abs(Number(finance.totals.income)),
        Math.abs(Number(finance.totals.expenses)),
        1,
      )
    : 1;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarDaysIcon className="h-7 w-7 text-blue-400" />
            Weekly report
          </h1>
          {range && (
            <p className="mt-2 text-sm text-muted">
              {dayLabel(range.week)} – {dayLabel(range.lastDay)}
            </p>
          )}
        </div>
      </header>
      <nav aria-label="Report week" className="flex flex-wrap items-center gap-2">
        <button
          className={button}
          type="button"
          disabled={navigating || controlWeek === latest}
          onClick={() => change({ week: latest })}
        >
          Last completed week
        </button>
        <button
          className={button}
          type="button"
          aria-label="Earlier week"
          disabled={navigating}
          onClick={() => change({ week: shiftDay(controlWeek, -7) })}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <input
          aria-label="Week starting"
          type="date"
          className={input}
          disabled={navigating}
          value={controlWeek}
          max={latest}
          onChange={(event) => {
            if (/^\d{4}-\d\d-\d\d$/.test(event.target.value)) {
              const selected = monday(event.target.value);
              if (selected <= latest) change({ week: selected });
            }
          }}
        />
        <button
          className={button}
          type="button"
          aria-label="Later week"
          disabled={navigating || controlWeek >= latest}
          onClick={() => change({ week: shiftDay(controlWeek, 7) })}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </nav>
      {error ? (
        <div role="alert" className="rounded-xl border border-rose-500/40 p-5">
          <p className="mb-3 text-rose-400">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button className={button} onClick={refresh}>
              Retry report
            </button>
            <button className={button} onClick={() => change({ week: latest })}>
              Reset report
            </button>
          </div>
        </div>
      ) : !report ? (
        <p role="status">Loading weekly report…</p>
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <Section
            title="Work"
            icon={<ClipboardDocumentCheckIcon className="h-5 w-5" />}
            color="text-blue-300"
            error={report.work.error}
            retry={refresh}
          >
            {report.work.data && (
              <>
                <div className="mb-5 rounded-xl bg-blue-400/10 p-5">
                  <p className="text-5xl font-bold tabular-nums text-blue-300">
                    {report.work.data.completed.total}
                  </p>
                  <p className="mt-2 font-medium">Tasks completed</p>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Reopened"
                    value={report.work.data.reopened.total}
                    color="text-amber-300"
                  />
                  <Stat
                    label="Cancelled"
                    value={report.work.data.cancelled.total}
                    color="text-muted"
                  />
                </dl>
                {!report.work.data.completed.total &&
                  !report.work.data.reopened.total &&
                  !report.work.data.cancelled.total && (
                    <p className="mt-3 text-sm text-muted">No task activity this week.</p>
                  )}
              </>
            )}
          </Section>
          <Section
            title="Knowledge"
            icon={<BookOpenIcon className="h-5 w-5" />}
            color="text-violet-300"
            error={report.knowledge.error}
            retry={refresh}
          >
            {report.knowledge.data && (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Articles created"
                    value={report.knowledge.data.created.total}
                    color="text-violet-300"
                  />
                  <Stat
                    label="Articles updated"
                    value={report.knowledge.data.changed.total}
                    color="text-violet-300"
                  />
                </dl>
                {report.knowledge.data.created.total + report.knowledge.data.changed.total ===
                  0 && (
                  <p className="mt-4 text-sm text-muted">
                    No articles created or updated this week.
                  </p>
                )}
              </>
            )}
          </Section>
          <div className="min-w-0 lg:col-span-2">
            <Section
              title="Japanese practice"
              icon={<AcademicCapIcon className="h-5 w-5" />}
              color="text-rose-300"
              error={report.japanese.error}
              retry={refresh}
            >
              {report.japanese.data && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Practice label="Vocabulary" data={report.japanese.data.vocab} />
                  <Practice label="Kanji writing" data={report.japanese.data.kanji} />
                </div>
              )}
            </Section>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <Section
              title="Finance"
              icon={<BanknotesIcon className="h-5 w-5" />}
              color="text-emerald-300"
              error={report.finance.error}
              retry={refresh}
            >
              {finance && (
                <>
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <Stat
                      label="Income received"
                      value={money(finance.totals.income)}
                      color="text-emerald-400"
                    />
                    <Stat
                      label="Spent after refunds"
                      value={money(finance.totals.expenses)}
                      color="text-rose-400"
                    />
                    <Stat
                      label="Net cash flow"
                      value={money(finance.totals.net)}
                      color={Number(finance.totals.net) >= 0 ? "text-emerald-400" : "text-rose-400"}
                    />
                  </dl>
                  <div aria-hidden="true" className="mt-4 space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${(Math.abs(Number(finance.totals.income)) / largestFlow) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{
                          width: `${(Math.abs(Number(finance.totals.expenses)) / largestFlow) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      {finance.unmatched.total} awaiting statement match
                    </p>
                    <Link href={finance.overviewHref} className={`${button} border-emerald-400/40`}>
                      Open finance
                    </Link>
                  </div>
                  {Number(finance.totals.adjustments) !== 0 && (
                    <p className="mt-3 text-xs text-muted">
                      Cash flow includes {money(finance.totals.adjustments)} in adjustments.
                    </p>
                  )}
                  {!finance.totals.count && (
                    <p className="mt-2 text-sm text-muted">No financial activity this week.</p>
                  )}
                </>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
