"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { workRead } from "@/lib/work-management/client";
import type { WorkProject, WorkContext } from "@/lib/work-management/types";
import ProjectEditor from "./ProjectEditor";
export default function ProjectList() {
  const router = useRouter();
  const [q, setQ] = useState(""),
    [view, setView] = useState("active"),
    [context, setContext] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [creating, setCreating] = useState(false),
    [contexts, setContexts] = useState<WorkContext[]>([]),
    [data, setData] = useState<{
      items: WorkProject[];
      total: number;
      page: number;
      pageSize: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void workRead<WorkContext[]>("/api/work-contexts")
      .then((rows) => {
        if (active) setContexts(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const timer = setTimeout(() => {
      void workRead<NonNullable<typeof data>>(
        `/api/projects?${new URLSearchParams({ q, view, context, page: String(page) })}`,
      )
        .then((rows) => {
          if (active) setData(rows);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, view, context, page, refresh]);
  return (
    <div className="min-w-0 space-y-5 pb-8 pt-12 md:pt-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
        >
          New project
        </button>
      </header>
      {creating && (
        <ProjectEditor
          onSaved={(row) => {
            router.push(`/projects/${row.id}`);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      <section
        aria-label="Project search and filters"
        className="grid gap-3 rounded-xl border border-card-border bg-card-bg p-4 sm:grid-cols-3"
      >
        <label className="text-sm">
          Search
          <input
            aria-label="Search projects"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded border border-card-border bg-card-bg p-2"
          />
        </label>
        <label className="text-sm">
          Project history
          <select
            aria-label="Project history"
            value={view}
            onChange={(e) => {
              setView(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded border border-card-border bg-card-bg p-2"
          >
            {["active", "history", "archived", "all"].map((value) => (
              <option key={value} value={value}>
                {value === "history"
                  ? "Completed / cancelled"
                  : value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Context
          <select
            aria-label="Project list context"
            value={context}
            onChange={(e) => {
              setContext(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded border border-card-border bg-card-bg p-2"
          >
            <option value="">All contexts</option>
            <option value="none">Unclassified</option>
            {contexts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      {error ? (
        <p role="alert" className="text-rose-500">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            className="underline"
          >
            Retry project list
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading projects…</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {data.items.map((row) => (
              <Link
                key={row.id}
                href={`/projects/${row.id}`}
                className="min-w-0 space-y-3 rounded-xl border border-card-border bg-card-bg p-5 hover:border-blue-500"
              >
                <p className="text-xs text-gray-500">
                  {row.reference} · {row.status}
                  {row.archivedAt ? " · Archived" : ""}
                </p>
                <h2 className="break-words text-lg font-semibold">{row.name}</h2>
                <p className="whitespace-pre-wrap break-words text-sm text-gray-400">
                  {row.objective}
                </p>
                <p className="text-sm">
                  {row.counts.completed}/{row.counts.total} tasks completed ·{" "}
                  {row.counts.unfinished} unfinished
                </p>
                <p className="text-xs text-gray-500">
                  {row.counts.cancelled} cancelled · {row.counts.archived} archived
                </p>
              </Link>
            ))}
          </div>
          {data.total === 0 && <p>No projects match. Ordinary tasks can stay standalone.</p>}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              className="rounded border border-card-border px-3 py-2"
            >
              Previous project page
            </button>
            <span>
              {data.total} projects · Page {data.page}/
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <button
              type="button"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => setPage(data.page + 1)}
              className="rounded border border-card-border px-3 py-2"
            >
              Next project page
            </button>
          </div>
        </>
      )}
    </div>
  );
}
