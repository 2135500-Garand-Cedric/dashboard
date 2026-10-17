"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import type { JapaneseStatistics, StatisticsPeriod } from "@/lib/japanese/statistics";

const colors = { perfect: "#10b981", good: "#f59e0b", weak: "#f43f5e" };
const categoryColors = ["#3b82f6", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];
const tooltipStyle = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "0.75rem", color: "var(--foreground)" };
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" });

const monthLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", year: "2-digit" });

function PeriodBars({ data, title, period }: { period: StatisticsPeriod; data: { date: string; perfect: number; good: number; weak: number }[]; title: string }) {
  const formatDate = period === "year" ? monthLabel : shortDate;
  return (
    <section className="card min-w-0">
      <h2 className="text-lg font-semibold mb-6">{title}</h2>
      <div className="h-72 2xl:h-80" role="img" aria-label={`${title}, ${period === "year" ? "monthly totals for the last 12 months" : "daily totals for the last 30 days"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }} accessibilityLayer>
            <CartesianGrid stroke="var(--card-border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28} tick={{ fill: "var(--foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatDate(String(label))} cursor={{ fill: "var(--card-border)", opacity: 0.4 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Bar dataKey="perfect" name="Perfect" stackId="day" fill={colors.perfect} maxBarSize={22} />
            <Bar dataKey="good" name="Good" stackId="day" fill={colors.good} maxBarSize={22} />
            <Bar dataKey="weak" name="Weak" stackId="day" fill={colors.weak} maxBarSize={22} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function JapaneseStatisticsPage() {
  const [period, setPeriod] = useState<StatisticsPeriod>("month");
  const [storedData, setData] = useState<JapaneseStatistics | null>(null);
  const data = storedData?.period === period ? storedData : null;
  const formatDate = period === "year" ? monthLabel : shortDate;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/japanese-practice/statistics?period=${period}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Unable to load Japanese statistics. Please try again.");
      setData(await response.json());
    } catch (error) {
      if (signal?.aborted) return;
      setError(error instanceof Error ? error.message : "Unable to load Japanese statistics.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [period]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="p-2 md:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Japanese Statistics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-card-border p-1" role="group" aria-label="Statistics period">
            {(["month", "year"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={period === option} onClick={() => setPeriod(option)}
                className={`rounded-md px-4 py-2 font-medium cursor-pointer transition-colors ${period === option ? "bg-blue-600 text-white" : "hover:bg-accent/10"}`}>
                {option === "month" ? "Month" : "Year"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="border border-card-border rounded-lg px-4 py-2 hover:bg-accent/10 disabled:opacity-50 cursor-pointer">{loading ? "Loading…" : "Refresh"}</button>
        </div>
      </header>
      {error && <div role="alert" className="card text-red-500">{error}</div>}
      {loading && !data && <div className="card animate-pulse text-gray-500">Loading your practice statistics…</div>}
      {data && <>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: "Vocabulary practiced", value: data.summary.practiced.toLocaleString(), color: "text-blue-500" },
            { label: "Kanji words practiced", value: data.summary.kanji.toLocaleString(), color: "text-violet-500" },
            { label: "Words added", value: data.summary.added.toLocaleString(), color: "text-emerald-500" },
            { label: "Current list average", value: `${data.summary.average.toFixed(2)}%`, color: "text-amber-500" },
          ].map((item) => <div key={item.label} className="card"><p className="text-sm text-gray-500">{item.label}</p><p className={`text-3xl font-bold mt-3 ${item.color}`}>{item.value}</p></div>)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <PeriodBars period={period} title="Vocabulary practice" data={data.days.map((day) => ({ date: day.date, ...day.vocab }))} />
          <PeriodBars period={period} title="Kanji writing practice" data={data.days.map((day) => ({ date: day.date, ...day.kanji }))} />
          <PeriodBars period={period} title="Words added" data={data.days.map((day) => ({ date: day.date, ...day.added }))} />
          <section className="card min-w-0">
            <h2 className="text-lg font-semibold mb-6">Vocabulary average over time</h2>
            <div className="h-72 2xl:h-80" role="img" aria-label={period === "year" ? "Vocabulary average at the end of each month; current month uses latest available value" : "Vocabulary list average percentage over the last 30 days"}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.days} margin={{ top: 5, right: 15, left: -10, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--card-border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={28} tick={{ fill: "var(--foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => formatDate(String(label))} formatter={(value: number) => [`${value.toFixed(2)}%`, "List average"]} />
                  <Line type="stepAfter" dataKey="average" name="List average" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card xl:col-span-2 min-w-0">
            <h2 className="text-lg font-semibold mb-6">Vocabulary by category</h2>
            {data.categories.length ? <div className="grid md:grid-cols-2 gap-6 items-center">
              <div className="h-80" role="img" aria-label="Proportion of vocabulary in each category">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.categories} dataKey="count" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3} stroke="var(--card-bg)">
                      {data.categories.map((category, index) => <Cell key={category.name} fill={categoryColors[index % categoryColors.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ ...tooltipStyle, background: "#1e293b", color: "#ffffff" }} itemStyle={{ color: "#ffffff" }} labelStyle={{ color: "#ffffff" }} formatter={(value: number) => [`${value} words (${(value / data.summary.vocabularyCount * 100).toFixed(1)}%)`, "Vocabulary"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-3">
                {data.categories.map((category, index) => <li key={category.name} className="flex items-center gap-3 border-b border-card-border pb-3"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: categoryColors[index % categoryColors.length] }} /><span className="flex-1">{category.name}</span><span className="font-semibold">{category.count}</span><span className="text-sm text-gray-500 w-16 text-right">{(category.count / data.summary.vocabularyCount * 100).toFixed(1)}%</span></li>)}
              </ul>
            </div> : <p className="text-gray-500 py-12 text-center">Add vocabulary to see your category breakdown.</p>}
          </section>
        </div>
      </>}
    </div>
  );
}
