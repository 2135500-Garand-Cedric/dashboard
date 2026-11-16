"use client";
import TaskModal from "@/components/shared/TaskModal";
import { useInitialTaskLoad, useTaskRead } from "@/components/work/TaskInitialLoad";
import Link from "next/link";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWorkWriter } from "@/lib/work-management/client";
import {
  taskReference,
  STATUS_LABELS,
  type GraphTaskStub,
  type RelationshipResults,
  type SupportEditorHandle,
  type SupportEditorState,
  type WorkActivityType,
  type WorkResults,
  type WorkTodo,
} from "@/lib/work-management/types";
const input = "w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2 text-sm";
const button = "rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
const sections = [
  ["children", "Child tasks"],
  ["blocked-by", "Blocked by"],
  ["blocks", "Blocks"],
  ["related", "Related"],
] as const;
type Draft = {
  mode: "link" | "child";
  revision: number;
  kind: string;
  target: string;
  title: string;
  activityTypeId: number | null;
};
const drafts = new Map<number, Draft>(),
  writer = createWorkWriter();
export default forwardRef<
  SupportEditorHandle,
  {
    task: WorkTodo;
    activityTypes: WorkActivityType[];
    disabled: boolean;
    onStateChange: (state: SupportEditorState) => void;
    onChanged: (task: WorkTodo) => void;
  }
