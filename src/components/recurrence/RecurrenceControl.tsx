"use client";
import { useEffect, useRef, useState } from "react";
import { createWorkWriter } from "@/lib/work-management/client";
import { useInitialTaskLoad, useTaskRead } from "@/components/work/TaskInitialLoad";
import TaskModal from "@/components/shared/TaskModal";
import RepeatFields, { repeatLabels } from "./RepeatFields";

type Series = {
  id: number;
  revision: number;
  frequency: string;
  until: string | null;
  active: boolean;
  anchor: string;
};
const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
export default function RecurrenceControl({
  kind,
  id,
  revision,
  date,
  onChanged,
  disabled = false,
}: {
  kind: "TASK" | "EVENT";
  id: number;
  revision: number;
  date?: string | null;
  onChanged: () => void;
  disabled?: boolean;
}) {
  const read = useTaskRead();
  const [series, setSeries] = useState<Series | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [frequency, setFrequency] = useState("");
  const [until, setUntil] = useState("");
  const [firstDate, setFirstDate] = useState(date?.slice(0, 10) || "");
  const writer = useRef(createWorkWriter());
  const lock = useRef(false);
  const url = `/api/${kind === "TASK" ? "todos" : "events"}/${id}/recurrence`;
  useInitialTaskLoad(!loaded && !error);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError("");
    void read<{ series: Series | null }>(url)
      .then((result) => {
        if (active) {
          setSeries(result.series);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [url, revision, read]);
  async function save(stop = false) {
    if (lock.current) return;
    if (
      (stop || !frequency) &&
      !window.confirm(
        "Stop repeating? Untouched future copies will be removed. This occurrence, past history and edited copies will stay.",
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await writer.current<Series>(
        url,
        "POST",
        {
          ...(stop || !frequency ? { active: false } : { frequency, until: until || null }),
          sourceRevision: revision,
          ...(!series && kind === "TASK" && !date
            ? { firstDeadline: { kind: "DATE", date: firstDate } }
            : {}),
        },
        series?.revision,
      );
      setSeries(result);
      setOpen(false);
      onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="my-3 flex flex-wrap items-center gap-3 text-sm">
        {series && (
          <span className={series.active ? "text-sky-400" : "text-muted"}>
            ↻ {series.active ? repeatLabels[series.frequency] : "Repeat stopped"}
            {series.active && series.until ? ` · until ${series.until}` : ""}
          </span>
        )}
        <button
          type="button"
          className={button}
          disabled={disabled || busy || !loaded}
          onClick={() => {
            setFrequency(series?.frequency || "WEEKLY");
            setUntil(series?.until || "");
            setFirstDate(date?.slice(0, 10) || "");
            setError("");
            setOpen(true);
          }}
        >
          {series ? "Edit repeating schedule" : "↻ Make recurring"}
        </button>
        {error && !open && (
          <p role="alert" className="text-rose-500">
            {error}
          </p>
        )}
      </div>
      <TaskModal
        open={open}
        title={kind === "TASK" ? "Repeating task" : "Repeating event"}
        busy={busy}
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {!series && kind === "TASK" && !date && (
            <label className="block text-sm">
              First deadline
              <input
                required
                type="date"
                aria-label="First deadline"
                className="mt-1 w-full rounded-lg border border-card-border bg-card-bg p-2.5"
                value={firstDate}
                onChange={(event) => setFirstDate(event.target.value)}
              />
            </label>
          )}
          <RepeatFields
            frequency={frequency}
            until={until}
            onFrequency={setFrequency}
            onUntil={setUntil}
            disabled={busy}
            start={date || firstDate}
          />
          <p className="text-sm text-muted">
            {kind === "TASK"
              ? "Each copy has its own status, notes and files, and keeps this task’s project and stage."
              : "Each occurrence can be edited, completed or deleted separately."}
          </p>
          {series && (
            <p className="text-sm text-muted">
              Saving uses this {kind === "TASK" ? "task" : "event"} as the template for future
              copies. This occurrence, past history and edited copies stay unchanged.
            </p>
          )}
          {error && (
            <p role="alert" className="text-rose-500">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || (!series && !frequency)}
              className={`${button} bg-blue-600 text-white`}
            >
              {busy ? "Saving…" : series ? "Save schedule and future copies" : "Start repeating"}
            </button>
            {series?.active && (
              <button
                type="button"
                disabled={busy}
                className={`${button} text-rose-400`}
                onClick={() => void save(true)}
              >
                Stop repeating
              </button>
            )}
          </div>
        </form>
      </TaskModal>
    </>
  );
}
