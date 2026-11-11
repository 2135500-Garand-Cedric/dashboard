"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type {
  WorkProject,
  SupportEditorHandle,
  SupportEditorState,
} from "@/lib/work-management/types";
import AllWork from "@/components/work/AllWork";
import TaskTimeline from "@/components/work/TaskTimeline";
import TaskAttachments from "@/components/work/TaskAttachments";
import { useWorkDraftGuard } from "@/components/work/useWorkDraftGuard";
import ProjectEditor from "./ProjectEditor";
import ProjectStages from "./ProjectStages";
import ProjectMilestones from "./ProjectMilestones";
const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
type Review = {
  project: WorkProject;
  counts: WorkProject["counts"];
  openTaskCount: number;
  token: string;
  action: string;
};
export default function ProjectWorkspace({ id }: { id: number }) {
  const [project, setProject] = useState<WorkProject | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<Review | null>(null),
    [ack, setAck] = useState(false),
    [summary, setSummary] = useState("");
  const [notesState, setNotesState] = useState<SupportEditorState>({ dirty: false, busy: false }),
    [filesState, setFilesState] = useState<SupportEditorState>({ dirty: false, busy: false });
  const notes = useRef<SupportEditorHandle>(null),
    files = useRef<SupportEditorHandle>(null),
    dialog = useRef<HTMLDialogElement>(null),
    writer = useRef(createWorkWriter()),
    lock = useRef(false);
  const leave = useWorkDraftGuard(
    () => !!notes.current?.isDirty() || !!files.current?.isDirty(),
    () => {
      notes.current?.discard();
      files.current?.discard();
    },
  );
  const [taskRefresh, setTaskRefresh] = useState(0);
  const current = useRef(id);
  current.current = id;
  const load = useCallback(async () => {
    try {
      const row = await workRead<WorkProject>(`/api/projects/${id}`);
      if (current.current === id) {
        setProject(row);
        setTaskRefresh((value) => value + 1);
      }
    } catch (e) {
      if (current.current === id)
        setError(e instanceof Error ? e.message : "Unable to load project.");
    }
  }, [id]);
  useEffect(() => {
    let active = true;
    setProject(null);
    setError("");
    void workRead<WorkProject>(`/api/projects/${id}`)
      .then((row) => {
        if (active) setProject(row);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (review) dialog.current?.showModal();
  }, [review]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save project change.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const supportBusy = notesState.busy || filesState.busy;
  if (!project)
    return (
      <div className="pt-12 md:pt-2">
        {error ? (
          <p role="alert">
            {error}{" "}
            <button
              type="button"
              onClick={() => {
                setError("");
                void load();
              }}
              className={button}
            >
              Retry project
            </button>
          </p>
        ) : (
          <p role="status">Loading project…</p>
        )}
      </div>
    );
  return (
    <div className="min-w-0 space-y-5 pb-8 pt-12 md:pt-2">
      <header className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link href={`/events?project=${id}`} className={button}>
            Project calendar
          </Link>
          <Link href="/todos" className={button}>
            Find tasks to assign
          </Link>
        </div>
        <Link href="/projects" className={button}>
          ← Projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">
              {project.reference} · {project.status}
              {project.archivedAt ? " · Archived" : ""}
            </p>
            <h1 className="break-words text-2xl font-bold">{project.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || supportBusy || editing}
              onClick={() => {
                if (leave()) {
                  setError("");
                  void load();
                }
              }}
              className={button}
            >
              Reload project
            </button>
            {!project.archivedAt && (
              <button
                type="button"
                disabled={busy || supportBusy || editing}
                onClick={() => setEditing(true)}
                className={button}
              >
                Edit project
              </button>
            )}
            {(project.archivedAt
              ? ["restore"]
              : project.status === "ACTIVE"
                ? ["complete", "cancel", "archive"]
                : ["reopen", "archive"]
            ).map((action) => (
              <button
                type="button"
                key={action}
                disabled={busy || supportBusy || editing}
                onClick={() =>
                  void perform(async () => {
                    if (!leave()) return;
                    if (["complete", "cancel", "archive"].includes(action)) {
                      const preview = await workRead<Omit<Review, "action">>(
                        `/api/projects/${id}/transition`,
                      );
                      setReview({ ...preview, action });
                      setAck(false);
                      setSummary("");
                    } else if (
                      window.confirm(
                        `${action === "restore" ? "Restore" : "Reopen"} this project? Tasks and sessions keep their current state.`,
                      )
                    ) {
                      setProject(
                        await writer.current<WorkProject>(
                          `/api/projects/${id}/transition`,
                          "POST",
                          { action },
                          project.revision,
                        ),
                      );
                    }
                  })
                }
                className={button}
              >
                {action === "complete"
                  ? "Complete project"
                  : action === "cancel"
                    ? "Cancel project"
                    : action === "archive"
                      ? "Archive project"
                      : action === "reopen"
                        ? "Reopen project"
                        : "Restore project"}
              </button>
            ))}
          </div>
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded border border-rose-500/30 p-3 text-rose-500">
          {error}
        </p>
      )}
      {editing ? (
        <ProjectEditor
          project={project}
          onSaved={(row) => {
            setProject(row);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <section
          aria-label="Project summary"
          className="space-y-4 rounded-xl border border-card-border bg-card-bg p-5"
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h2 className="font-semibold">Objective</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {project.objective || "No objective recorded."}
              </p>
            </div>
            <div>
              <h2 className="font-semibold">Current summary</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {project.summary || "No summary recorded."}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-400">
            Start: {project.startDate || "Not set"} · Target: {project.targetDate || "Not set"}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <strong>
              {project.counts.completed}/{project.counts.total} tasks completed
            </strong>
            <span>{project.counts.unfinished} unfinished</span>
            <span>{project.counts.cancelled} cancelled</span>
            <span>{project.counts.archived} archived</span>
          </div>
          <p className="text-xs text-gray-500">
            Counts include direct project tasks that are not archived or Cancelled. Done counts as
            completed. Child tasks count separately only when explicitly assigned to this project.
            This is a task count, not effort progress.
          </p>
          {project.completionSummary && (
            <p className="whitespace-pre-wrap break-words text-sm">
              Closure summary: {project.completionSummary}
            </p>
          )}
        </section>
      )}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="min-w-0 space-y-5">
          <ProjectMilestones project={project} onChanged={setProject} />
          <div className="rounded-xl border border-card-border bg-card-bg p-4">
            <TaskTimeline
              ref={notes}
              id={id}
              basePath={`/api/projects/${id}`}
              revision={project.revision}
              onStateChange={setNotesState}
              onRecordsChanged={() => {
                void load();
              }}
            />
            <TaskAttachments
              ref={files}
              id={id}
              basePath={`/api/projects/${id}`}
              onStateChange={setFilesState}
              onRecordsChanged={() => {
                void load();
              }}
            />
          </div>
        </div>
        <ProjectStages project={project} onChanged={setProject} />
      </div>
      <section className="rounded-xl border border-card-border bg-card-bg p-4">
        <Suspense fallback={<p role="status">Loading project tasks…</p>}>
          <AllWork
            projectId={id}
            refreshSignal={taskRefresh}
            projectContextId={project.contextId}
            projectStages={project.stages}
            basePath={`/projects/${id}`}
            onTasksChanged={() => {
              void load();
            }}
            allowCapture={project.status === "ACTIVE" && !project.archivedAt}
          />
        </Suspense>
      </section>
      {review && (
        <dialog
          ref={dialog}
          aria-label="Review project closure"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setReview(null);
          }}
          className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg space-y-4 overflow-y-auto rounded-xl border border-card-border bg-card-bg p-5 text-foreground backdrop:bg-black/60"
        >
          <h2 className="text-lg font-semibold">
            Review {review.action}: {review.project.name}
          </h2>
          <p>{review.openTaskCount} unfinished tasks, including archived work, will stay open.</p>
          <p className="text-sm text-gray-400">
            No task, child task, reward, calendar event or work session will be changed.
          </p>
          <Link
            href={`/todos?project=${id}&view=active`}
            target="_blank"
            className={`${button} inline-block`}
          >
            Review unfinished tasks
          </Link>
          <label className="block text-sm">
            Closure summary (optional)
            <textarea
              aria-label="Project closure summary"
              maxLength={4000}
              value={summary}
              disabled={busy}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-1 w-full rounded border border-card-border bg-card-bg p-2"
            />
          </label>
          {review.openTaskCount > 0 && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(e) => setAck(e.target.checked)}
              />
              I reviewed the unfinished tasks and will keep them open.
            </label>
          )}
          {error && (
            <p role="alert" className="text-rose-500">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || (review.openTaskCount > 0 && !ack)}
              onClick={() =>
                void perform(async () => {
                  const row = await writer.current<WorkProject>(
                    `/api/projects/${id}/transition`,
                    "POST",
                    {
                      action: review.action,
                      token: review.token,
                      allowUnfinished: ack,
                      summary: summary || null,
                    },
                    review.project.revision,
                  );
                  setProject(row);
                  setReview(null);
                })
              }
              className={`${button} bg-blue-600 text-white`}
            >
              Confirm project {review.action}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReview(null)}
              className={button}
            >
              Keep project unchanged
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
