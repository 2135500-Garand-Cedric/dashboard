"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { PracticeSessionReview, PracticeStatus } from "@/lib/japanese/practice-session-types";
import { formatPracticeDuration } from "@/lib/japanese/practice-session-types";

const statuses: { status: PracticeStatus; label: string; count: "weakCount" | "goodCount" | "perfectCount"; color: string; background: string }[] = [
  { status: "WEAK", label: "Weak", count: "weakCount", color: "text-rose-500", background: "bg-rose-500/10" },
  { status: "GOOD", label: "Good", count: "goodCount", color: "text-amber-500", background: "bg-amber-500/10" },
  { status: "PERFECT", label: "Perfect", count: "perfectCount", color: "text-emerald-500", background: "bg-emerald-500/10" },
];
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
const timestamp = (date: string) => new Date(date).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });

export default function PracticeOverview({ review, actions, navigation }: { review: PracticeSessionReview; actions?: ReactNode; navigation?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const main = container.closest("main");
    const banner = document.querySelector("[data-development-banner]");
    if (window.scrollY > 0) window.scrollTo(0, 0);
    const resize = () => {
      const top = container.getBoundingClientRect().top;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const bottomPadding = main ? parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
      container.style.setProperty("--practice-overview-height", `${Math.max(0, viewportHeight - top - bottomPadding)}px`);
      container.style.paddingTop = `${Math.max(0, (banner?.getBoundingClientRect().bottom ?? 0) - top)}px`;
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (main) observer?.observe(main);
    if (banner) observer?.observe(banner);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);
  const change = review.averageBefore !== null && review.averageAfter !== null ? review.averageAfter - review.averageBefore : null;
  return (
    <div ref={containerRef} style={{ height: "var(--practice-overview-height, calc(100dvh - 3rem))" }} className="practice-overview flex min-h-0 w-full min-w-0 flex-col gap-3 md:gap-5">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 md:gap-4">
        {navigation && <div className="w-full sm:w-auto">{navigation}</div>}
        <h1 className="min-w-0 flex-1 text-xl font-bold md:text-3xl">Practice overview</h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <section aria-label="Practice information" className="card shrink-0 space-y-3 !bg-slate-800 !p-4 text-slate-100 md:!p-5">
        <h2 className="text-lg font-semibold text-white md:text-xl">{review.activityName}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
          <div><p className="text-sm text-slate-400">Total words</p><p className="mt-1 text-xl font-semibold md:text-3xl">{review.wordCount}</p></div>
          <div><p className="text-sm text-slate-400">Practice time</p><p className="mt-1 text-lg font-semibold md:text-2xl">{formatPracticeDuration(review.durationSeconds)}</p></div>
          <div><p className="text-sm text-slate-400">List average</p><p className="mt-1 text-base font-semibold md:text-xl">{review.averageBefore === null || review.averageAfter === null ? "Not recorded" : `${review.averageBefore.toFixed(2)}% → ${review.averageAfter.toFixed(2)}%`}</p></div>
          <div><p className="text-sm text-slate-400">Average change</p><p className={`mt-1 text-base font-semibold md:text-xl ${change !== null && change > 0 ? "text-emerald-500" : change !== null && change < 0 ? "text-rose-500" : ""}`}>{change === null ? "Not recorded" : `${signed(change)} percentage points`}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-700 pt-3 text-sm">
          <p><span className="text-slate-400">Started: </span>{review.startedAt ? timestamp(review.startedAt) : "Not recorded"}</p>
          <p><span className="text-slate-400">Finished: </span>{timestamp(review.completedAt ?? review.date)}</p>
          <p><span className="text-slate-400">Categories: </span>{review.selectedCategories === null ? "Not recorded" : review.selectedCategories.length ? review.selectedCategories.map(category => category.name).join(", ") : "All categories (no filter)"}</p>
          {review.hasDetails && <p><span className="text-slate-400">Starred only: </span>{review.starredOnly ? "Yes" : "No"}</p>}
        </div>
        {!review.hasDetails && <p className="text-sm text-slate-400">Detailed word results, timing, and average changes were not recorded for this older practice.</p>}
      </section>
      <div className="grid min-h-[18rem] flex-1 grid-cols-1 grid-rows-3 gap-3 md:min-h-[12rem] md:grid-cols-3 md:grid-rows-1 md:gap-5">
        {statuses.map(group => {
          const words = review.words?.filter(word => word.status === group.status);
          return <section key={group.status} className="card flex min-h-0 min-w-0 flex-col !p-0 overflow-hidden">
            <h2 className={`flex shrink-0 items-center justify-between p-2 text-lg font-semibold md:p-4 md:text-xl ${group.color} ${group.background}`}><span>{group.label}</span><span>{review[group.count]}</span></h2>
            {words && <ul tabIndex={0} aria-label={`${group.label} words`} style={{ scrollbarGutter: "stable", scrollbarWidth: "thin", scrollbarColor: "#64748b transparent" }} className="min-h-0 flex-1 divide-y divide-card-border overflow-y-auto overscroll-contain">
              {words.map(word => <li key={word.activityVocabId} className="p-3 space-y-1 break-words md:p-5"><p className="font-medium">{word.english}</p><p lang="ja" className="text-xl">{word.japanese}</p><p lang="ja" className="text-sm text-gray-500">{word.hiragana}</p>{word.categoryName && <p className="text-xs text-gray-500">{word.categoryName}</p>}</li>)}
            </ul>}
            {words?.length === 0 && <p className="p-5 text-sm text-gray-500">No words</p>}
          </section>;
        })}
      </div>
    </div>
  );
}