>(function TaskRelationships({ task, activityTypes, disabled, onStateChange, onChanged }, ref) {
  const read = useTaskRead();
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{
      items: (RelationshipResults["items"][number] & { kind: string })[];
      total: number;
    } | null>(null),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(() => drafts.get(task.id) ?? null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [searchPage, setSearchPage] = useState(1),
    [choices, setChoices] = useState<WorkResults | null>(null),
    [searchError, setSearchError] = useState("");
  useInitialTaskLoad((!data && !error) || (draft?.mode === "link" && !choices && !searchError));
  const live = useRef(draft),
    lock = useRef(false);
  live.current = draft;
  const clear = () => {
    drafts.delete(task.id);
    live.current = null;
    setDraft(null);
    setSearch("");
    setSearchPage(1);
  };
  useImperativeHandle(ref, () => ({
    discard: clear,
    isDirty: () => !!live.current,
    isBusy: () => lock.current,
  }));
  useEffect(() => {
    onStateChange({ dirty: !!draft, busy });
  }, [draft, busy, onStateChange]);
  useEffect(
    () => () => {
      if (live.current) drafts.set(task.id, live.current);
    },
    [task.id],
  );
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    async function load() {
      const groups = await Promise.all(
        sections.map(async ([kind]) => {
          const items: (RelationshipResults["items"][number] & { kind: string })[] = [];
          for (let page = 1; ; page++) {
            const result = await read<RelationshipResults>(
              `/api/todos/${task.id}/relationships?section=${kind}&page=${page}`,
            );
            if (!active) return [];
            items.push(...result.items.map((item) => ({ ...item, kind })));
            if (page * result.pageSize >= result.total) break;
          }
          return items;
        }),
      );
      if (active)
        setData({
          items: groups.flat(),
          total: groups.reduce((sum, group) => sum + group.length, 0),
        });
    }
    void load().catch((error) => {
      if (active)
        setError(error instanceof Error ? error.message : "Unable to load relationships.");
    });
    return () => {
      active = false;
    };
  }, [task.id, task.revision, refresh, read]);
  useEffect(() => {
    if (draft?.mode !== "link") return;
    let active = true;
    setChoices(null);
    setSearchError("");
    const timer = setTimeout(() => {
      void read<WorkResults>(
        `/api/work-items?view=${archived ? "archived" : "all"}&q=${encodeURIComponent(search)}&page=${searchPage}`,
      )
        .then((result) => {
          if (active) setChoices(result);
        })
        .catch((error) => {
          if (active)
            setSearchError(error instanceof Error ? error.message : "Unable to search tasks.");
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft?.mode, search, archived, searchPage, read]);
  async function perform(action: () => Promise<WorkTodo>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      clear();
      onChanged(result);
      setRefresh((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save the relationship. Retry or reload the task.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function start(mode: Draft["mode"]) {
    setDraft({
      mode,
      revision: task.revision,
      kind: mode === "child" ? "child" : "related",
      target: "",
      title: "",
      activityTypeId: task.activityType?.active ? task.activityType.id : null,
    });
    setError("");
  }
  async function remove(kind: string, target: GraphTaskStub) {
    if (
      !window.confirm(
        `Remove this ${kind === "children" ? "child" : kind} link? Neither task will be deleted.`,
      )
    )
      return;
    await perform(async () => {
      return writer<WorkTodo>(
        `/api/todos/${task.id}/relationships`,
        "DELETE",
        { kind: kind === "children" ? "child" : kind, targetId: target.id },
        task.revision,
      );
    });
  }
  return (
    <section
      aria-label="Task relationships"
      className="min-w-0 space-y-4 rounded-xl border border-card-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Relationships</h2>
        <span className="text-xs text-gray-500">
          Child tasks {task.completedChildCount ?? 0}/{task.childCount ?? 0} Done
        </span>
      </div>
      {task.isBlocked && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500">
          Blocked by {task.blockingCount} prerequisite tasks
          {task.dependencyReviewRequired ? " · Legacy links need review" : ""}
        </p>
      )}
      {task.parent && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Parent:</span>
          {task.parent ? (
            <>
              <Link
                href={`/todos/${task.parent.id}`}
                className="min-w-0 break-words text-blue-500 underline"
              >
                {task.parent.reference} · {task.parent.title}
              </Link>
              <button
                type="button"
                disabled={disabled || busy || !!draft}
                onClick={() => void remove("parent", task.parent!)}
                className={button}
              >
                Unlink parent
              </button>
            </>
          ) : (
            <span className="text-gray-500">None</span>
          )}
        </div>
      )}
      {error && !draft && (
        <p role="alert" className="break-words text-sm text-rose-500">
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => setRefresh((value) => value + 1)}
            className="underline"
          >
            Retry loading relationships
          </button>
        </p>
      )}
      {!data ? (
        !error && (
          <p role="status" className="text-sm">
            Loading relationships…
          </p>
        )
      ) : (
        <>
          <ul
            aria-label="Linked tasks"
            tabIndex={0}
            className="max-h-[26rem] overflow-y-auto overscroll-contain divide-y divide-card-border"
          >
            {data.items.map(({ task: linked, reviewReason, kind }) => (
              <li
                key={`${kind}-${linked.id}`}
                className="flex min-h-[5.2rem] flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-semibold text-blue-400">
                    {sections.find(([key]) => key === kind)?.[1]}
                  </span>
                  {linked.status ? (
                    <Link
                      href={`/todos/${linked.id}`}
                      className="break-words text-sm text-blue-500 underline"
                    >
                      {linked.reference} · {linked.title}
                    </Link>
                  ) : (
                    <p className="text-sm">
                      {linked.reference} · {linked.title}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {linked.status ? STATUS_LABELS[linked.status] : "Unavailable"}
                    {linked.archivedAt ? " · Archived" : ""}
                    {reviewReason ? ` · Legacy review: ${reviewReason}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Unlink ${linked.reference}`}
                  disabled={
                    disabled || busy || !!draft || (kind === "children" && !!linked.archivedAt)
                  }
                  onClick={() => void remove(kind, linked)}
                  className={button}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
          {!data.total && <p className="text-sm text-gray-500">No linked tasks.</p>}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy || !!draft}
          onClick={() => start("link")}
          className={button}
        >
          Link existing task
        </button>
        <button
          type="button"
          disabled={disabled || busy || !!draft}
          onClick={() => start("child")}
          className={button}
        >
          Create child task
        </button>
      </div>
      <TaskModal
        open={!!draft}
        title={draft?.mode === "child" ? "Create child task" : "Link existing task"}
        busy={busy}
        onClose={clear}
      >
        {draft && (
          <form
            aria-label="Relationship editor"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const saved = { ...draft };
              void perform(async () => {
                if (saved.mode === "link")
                  return writer<WorkTodo>(
                    `/api/todos/${task.id}/relationships`,
                    "POST",
                    { kind: saved.kind, targetId: Number(saved.target) },
                    saved.revision,
                  );
                await writer("/api/todos", "POST", {
                  title: saved.title,
                  parentId: task.id,
                  parentRevision: saved.revision,
                  activityTypeId: saved.activityTypeId,
                });
                clear();
                return read<WorkTodo>(`/api/todos/${task.id}`);
              });
            }}
          >
            {error && (
              <p role="alert" className="break-words text-sm text-rose-500">
                {error}
              </p>
            )}
            {draft.revision !== task.revision && (
              <p role="alert" className="text-sm text-amber-500">
                This draft uses an older task version. Discard it and reload the task before trying
                again.
              </p>
            )}
            {draft.mode === "child" ? (
              <>
                <label className="block text-sm">
                  Child task title
                  <input
                    aria-label="Child task title"
                    required
                    maxLength={500}
                    value={draft.title}
                    disabled={busy || disabled}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="block text-sm">
                  Child activity type
                  <select
                    aria-label="Child activity type"
                    value={draft.activityTypeId ?? ""}
                    disabled={busy || disabled}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        activityTypeId: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                    className={`${input} mt-1`}
                  >
                    <option value="">Unclassified</option>
                    {activityTypes
                      .filter((context) => context.active)
                      .map((context) => (
                        <option key={context.id} value={context.id}>
                          {context.name}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="text-xs text-gray-500">
                  New · Normal. Own status, checklist, notes and relationships. No automatic
                  dependency.
                </p>
              </>
            ) : (
              <>
                <label className="block text-sm">
                  Relationship
                  <select
                    aria-label="Relationship type"
                    value={draft.kind}
                    disabled={busy || disabled}
                    onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
                    className={`${input} mt-1`}
                  >
                    <option value="child">This task is a parent of</option>
                    <option value="parent">This task is a child of</option>
                    <option value="blocked-by">This task is blocked by</option>
                    <option value="blocks">This task blocks</option>
                    <option value="related">Related to (nonblocking)</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Find task
                  <input
                    aria-label="Find relationship task"
                    maxLength={500}
                    placeholder="Title or TASK reference"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setSearchPage(1);
                    }}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(event) => {
                      setArchived(event.target.checked);
                      setSearchPage(1);
                    }}
                  />
                  Search archived tasks
                </label>
                {searchError && (
                  <p role="alert" className="text-sm text-rose-500">
                    {searchError}
                  </p>
                )}
                <label className="block text-sm">
                  Task
                  <select
                    aria-label="Relationship task"
                    required
                    value={draft.target}
                    disabled={busy || disabled || !choices}
                    onChange={(event) => setDraft({ ...draft, target: event.target.value })}
                    className={`${input} mt-1`}
                  >
                    <option value="">{choices ? "Choose a task" : "Searching…"}</option>
                    {draft.target &&
                      !choices?.items.some((item) => String(item.id) === draft.target) && (
                        <option value={draft.target}>
                          {taskReference(Number(draft.target))} (selected)
                        </option>
                      )}
                    {choices?.items
                      .filter((item) => item.id !== task.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.reference} · {item.title} · {item.status}
                        </option>
                      ))}
                  </select>
                </label>
                {choices && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span>
                      {choices.total} results · Page {choices.page}
                    </span>
                    <button
                      type="button"
                      disabled={choices.page <= 1}
                      onClick={() => setSearchPage(choices.page - 1)}
                      className={button}
                    >
                      Previous results
                    </button>
                    <button
                      type="button"
                      disabled={choices.page * choices.pageSize >= choices.total}
                      onClick={() => setSearchPage(choices.page + 1)}
                      className={button}
                    >
                      Next results
                    </button>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={
                  busy ||
                  disabled ||
                  draft.revision !== task.revision ||
                  (draft.mode === "child" ? !draft.title.trim() : !draft.target)
                }
                className={`${button} bg-blue-600 text-white`}
              >
                {busy ? "Saving…" : draft.mode === "child" ? "Create child" : "Save relationship"}
              </button>
              <button type="button" disabled={busy} onClick={clear} className={button}>
                Discard relationship draft
              </button>
            </div>
          </form>
        )}
      </TaskModal>
    </section>
  );
});
