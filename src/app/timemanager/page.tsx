import TimeManagerChart from "@/components/timemanager/TimeManagerChart";

export default function TimeManagerPage() {

  return (
    <div
      className="p-6 space-y-6"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Time Manager</h1>
      </div>

      {/* Chart + Activity List */}
      <TimeManagerChart />
    </div>
  );
}
