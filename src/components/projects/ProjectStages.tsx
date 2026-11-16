"use client";
import TaskModal from "@/components/shared/TaskModal";
import { PlusIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { createWorkWriter } from "@/lib/work-management/client";
import type { WorkProject } from "@/lib/work-management/types";
import { useWorkDraftGuard } from "@/components/work/useWorkDraftGuard";
const button = "rounded border border-card-border px-3 py-2 text-sm disabled:opacity-50";
export default function ProjectStages({
  project,
  onChanged,
}: {
  project: WorkProject;
  onChanged: (row: WorkProject) => void;
}) {
  const [draft, setDraft] = useState<{
      id?: number;
      name: string;
      position: number;
      active: boolean;
      revision: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const writer = useRef(createWorkWriter()),
    lock = useRef(false),
    leave = useWorkDraftGuard(!!draft, () => setDraft(null));
  return (
    <section
      aria-label="Project stages"
      className="space-y-3 rounded-xl border border-card-border bg-card-bg p-4"
    >
      <h2 className="font-semibold">Stages</h2>
      <ul className="space-y-2">
        {project.stages.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-card-border p-3"
          >
            <span className="break-words text-sm">
              {row.position + 1}. {row.name}
              {!row.active ? " · Inactive" : ""}
            </span>
            <button
              type="button"
              disabled={busy || !!draft || !!project.archivedAt || project.status !== "ACTIVE"}
              onClick={() =>
                setDraft({
                  id: row.id,
                  name: row.name,
                  position: row.position,
                  active: row.active,
                  revision: project.revision,
                })
              }
              aria-label={`Edit stage ${row.name}`}
              title={`Edit stage ${row.name}`}
              className={`${button} text-blue-500`}
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy || !!draft || !!project.archivedAt || project.status !== "ACTIVE"}
        onClick={() =>
          setDraft({
            name: "",
            position: project.stages.length,
            active: true,
            revision: project.revision,
          })
        }
        className={button}
      >
        <PlusIcon className="mr-1.5 inline h-4 w-4" />
        Add stage
      </button>
      <TaskModal
        open={!!draft}
        title={draft?.id ? "Edit stage" : "Add stage"}
        busy={busy}
        onClose={() => {
          if (leave()) setDraft(null);
        }}
      >
        {draft && (
          <form
            aria-label="Stage editor"
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const { revision, ...data } = draft;
                const row = await writer.current<WorkProject>(
                  `/api/projects/${project.id}/stages`,
                  "POST",
                  data,
                  revision,
                );
                setDraft(null);
                onChanged(row);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to save stage.");
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            {error && (
              <p role="alert" className="text-sm text-rose-500">
                {error}
              </p>
            )}
            <label className="block text-sm">
              Stage name
              <input
                aria-label="Stage name"
                required
                maxLength={120}
                value={draft.name}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded border border-card-border bg-card-bg p-2"
              />
            </label>
            <label className="block text-sm">
              Sort order (zero first)
              <input
                aria-label="Stage order"
                type="number"
                min="0"
                step="1"
                required
                value={draft.position}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })}
                className="w-full rounded border border-card-border bg-card-bg p-2"
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Active stage
            </label>
            <div className="flex gap-3">
              <button type="submit" disabled={busy} className={`${button} bg-blue-600 text-white`}>
                Save stage
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (leave()) setDraft(null);
                }}
                className={button}
              >
                Cancel stage edit
              </button>
            </div>
          </form>
        )}
      </TaskModal>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
    </section>
  );
}
