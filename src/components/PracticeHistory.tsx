"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PracticeOverview from "./PracticeOverview";
import type { PracticeSessionReview, PracticeSessionSummary } from "@/lib/japanese/practice-session-types";
import { formatPracticeDuration } from "@/lib/japanese/practice-session-types";
import { torontoDateKey } from "@/lib/japanese/dates";

const backButtonClassName = "inline-flex items-center justify-center gap-2 rounded-lg border border-card-border bg-card-bg px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-blue-500 hover:bg-blue-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
const overviewButtonClassName = "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";

function useHistoryData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error(result?.error || "Unable to load practice history. Please try again.");
        if (!controller.signal.aborted) setData(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load practice history.");
      }
    }
    void load();
    return () => controller.abort();
  }, [url, attempt]);
  return { data, error, retry: () => setAttempt(value => value + 1) };
}

function LoadState({ error, retry }: { error: string; retry: () => void }) {
  return <div className="card space-y-3">{error ? <><p role="alert" className="text-rose-500">{error}</p><button type="button" onClick={retry} className="rounded-lg border border-card-border px-4 py-2">Retry</button></> : <p role="status">Loading practice history…</p>}</div>;
}

export default function PracticeHistory({ date, kind, range }: { date: string; kind: string; range: string }) {
  const query = new URLSearchParams({ date, kind, range });
  const { data, error, retry } = useHistoryData<{ sessions: PracticeSessionSummary[] }>(`/api/japanese-practice/practice-sessions?${query}`);
  const groups = new Map<string, PracticeSessionSummary[]>();
  for (const session of data?.sessions ?? []) {
    const day = torontoDateKey(new Date(session.date));
    groups.set(day, [...(groups.get(day) ?? []), session]);
  }
  const labelDate = new Date(`${date}T12:00:00Z`);
  const titleDate = Number.isFinite(labelDate.getTime()) ? labelDate.toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "long", ...(range === "month" ? {} : { day: "numeric" }), year: "numeric" }) : date;
  return <div className="w-full max-w-6xl mx-auto p-2 md:p-6 space-y-6">
    <Link href="/japanese/statistics" className={backButtonClassName}>← Japanese Statistics</Link>
    <header><h1 className="text-3xl font-bold">{kind === "kanji" ? "Kanji writing" : "Vocabulary"} practice history</h1><p className="mt-2 text-lg text-gray-500">{titleDate}</p></header>
    {data ? <>
      <div className="flex flex-wrap gap-3">
        <span className="rounded-lg border border-card-border px-4 py-2">{data.sessions.length} sessions</span>
        <span className="rounded-lg border border-card-border px-4 py-2">{data.sessions.reduce((sum, session) => sum + session.wordCount, 0)} words practiced</span>
      </div>
      {data.sessions.length === 0 && <p className="card text-gray-500">No saved practice sessions for this {range === "month" ? "month" : "day"}.</p>}
      {[...groups].map(([day, sessions]) => <section key={day} className="space-y-3">
        {range === "month" && <h2 className="text-lg font-semibold">{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "America/Toronto", dateStyle: "long" })}</h2>}
        {sessions.map(session => <article key={session.id} className="card">
          <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{session.activityName}</h2><span className="text-sm text-gray-500">{new Date(session.date).toLocaleTimeString("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit" })}</span></div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>{session.wordCount} words</span><span>{formatPracticeDuration(session.durationSeconds)}</span>{session.averageBefore !== null && session.averageAfter !== null && <span>Average {session.averageBefore.toFixed(2)}% → {session.averageAfter.toFixed(2)}%</span>}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span className="rounded-full bg-rose-500/10 px-3 py-1 text-rose-500">{session.weakCount} weak</span><span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-500">{session.goodCount} good</span><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-500">{session.perfectCount} perfect</span><Link href={`/japanese/practice/history/${session.id}`} className={`ml-auto ${overviewButtonClassName}`}>View overview →</Link></div>
          {!session.hasDetails && <p className="mt-3 text-xs text-gray-500">Older practice · totals only</p>}
        </article>)}
      </section>)}
    </> : <LoadState error={error} retry={retry} />}
  </div>;
}

export function SavedPracticeOverview({ id }: { id: string }) {
  const { data, error, retry } = useHistoryData<{ review: PracticeSessionReview }>(`/api/japanese-practice/practice-sessions/${encodeURIComponent(id)}`);
  const review = data?.review;
  const historyUrl = review ? `/japanese/practice/history?${new URLSearchParams({ date: torontoDateKey(new Date(review.date)), kind: review.activityId === 5 ? "kanji" : "vocab", range: "day" })}` : "/japanese/statistics";
  const back = <Link href={historyUrl} className={backButtonClassName}>← Practice history</Link>;
  return review ? <PracticeOverview review={review} navigation={back} /> : <div className="space-y-6">{back}<LoadState error={error} retry={retry} /></div>;
}
