"use client";
import { useEffect, useState } from "react";
import { workRead } from "@/lib/work-management/client";
export default function FocusControl({
  id,
  revision,
  disabled,
  onToggle,
}: {
  id: number;
  revision: number;
  disabled: boolean;
  onToggle: (date: string, active: boolean) => void;
}) {
  const [data, setData] = useState<{
      date: string;
      nextDayAt: string;
      timeZone: string;
      active: boolean;
      actionable: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void workRead<NonNullable<typeof data>>(`/api/todos/${id}/focus`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((value) => value + 1);
    }, 60000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, revision, refresh]);
  useEffect(() => {
    if (!data?.nextDayAt) return;
    const timer = setTimeout(
      () => setRefresh((value) => value + 1),
      Math.max(100, Math.min(2147483647, Date.parse(data.nextDayAt) - Date.now() + 100)),
    );
    return () => clearTimeout(timer);
  }, [data?.nextDayAt]);
  return (
    <section aria-label="Today focus" className="space-y-2 border-t border-card-border pt-4">
      <h2 className="font-semibold">Today&apos;s focus</h2>
      {error ? (
        <p role="alert" className="text-sm text-rose-500">
          {error}{" "}
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            Retry focus
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading focus…</p>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            {data.date} · {data.timeZone}
            {!data.actionable && data.active ? " · Retained, hidden from unfinished work" : ""}
          </p>
          <button
            type="button"
            disabled={disabled || (!data.actionable && !data.active)}
            onClick={() => onToggle(data.date, !data.active)}
            className="rounded border border-card-border px-3 py-2 text-sm disabled:opacity-50"
          >
            {data.active ? "Remove today's focus" : "Focus today"}
          </button>
        </>
      )}
    </section>
  );
}
