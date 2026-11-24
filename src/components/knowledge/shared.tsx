"use client";
import { useEffect, useState } from "react";
import { workRead } from "@/lib/work-management/client";
export const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm font-medium transition hover:bg-blue-500/10 disabled:opacity-50";
export const primary = `${button} border-blue-500/50 bg-blue-500/10 text-blue-300`;
export const input =
  "w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2.5 text-foreground";
export const card = "min-w-0 rounded-xl border border-card-border bg-card-bg p-4 sm:p-5";
export const typeName = (type: string) =>
  ({ REFERENCE: "Reference", PROCEDURE: "Procedure", TROUBLESHOOTING: "Troubleshooting" })[type] ||
  type;
export type ArticleSummary = {
  id: number;
  title: string;
  summary: string;
  type: string;
  pinned: boolean;
  revision: number;
  archivedAt: string | null;
  updatedAt: string;
  snippet?: string;
};
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
export function useKnowledgeRead<T>(url: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void workRead<T>(url)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [url, refresh]);
  return { data, error, reload: () => setRefresh((value) => value + 1) };
}
export function Paging({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center gap-3 py-3">
      <button className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="text-sm">
        {page} / {Math.ceil(total / pageSize)}
      </span>
      <button
        className={button}
        disabled={page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
export function ReadState({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <p role="alert" className="text-rose-400">
      {error}{" "}
      <button className={button} onClick={retry}>
        Retry
      </button>
    </p>
  ) : (
    <p role="status" className="p-4 text-gray-400">
      Loading…
    </p>
  );
}
