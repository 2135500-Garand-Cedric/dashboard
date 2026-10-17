"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useCallback, useEffect, useState } from "react";
import { CalendarIcon } from "@heroicons/react/24/outline";

const COLORS = [
  "#3B82F6", "#F97316", "#10B981", "#F43F5E", "#8B5CF6",
  "#FACC15", "#14B8A6", "#EC4899", "#6366F1", "#22D3EE",
  "#F87171", "#A78BFA", "#34D399", "#FCD34D", "#E879F9"
];

type TimeRecord = { start_time: string; activity_name: string; duration_seconds: number | string };

export default function TimeManagerChart() {
  const [timeframe, setTimeframe] = useState<"week" | "month" | "year">("week");
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/time-manager");
      if (!res.ok) throw new Error("Unable to load Time Manager data. Please try again later.");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Unable to load Time Manager data. Please try again later.");
      setRecords(data);
    } catch {
      setError("Unable to load Time Manager data. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void fetchData(); }, [fetchData]);

  const now = new Date();
  const getThresholdDate = () => {
    const date = new Date(now);
    if (timeframe === "week") date.setDate(now.getDate() - 7);
    else if (timeframe === "month") date.setDate(now.getDate() - 30);
    else date.setDate(now.getDate() - 365);
    return date;
  };
  const threshold = getThresholdDate();

  const filteredRecords = records.filter(
    (r) => new Date(r.start_time) >= threshold && new Date(r.start_time) <= now
  );

  // Aggregate activities
  const activityMap: Record<string, number> = {};
  filteredRecords.forEach((r) => {
    const seconds = Number(r.duration_seconds) || 0;
    activityMap[r.activity_name] =
      (activityMap[r.activity_name] || 0) + seconds;
  });

  let data = Object.entries(activityMap).map(([name, seconds]) => ({
    name,
    seconds,
  }));

  // Sort by hours descending
  data = data.sort((a, b) => b.seconds - a.seconds);

  const totalSeconds = data.reduce((a, b) => a + Number(b.seconds), 0);
  const formattedData = data.map((d) => ({
    ...d,
    percent: totalSeconds ? ((Number(d.seconds) / totalSeconds) * 100).toFixed(1) : "0",
  }));

  const CustomTooltip = ({ payload }: { payload?: readonly { payload?: (typeof formattedData)[number] }[] }) => {
    if (!payload || !payload.length) return null;
    const item = payload[0].payload as typeof formattedData[0];
    return (
      <div className="bg-white text-black p-3 rounded shadow border text-sm">
        <div className="font-medium">{item.name}</div>
        <div>{(Number(item.seconds) / 3600).toFixed(1)}h ({item.percent}%)</div>
      </div>
    );
  };

  if (loading) return <div className="card text-gray-500" role="status">Loading Time Manager data…</div>;
  if (error) return <div className="card" role="alert"><p>{error}</p><button type="button" onClick={() => void fetchData()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">Try again</button></div>;

  return (
    <div className="bg-[var(--card-bg)] p-6 rounded-xl shadow-lg">
      {/* Timeframe selection */}
      <div className="flex gap-2 mb-6">
        {(["week", "month", "year"] as const).map((tf) => (
          <button
            key={tf}
            className={`flex items-center gap-1 px-4 py-2 rounded-full cursor-pointer font-medium transition-all shadow-sm hover:shadow-md ${
              timeframe === tf
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--card-border)] text-[var(--color-foreground)] hover:bg-[var(--accent)]/20"
            }`}
            onClick={() => setTimeframe(tf)}
          >
            <CalendarIcon className="w-4 h-4" />
            {tf.charAt(0).toUpperCase() + tf.slice(1)}
          </button>
        ))}
      </div>

      {!formattedData.length && <p className="text-gray-500 mb-4">No completed activities for this period.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Pie Chart */}
        <div className="min-w-0 h-96 xl:h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={formattedData}
              dataKey="seconds"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {formattedData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke={index === activeIndex ? "#000" : "#fff"}
                  strokeWidth={index === activeIndex ? 3 : 1}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Activity List */}
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {formattedData.map((a, index) => (
            <div
              key={a.name}
              className={`flex justify-between items-center p-3 rounded-xl cursor-pointer transition-shadow duration-200 shadow-sm hover:shadow-lg ${
                activeIndex === index
                  ? "bg-[var(--accent)]/20"
                  : "bg-[var(--card-border)]"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="font-medium">{a.name}</span>
              </div>
              <span className="font-semibold">
                {(Number(a.seconds) / 3600).toFixed(1)}h ({a.percent}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
