"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { useEffect, useState } from "react";
import { CalendarIcon } from "@heroicons/react/24/outline";

const COLORS = [
  "#3B82F6", "#F97316", "#10B981", "#F43F5E", "#8B5CF6",
  "#FACC15", "#14B8A6", "#EC4899", "#6366F1", "#22D3EE",
  "#F87171", "#A78BFA", "#34D399", "#FCD34D", "#E879F9"
];

export default function TimeManagerChart() {
  const [timeframe, setTimeframe] = useState<"week" | "month" | "year">("week");
  const [records, setRecords] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Fetch records from API
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/time-manager");
        if (!res.ok) throw new Error("Failed to fetch data");
        const data = await res.json();
        setRecords(data);
      } catch (err) {
        console.error("Error fetching time manager data:", err);
      }
    }
    fetchData();
  }, []);

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

  const CustomTooltip = ({ payload }: any) => {
    if (!payload || !payload.length) return null;
    const item = payload[0].payload as typeof formattedData[0];
    return (
      <div className="bg-white text-black p-3 rounded shadow border text-sm">
        <div className="font-medium">{item.name}</div>
        <div>{(Number(item.seconds) / 3600).toFixed(1)}h ({item.percent}%)</div>
      </div>
    );
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Pie Chart */}
        <div className="flex justify-center">
          <PieChart width={600} height={600}>
            <Pie
              data={formattedData}
              dataKey="seconds"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={200}
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
