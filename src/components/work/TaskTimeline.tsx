"use client";
import { useInitialTaskLoad, useTaskRead } from "@/components/work/TaskInitialLoad";
import { DateTime, useDateTime } from "@/context/SettingsContext";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import type {
  SupportEditorHandle,
  SupportEditorState,
  WorkActivityEntry,
  WorkNote,
  WorkNoteVersion,
  WorkFollowUp,
  WorkTodo,
} from "@/lib/work-management/types";
import { valueLabel as formatValueLabel } from "@/components/todos/TaskActivityPreview";
import TaskModal from "@/components/shared/TaskModal";
import Link from "next/link";
import { WORK_STATUSES, STATUS_LABELS } from "@/lib/work-management/types";
const buttonClass =
  "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const inputClass =
  "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2 text-sm";
const timestamp = (value: string) => <DateTime value={value} />;
function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function NoteText({ body, urls }: { body: string; urls: string[] }) {
  return (
    <>
      <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{body}</p>
      {urls.length > 0 && (
        <ul className="mt-3 space-y-2">
          {urls.map((url) => (
            <li key={url}>
              {safeLink(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="break-all text-sm text-blue-400 underline"
                >
                  {url}
                </a>
              ) : (
                <span className="text-sm text-gray-500">Invalid documentation link</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
function RevisionHistory({ basePath, noteId }: { basePath: string; noteId: number }) {
  const [page, setPage] = useState(1),
    [data, setData] = useState<{
      items: WorkNoteVersion[];
      total: number;
      page: number;
      pageSize: number;
    } | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void workRead<{ items: WorkNoteVersion[]; total: number; page: number; pageSize: number }>(
      `${basePath}/notes/${noteId}/revisions?page=${page}`,
    )
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : "Unable to load revisions.");
      });
    return () => {
      active = false;
    };
  }, [basePath, noteId, page, retry]);
  return (
    <div className="mt-3 space-y-3 border-t border-card-border pt-3">
      {error ? (
        <p role="alert" className="text-sm text-rose-500">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="underline"
          >
            Retry revisions
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading revisions…</p>
      ) : (
        <>
          {data.items.map((version) => (
            <article key={version.id} className="space-y-2 rounded border border-card-border p-3">
              <p className="text-xs text-gray-500">
                Version {version.revision} · {timestamp(version.recordedAt)} ·{" "}
                {version.action.replace("NOTE_", "").toLowerCase()}
              </p>
              {version.occurredAt && (
                <p className="text-xs text-gray-500">Occurred: {timestamp(version.occurredAt)}</p>
              )}
              <NoteText body={version.body || "Removed note"} urls={version.documentationUrls} />
            </article>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              className={buttonClass}
            >
              Previous revisions
            </button>
            <span className="text-xs">
              {data.page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <button
              type="button"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => setPage(data.page + 1)}
              className={buttonClass}
            >
              Next revisions
            </button>
          </div>
        </>
      )}
    </div>
  );
}
type Draft = {
  editing: WorkNote | null;
  body: string;
  taskStatus?: string;
};
const drafts = new Map<string, Draft>(),
  writer = createWorkWriter();
const TaskTimeline = forwardRef<
  SupportEditorHandle,
  {
    id: number;
    basePath?: string;
    revision: number;
    onStateChange: (state: SupportEditorState) => void;
    onRecordsChanged: () => void;
    onTaskChanged?: (task: WorkTodo) => void;
    currentStatus?: WorkTodo["status"];
  }
>(function TaskTimeline(
  {
    id,
    basePath = `/api/todos/${id}`,
    revision,
    onStateChange,
    onRecordsChanged,
    onTaskChanged,
    currentStatus,
  },
  ref,
) {
  const { timeZone, describeWorkDate } = useDateTime();
  const cached = drafts.get(basePath);
  const [taskStatus, setTaskStatus] = useState(cached?.taskStatus ?? "");
  const selectedTaskStatus = taskStatus === currentStatus ? "" : taskStatus;
  const [filter, setFilter] = useState("notes"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{
      entries?: { kind: "note" | "followup"; id: number }[];
      followUps?: WorkFollowUp[];
      notes: WorkNote[];
      activity: (WorkActivityEntry & { noteRevision: WorkNoteVersion | null })[];
      total: number;
      page: number;
      pageSize: number;
    } | null>(null),
    [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(!!cached),
    [editorOpen, setEditorOpen] = useState(!!cached),
    [editing, setEditing] = useState<WorkNote | null>(cached?.editing ?? null),
    [body, setBody] = useState(cached?.body ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(cached ? "Unsaved note restored." : ""),
    [history, setHistory] = useState<string | null>(null);
  const lock = useRef(false),
    liveDraft = useRef<Draft | null>(null);
  const dirty = adding && (body !== (editing?.body ?? "") || !!selectedTaskStatus);
  liveDraft.current = dirty ? { editing, body, taskStatus } : null;
  const discard = useCallback(() => {
    drafts.delete(basePath);
    liveDraft.current = null;
    setAdding(false);
    setEditorOpen(false);
    setEditing(null);
    setBody("");
    setTaskStatus("");
    setError("");
  }, [basePath]);
  useImperativeHandle(ref, () => ({ discard, isDirty: () => dirty, isBusy: () => lock.current }), [
    discard,
    dirty,
  ]);
  const read = useTaskRead();
  useInitialTaskLoad(!data && !loadError);
  useEffect(() => {
    onStateChange({ dirty, busy });
  }, [dirty, busy, onStateChange]);
  useEffect(
    () => () => {
      if (liveDraft.current) drafts.set(basePath, liveDraft.current);
    },
    [basePath],
  );
  useEffect(() => {
    let active = true;
    setData(null);
    setLoadError("");
    void read<NonNullable<typeof data>>(`${basePath}/timeline?filter=${filter}&page=${page}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active)
          setLoadError(
            error instanceof Error ? error.message : "Unable to load notes and activity.",
          );
      });
    return () => {
      active = false;
    };
  }, [basePath, revision, filter, page, refresh, read]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setRefresh((value) => value + 1);
      onRecordsChanged();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save note.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function start(note: WorkNote | null) {
    if (dirty && !window.confirm("Discard the unsaved note changes?")) return;
    drafts.delete(basePath);
    setEditing(note);
    setBody(note?.body ?? "");
    setTaskStatus("");
    setAdding(true);
    setEditorOpen(true);
    setError("");
  }
  function card(note: WorkNote, version?: WorkNoteVersion) {
    const cardKey = `${note.id}-${version?.revision ?? "current"}`;
    const latest = !version || version.revision === note.revision;
    const inherited = basePath.startsWith("/api/projects/") && !!note.sourceTask;
    return (
      <article
        key={`${note.id}-${version?.revision ?? "current"}`}
        aria-label={`Note ${note.id}${version ? ` version ${version.revision}` : ""}`}
        className="min-w-0 space-y-3 rounded-xl border border-card-border bg-card-bg p-4"
      >
        <div className="flex flex-wrap justify-between gap-2">
          <p className="text-xs text-gray-500">
            Recorded <time dateTime={note.createdAt}>{timestamp(note.createdAt)}</time>
            {note.revision > 1 ? ` · ${note.removedAt ? "Removed" : "Edited"}` : ""}
            {version ? ` · Version ${version.revision}` : ""}
          </p>
          {latest && !note.removedAt && !inherited && (
            <button
              type="button"
              disabled={busy}
              aria-label={`Edit note ${note.id}`}
              onClick={() => start(note)}
              className={buttonClass}
            >
              Edit
            </button>
          )}
        </div>
        {inherited && note.sourceTask && (
          <Link
            href={`/todos/${note.sourceTask.id}`}
            className="inline-flex max-w-full items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm text-blue-500"
          >
            <span className="shrink-0 text-xs">{note.sourceTask.reference}</span>
            <span className="min-w-0 break-words font-medium">{note.sourceTask.title}</span>
          </Link>
        )}
        {basePath.startsWith("/api/projects/") && !inherited && (
          <p className="text-xs font-medium text-violet-400">Project note</p>
        )}
        {note.statusChange && (
          <p className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-sm">
            <span className="text-gray-500">Task status</span>
            <span>
              {STATUS_LABELS[note.statusChange.before]} →{" "}
              <strong>{STATUS_LABELS[note.statusChange.after]}</strong>
            </span>
          </p>
        )}
        {note.removedAt ? (
          <p className="text-sm text-gray-500">
            Note removed. Earlier versions remain in revision history.
          </p>
        ) : (
          <NoteText
            body={version?.body ?? note.body}
            urls={version?.documentationUrls ?? note.documentationUrls}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label={`Revisions for note ${note.id}`}
            aria-expanded={history === cardKey}
            disabled={busy}
            onClick={() => setHistory(history === cardKey ? null : cardKey)}
            className={buttonClass}
          >
            History
          </button>
          {latest && !note.removedAt && !inherited && (
            <button
              type="button"
              disabled={busy}
              aria-label={`Remove note ${note.id}`}
              className="rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
              onClick={() => {
                if (
                  window.confirm(
                    "Remove this note from the current notes? Earlier content remains in revision history; this does not erase it permanently.",
                  )
                )
                  void perform(async () => {
                    await writer(
                      `${basePath}/notes/${note.id}`,
                      "DELETE",
                      undefined,
                      note.revision,
                    );
                    if (editing?.id === note.id) discard();
                    setNotice("Note removed; revisions retained.");
                  });
              }}
            >
              Remove
            </button>
          )}
        </div>
        {history === cardKey && (
          <RevisionHistory
            basePath={inherited ? `/api/todos/${note.sourceTask!.id}` : basePath}
            noteId={note.id}
          />
        )}
      </article>
    );
  }
  function followUpCard(item: WorkFollowUp) {
    const label =
      item.status === "COMPLETED"
        ? "Follow-up completed"
        : item.status === "SNOOZED"
          ? "Follow-up snoozed"
          : item.outcome === "TASK_CLOSED"
            ? "Follow-up retired"
            : "Follow-up cancelled";
    return (
      <article
        key={`followup-${item.id}`}
        aria-label={`Follow-up ${item.id}`}
        className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-amber-600 dark:text-amber-300">{label}</h3>
          <span className="text-xs text-gray-500">
            {timestamp(item.resolvedAt ?? item.createdAt)}
          </span>
        </div>
        <p className="text-sm">
          <span className="text-gray-500">Scheduled for: </span>
          {describeWorkDate(item)}
        </p>
        {item.reason && <p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p>}
        {item.outcome &&
          !["FOLLOW_UP_COMPLETED", "FOLLOW_UP_SNOOZED", "USER_CANCELLED", "TASK_CLOSED"].includes(
            item.outcome,
          ) && <p className="whitespace-pre-wrap break-words text-sm">{item.outcome}</p>}
      </article>
    );
  }
  const noteEntries =
    data?.entries ?? data?.notes.map((note) => ({ kind: "note" as const, id: note.id })) ?? [];
  const notesById = new Map(data?.notes.map((note) => [note.id, note]) ?? []);
  const followUpsById = new Map(data?.followUps?.map((item) => [item.id, item]) ?? []);
  return (
    <section
      id={basePath.startsWith("/api/projects/") ? undefined : "task-notes"}
      aria-label="Notes and activity"
      className="task-notes space-y-4 rounded-xl border border-violet-500/25 bg-card-bg p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-violet-600 dark:text-violet-300">
          {basePath.startsWith("/api/projects/") ? "Notes & activity" : "Notes & follow-ups"}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => (adding ? setEditorOpen(true) : start(null))}
          className={buttonClass}
        >
          Add note
        </button>
      </div>
      <TaskModal
        open={editorOpen}
        title={editing ? "Edit note" : "Add note"}
        busy={busy}
        onClose={() => setEditorOpen(false)}
      >
        <form
          aria-label="Note editor"
          className="space-y-3 rounded-xl border border-card-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              const saved = await writer<WorkNote & { task?: WorkTodo }>(
                editing ? `${basePath}/notes/${editing.id}` : `${basePath}/notes`,
                editing ? "PATCH" : "POST",
                {
                  body,
                  ...(!editing && !basePath.startsWith("/api/projects/") && selectedTaskStatus
                    ? { taskStatus: selectedTaskStatus, taskRevision: revision }
                    : {}),
                },
                editing?.revision,
              );
              discard();
              if (saved.task) onTaskChanged?.(saved.task);
              setPage(1);
              setNotice("Note saved.");
            });
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-rose-500">
              {error}
            </p>
          )}
          <label className="block text-sm">
            Note
            <textarea
              aria-label="Note text"
              required
              maxLength={50000}
              rows={5}
              disabled={busy}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          {!editing && !basePath.startsWith("/api/projects/") && (
            <label className="block space-y-1 text-sm">
              Change task status
              <select
                aria-label="Note task status"
                value={selectedTaskStatus}
                disabled={busy}
                onChange={(event) => setTaskStatus(event.target.value)}
                className={inputClass}
              >
                <option value="">
                  Keep current status{currentStatus ? ` (${STATUS_LABELS[currentStatus]})` : ""}
                </option>
                {WORK_STATUSES.filter((status) => status !== currentStatus).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className={`${buttonClass} bg-blue-600 text-white`}
            >
              {busy ? "Saving note…" : "Save note"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!dirty || window.confirm("Discard the unsaved note changes?")) discard();
              }}
              className={buttonClass}
            >
              Cancel note edit
            </button>
          </div>
        </form>
      </TaskModal>
      {error && !editorOpen && (
        <p role="alert" className="text-sm text-rose-500">
          {error} Your note draft has been kept. Try saving again, or reload the timeline to review
          newer changes.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-500">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={filter === "notes"}
          onClick={() => {
            setFilter("notes");
            setPage(1);
          }}
          className={`${buttonClass} ${filter === "notes" ? "bg-blue-600 text-white" : ""}`}
        >
          Notes only
        </button>
        <button
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => {
            setFilter("all");
            setPage(1);
          }}
          className={`${buttonClass} ${filter === "all" ? "bg-blue-600 text-white" : ""}`}
        >
          All activity
        </button>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          className={buttonClass}
        >
          Reload timeline
        </button>
      </div>
      {loadError ? (
        <p role="alert" className="text-sm text-rose-500">
          {loadError}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry timeline
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading notes and activity…</p>
      ) : (
        <>
          {filter === "notes"
            ? noteEntries.map((entry) => {
                if (entry.kind === "followup") {
                  const item = followUpsById.get(entry.id);
                  return item ? followUpCard(item) : null;
                }
                const note = notesById.get(entry.id);
                return note ? card(note) : null;
              })
            : data.activity.map((entry) =>
                entry.noteRevision?.note ? (
                  <div key={entry.id} className="space-y-2">
                    <p className="text-xs capitalize text-gray-500">
                      {entry.action.replace(/_/g, " ").toLowerCase()} · {timestamp(entry.createdAt)}
                    </p>
                    {card(entry.noteRevision.note, entry.noteRevision)}
                  </div>
                ) : (
                  <article key={entry.id} className="rounded-xl border border-card-border p-4">
                    <p className="text-sm font-medium capitalize">
                      {entry.action.replace(/_/g, " ").toLowerCase()}
                    </p>
                    <time className="text-xs text-gray-500" dateTime={entry.createdAt}>
                      {timestamp(entry.createdAt)}
                    </time>
                    <dl className="mt-3 space-y-2 text-sm">
                      {Object.entries(entry.changes)
                        .filter(
                          ([field]) =>
                            !field.startsWith("reward") &&
                            !["tags", "waitingOnContact", "company", "course"].includes(field),
                        )
                        .map(([field, change]) => (
                          <div key={field} className="break-words [overflow-wrap:anywhere]">
                            <dt className="font-medium">{field.replace(/([A-Z])/g, " $1")}</dt>
                            <dd className="whitespace-pre-wrap text-gray-500">
                              {formatValueLabel(change.before, timeZone)} →{" "}
                              {formatValueLabel(change.after, timeZone)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </article>
                ),
              )}
          {!data.total && (
            <p className="text-sm text-gray-500">
              {filter === "notes"
                ? "No notes or completed follow-ups yet."
                : "No recorded activity yet."}
            </p>
          )}
          {data.total > data.pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {data.total} {filter === "notes" ? "items" : "entries"} · Page {data.page}/
                {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => setPage(data.page - 1)}
                  className={buttonClass}
                >
                  Previous history
                </button>
                <button
                  type="button"
                  disabled={data.page * data.pageSize >= data.total}
                  onClick={() => setPage(data.page + 1)}
                  className={buttonClass}
                >
                  Next history
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
});
export default TaskTimeline;
