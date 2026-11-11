"use client";
import { useEffect, useState } from "react";
import { workRead } from "@/lib/work-management/client";
import type { WorkProject } from "@/lib/work-management/types";
export default function ProjectPicker({
  value,
  onChange,
  disabled,
  label = "Project",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<{
      items: WorkProject[];
      page: number;
      pageSize: number;
      total: number;
    } | null>(null),
    [selected, setSelected] = useState<WorkProject | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    const timer = setTimeout(() => {
      void workRead<NonNullable<typeof data>>(
        `/api/projects?view=all&q=${encodeURIComponent(q)}&page=${page}`,
      )
        .then((result) => {
          if (active) setData(result);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, page, retry]);
  useEffect(() => {
    let active = true;
    setSelected(null);
    if (/^[1-9]\d*$/.test(value))
      void workRead<WorkProject>(`/api/projects/${value}`)
        .then((result) => {
          if (active) setSelected(result);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    return () => {
      active = false;
    };
  }, [value, retry]);
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm">{label}</legend>
      <input
        aria-label={`${label} search`}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Search project name or reference"
        className="w-full min-w-0 rounded border border-card-border bg-card-bg p-2 text-sm"
      />
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded border border-card-border bg-card-bg p-2 text-sm"
      >
        <option value="">Choose / all projects</option>
        <option value="none">Standalone / no project</option>
        {selected && !data?.items.some((row) => row.id === selected.id) && (
          <option value={selected.id}>
            {selected.reference} · {selected.name}
          </option>
        )}
        {data?.items.map((row) => (
          <option key={row.id} value={row.id}>
            {row.reference} · {row.name}
            {row.status !== "ACTIVE" || row.archivedAt ? " (closed/archived)" : ""}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry projects
          </button>
        </p>
      )}
      {data && data.total > data.pageSize && (
        <div className="flex gap-3 text-xs">
          <button
            type="button"
            disabled={disabled || data.page <= 1}
            onClick={() => setPage(data.page - 1)}
          >
            Previous projects
          </button>
          <span>
            {data.page}/{Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            type="button"
            disabled={disabled || data.page * data.pageSize >= data.total}
            onClick={() => setPage(data.page + 1)}
          >
            Next projects
          </button>
        </div>
      )}
    </fieldset>
  );
}
