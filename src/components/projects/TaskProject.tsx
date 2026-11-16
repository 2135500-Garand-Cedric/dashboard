"use client";
import { useInitialTaskLoad, useTaskRead } from "@/components/work/TaskInitialLoad";
import Link from "next/link";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter } from "@/lib/work-management/client";
import type {
  WorkTodo,
  WorkProject,
  SupportEditorHandle,
  SupportEditorState,
} from "@/lib/work-management/types";
const TaskProject = forwardRef<
  SupportEditorHandle,
  {
    task: WorkTodo;
    disabled?: boolean;
    onChanged: (task: WorkTodo) => void;
    onStateChange: (state: SupportEditorState) => void;
  }
>(function TaskProject({ task, disabled, onChanged, onStateChange }, ref) {
  const read = useTaskRead();
  const [projectId, setProjectId] = useState(task.projectId ? String(task.projectId) : "none"),
    [stageId, setStageId] = useState(task.stageId ? String(task.stageId) : ""),
    [project, setProject] = useState<Pick<WorkProject, "id" | "name" | "stages"> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [projects, setProjects] = useState<Pick<WorkProject, "id" | "name">[] | null>(null),
    [catalogError, setCatalogError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setCatalogError("");
    async function load() {
      const rows: Pick<WorkProject, "id" | "name">[] = [];
      for (let page = 1; ; page++) {
        const result = await read<{ items: WorkProject[]; total: number; pageSize: number }>(
          `/api/projects?view=active&page=${page}`,
        );
        if (!active) return;
        rows.push(...result.items);
        if (page * result.pageSize >= result.total) break;
      }
      setProjects(rows);
    }
    void load().catch((error) => {
      if (active)
        setCatalogError(error instanceof Error ? error.message : "Unable to load projects.");
    });
    return () => {
      active = false;
    };
  }, [retry, read]);
  const revision = useRef(task.revision);
  const writer = useRef(createWorkWriter()),
    lock = useRef(false);
  useInitialTaskLoad(
    (!projects && !catalogError) || (/^\d+$/.test(projectId) && !project && !error),
  );
  const dirty =
    (projectId === "none" ? null : Number(projectId)) !== (task.projectId ?? null) ||
    (stageId ? Number(stageId) : null) !== (task.stageId ?? null);
  if (!dirty) revision.current = task.revision;
  useEffect(() => {
    setProjectId(task.projectId ? String(task.projectId) : "none");
    setStageId(task.stageId ? String(task.stageId) : "");
  }, [task.id, task.projectId, task.stageId]);
  useEffect(() => {
    let active = true;
    setProject(null);
    if (/^\d+$/.test(projectId))
      void read<WorkProject>(`/api/projects/${projectId}`)
        .then((row) => {
          if (active) setProject(row);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [projectId, read]);
  useEffect(() => {
    onStateChange({ dirty, busy });
  }, [dirty, busy, onStateChange]);
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => dirty,
      isBusy: () => lock.current,
      discard: () => {
        setProjectId(task.projectId ? String(task.projectId) : "none");
        setStageId(task.stageId ? String(task.stageId) : "");
      },
    }),
    [dirty, task.projectId, task.stageId],
  );
  return (
    <div aria-label="Task project membership" className="space-y-3">
      <label className="block text-sm">
        Project
        <select
          aria-label="Project"
          value={projectId}
          disabled={disabled || busy || !projects}
          onChange={(event) => {
            setProjectId(event.target.value);
            setStageId("");
          }}
          className="mt-1 w-full rounded-lg border border-card-border bg-card-bg p-2"
        >
          <option value="none">Standalone / no project</option>
          {project && !projects?.some((row) => row.id === project.id) && (
            <option value={project.id}>{project.name}</option>
          )}
          {projects?.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      {catalogError && (
        <p role="alert" className="text-sm text-rose-500">
          {catalogError}{" "}
          <button type="button" onClick={() => setRetry((old) => old + 1)}>
            Retry projects
          </button>
        </p>
      )}
      <label className="block text-sm">
        Project stage
        <select
          aria-label="Project stage"
          value={stageId}
          disabled={disabled || busy || !project}
          onChange={(e) => setStageId(e.target.value)}
          className="mt-1 w-full rounded border border-card-border bg-card-bg p-2"
        >
          <option value="">No stage</option>
          {project?.stages
            .filter((row) => row.active || row.id === task.stageId)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {!row.active ? " (inactive)" : ""}
              </option>
            ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-500">
          {error}
        </p>
      )}
      {dirty && (
        <button
          type="button"
          disabled={disabled || busy || !dirty || (!!projectId && projectId !== "none" && !project)}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              const updated = await writer.current<WorkTodo>(
                `/api/todos/${task.id}/project`,
                "PATCH",
                {
                  projectId: projectId === "none" ? null : Number(projectId),
                  stageId: stageId ? Number(stageId) : null,
                },
                revision.current,
              );
              onChanged(updated);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to save membership.");
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
          className="rounded border border-card-border bg-blue-600 px-3 py-2 text-sm text-white"
        >
          {busy ? "Saving…" : "Save project"}
        </button>
      )}
      {task.project && (
        <Link
          href={`/projects/${task.project.id}`}
          className="inline-block text-xs text-blue-400 hover:underline"
        >
          Open project →
        </Link>
      )}
    </div>
  );
});
export default TaskProject;
