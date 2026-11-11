"use client";
import { useEffect, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type { WorkProject, WorkContext } from "@/lib/work-management/types";
import { useWorkDraftGuard } from "@/components/work/useWorkDraftGuard";
const input = "mt-1 w-full min-w-0 rounded border border-card-border bg-card-bg p-2 text-sm";
export default function ProjectEditor({
  project,
  onSaved,
  onCancel,
}: {
  project?: WorkProject;
  onSaved: (project: WorkProject) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project?.name ?? ""),
    [objective, setObjective] = useState(project?.objective ?? ""),
    [summary, setSummary] = useState(project?.summary ?? ""),
    [context, setContext] = useState(project?.contextId ? String(project.contextId) : ""),
    [start, setStart] = useState(project?.startDate ?? ""),
    [target, setTarget] = useState(project?.targetDate ?? ""),
    [contexts, setContexts] = useState<WorkContext[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const writer = useRef(createWorkWriter()),
    lock = useRef(false),
    revision = useRef(project?.revision),
    clean = useRef(false),
    baseline = useRef(JSON.stringify({ name, objective, summary, context, start, target }));
  const leave = useWorkDraftGuard(
    () =>
      !clean.current &&
      baseline.current !== JSON.stringify({ name, objective, summary, context, start, target }),
  );
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
  return (
    <form
      aria-label="Project editor"
      className="space-y-4 rounded-xl border border-card-border bg-card-bg p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        let saved = false;
        try {
          const row = await writer.current<WorkProject>(
            project ? `/api/projects/${project.id}` : "/api/projects",
            project ? "PATCH" : "POST",
            {
              name,
              objective: objective || null,
              summary: summary || null,
              contextId: context ? Number(context) : null,
              startDate: start || null,
              targetDate: target || null,
            },
            revision.current,
          );
          saved = true;
          clean.current = true;
          onSaved(row);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to save project.");
        } finally {
          if (!saved) {
            lock.current = false;
            setBusy(false);
          }
        }
      }}
    >
      <h2 className="text-lg font-semibold">{project ? "Edit project" : "New project"}</h2>
      <label className="block text-sm">
        Project name
        <input
          aria-label="Project name"
          required
          maxLength={500}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          className={input}
        />
      </label>
      <label className="block text-sm">
        Objective
        <textarea
          aria-label="Project objective"
          rows={3}
          maxLength={20000}
          value={objective}
          disabled={busy}
          onChange={(e) => setObjective(e.target.value)}
          className={input}
        />
      </label>
      <label className="block text-sm">
        Current summary
        <textarea
          aria-label="Project summary"
          rows={3}
          maxLength={20000}
          value={summary}
          disabled={busy}
          onChange={(e) => setSummary(e.target.value)}
          className={input}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Context
          <select
            aria-label="Project context"
            value={context}
            disabled={busy}
            onChange={(e) => setContext(e.target.value)}
            className={input}
          >
            <option value="">Unclassified</option>
            {contexts
              .filter((row) => row.active || row.id === project?.contextId)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Start date
          <input
            aria-label="Project start date"
            type="date"
            value={start}
            disabled={busy}
            onChange={(e) => setStart(e.target.value)}
            className={input}
          />
        </label>
        <label className="text-sm">
          Target date
          <input
            aria-label="Project target date"
            type="date"
            min={start || undefined}
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value)}
            className={input}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
        >
          {busy ? "Saving…" : "Save project"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (leave()) onCancel();
          }}
          className="rounded border border-card-border px-4 py-2 text-sm"
        >
          Cancel project edit
        </button>
      </div>
    </form>
  );
}
