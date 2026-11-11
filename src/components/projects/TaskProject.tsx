"use client";
import Link from "next/link";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type {
  WorkTodo,
  WorkProject,
  SupportEditorHandle,
  SupportEditorState,
} from "@/lib/work-management/types";
import ProjectPicker from "./ProjectPicker";
const TaskProject = forwardRef<
  SupportEditorHandle,
  {
    task: WorkTodo;
    disabled?: boolean;
    onChanged: (task: WorkTodo) => void;
    onStateChange: (state: SupportEditorState) => void;
  }
>(function TaskProject({ task, disabled, onChanged, onStateChange }, ref) {
  const [projectId, setProjectId] = useState(task.projectId ? String(task.projectId) : "none"),
    [stageId, setStageId] = useState(task.stageId ? String(task.stageId) : ""),
    [project, setProject] = useState<WorkProject | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(task.revision);
  const writer = useRef(createWorkWriter()),
    lock = useRef(false);
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
      void workRead<WorkProject>(`/api/projects/${projectId}`)
        .then((row) => {
          if (active) setProject(row);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [projectId]);
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
    <section
      aria-label="Task project membership"
      className="space-y-3 border-t border-card-border pt-5"
    >
      <h2 className="font-semibold">Project membership</h2>
      {task.project && (
        <Link href={`/projects/${task.project.id}`} className="text-blue-400 underline">
          {task.project.name}
        </Link>
      )}
      <p className="text-xs text-gray-500">
        Changing this task does not move its parent or children.
      </p>
      <ProjectPicker
        value={projectId}
        onChange={(value) => {
          setProjectId(value || "none");
          setStageId("");
        }}
        disabled={disabled || busy}
      />
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
        {busy ? "Saving…" : "Save membership"}
      </button>
    </section>
  );
});
export default TaskProject;
