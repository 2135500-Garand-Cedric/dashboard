"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import {
  WORK_STATUSES,
  WORK_PRIORITIES,
  WORK_KINDS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  KIND_LABELS,
  priorityOf,
  isClosed,
  taskReference,
  type WorkContact,
  type WorkContext,
  type WorkResults,
  type WorkTodo,
  type WorkStatus,
} from "@/lib/work-management/types";
import { describeWorkDate } from "@/lib/work-management/date-format";
import ProjectPicker from "@/components/projects/ProjectPicker";
import TodoBoard from "@/components/todos/TodoBoard";
import TaskClosureDialog from "@/components/todos/TaskClosureDialog";
import WorkContextManager from "@/components/todos/WorkContextManager";
import ContactManager from "./ContactManager";
import ContactPicker from "./ContactPicker";
import TaskQuickPanel from "./TaskQuickPanel";
import { useWorkDraftGuard } from "./useWorkDraftGuard";
const inputClass =
  "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm";
const buttonClass =
  "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";

const captureWriter = createWorkWriter();
type CaptureDraft = { title: string; company: string; contextId: number | null };
const captureDrafts = new Map<string, CaptureDraft>();

export default function AllWork({
  projectId,
  projectContextId,
  basePath = "/todos",
  onTasksChanged,
  projectStages,
  allowCapture = true,
  refreshSignal = 0,
}: {
  projectId?: number;
  projectContextId?: number | null;
  basePath?: string;
  onTasksChanged?: () => void;
  projectStages?: { id: number; name: string; active: boolean }[];
  allowCapture?: boolean;
  refreshSignal?: number;
}) {
  const captureDraft = captureDrafts.get(basePath) ?? null;
  const params = useSearchParams(),
    serialized = params.toString();
  const query = new URLSearchParams(serialized);
  if (projectId) query.set("project", String(projectId));
  query.delete("mode");
  query.delete("task");
  const queryString = query.toString(),
    mode = params.get("mode") === "board" ? "board" : "list",
    view = params.get("view") || "active";
  const selectedId =
    params.get("task") && /^\d+$/.test(params.get("task")!) ? Number(params.get("task")) : null;
  const [data, setData] = useState<WorkResults | null>(null),
    [contexts, setContexts] = useState<WorkContext[] | null>(null),
    [person, setPerson] = useState<WorkContact[]>([]);
  const [refresh, setRefresh] = useState(0),
    [error, setError] = useState(""),
    [catalogError, setCatalogError] = useState(""),
    [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(!!captureDraft),
    [title, setTitle] = useState(captureDraft?.title ?? ""),
    [captureContext, setCaptureContext] = useState<number | null>(captureDraft?.contextId ?? null),
    [captureCompany, setCaptureCompany] = useState(captureDraft?.company ?? "");
  const [busy, setBusy] = useState(false),
    [closure, setClosure] = useState<{
      task: WorkTodo;
      status: "IN_PROGRESS" | "DONE" | "CANCELLED";
    } | null>(null),
    [notice, setNotice] = useState("");
  const write = useRef(captureWriter),
    lock = useRef(false),
    lastOpened = useRef<number | null>(null);
  const captureRef = useRef<typeof captureDraft>(null);
  captureRef.current =
    creating && (!!title || !!captureCompany)
      ? { title, company: captureCompany, contextId: captureContext }
      : null;
  const confirmLeave = useWorkDraftGuard(creating && (!!title || !!captureCompany), () => {
    captureDrafts.delete(basePath);
    captureRef.current = null;
  });
  useEffect(
    () => () => {
      if (captureRef.current) captureDrafts.set(basePath, captureRef.current);
      else captureDrafts.delete(basePath);
    },
    [basePath],
  );
  const contextValue = params.get("context") || "",
    personId = params.get("person") || "";
  function navigate(changes: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const href = `${basePath}${next.size ? `?${next}` : ""}`;
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
  }
  function filter(key: string, value: string) {
    const viewChange: Record<string, string | null> =
      key === "status" && value && view !== "archived" && view !== "all"
        ? { view: isClosed(value) ? "history" : null }
        : {};
    navigate(
      { ...viewChange, ...(key === "project" ? { stage: null } : {}), [key]: value, page: null },
      true,
    );
  }
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const timer = setTimeout(() => {
      void workRead<WorkResults>(`/api/work-items?${queryString}`)
        .then((value) => {
          if (active) setData(value);
        })
        .catch((error) => {
          if (active) setError(error instanceof Error ? error.message : "Unable to load work.");
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [queryString, refresh, refreshSignal]);
  useEffect(() => {
    let active = true;
    void workRead<WorkContext[]>("/api/work-contexts")
      .then((value) => {
        if (active) {
          setContexts(value);
          setCaptureContext((previous) =>
            previous !== null && !value.some((context) => context.id === previous && context.active)
              ? null
              : previous,
          );
          setCatalogError("");
        }
      })
      .catch((error) => {
        if (active)
          setCatalogError(error instanceof Error ? error.message : "Unable to load contexts.");
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!personId) {
      setPerson([]);
      return;
    }
    let active = true;
    void workRead<WorkContact>(`/api/work-contacts/${encodeURIComponent(personId)}`)
      .then((value) => {
        if (active) setPerson([value]);
      })
      .catch(() => {
        if (active) setPerson([]);
      });
    return () => {
      active = false;
    };
  }, [personId]);
  useEffect(() => {
    if (selectedId || !lastOpened.current) return;
    // Let the native dialog finish restoring focus before targeting a refreshed row.
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(`[data-open-task="${lastOpened.current}"]`)
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [selectedId, data]);
  function open(task: WorkTodo) {
    if (!confirmLeave()) return;
    setCreating(false);
    setTitle("");
    setCaptureCompany("");
    lastOpened.current = task.id;
    navigate({ task: String(task.id) });
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await action();
      onTasksChanged?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save this change.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function move(task: WorkTodo, status: WorkStatus) {
    if (lock.current || task.status === status) return;
    if (isClosed(task.status) || task.archivedAt) {
      open(task);
      return;
    }
    if (isClosed(status) || status === "IN_PROGRESS") {
      setActionError("");
      setClosure({ task, status: status as "IN_PROGRESS" | "DONE" | "CANCELLED" });
      return;
    }
    await perform(async () => {
      await write.current(`/api/todos/${task.id}`, "PATCH", { status }, task.revision);
      setRefresh((value) => value + 1);
    });
  }
  const page = data?.page ?? 1,
    pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="min-w-0 pb-6 pt-12 md:pt-0">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          {projectId ? (
            <h2 className="text-2xl font-bold">Project tasks</h2>
          ) : (
            <h1 className="text-2xl font-bold">All Work</h1>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {data ? `${data.total} matching ${data.total === 1 ? "task" : "tasks"}` : "Tasks"}
          </p>
        </div>
        <button
          type="button"
          disabled={!contexts || busy || !allowCapture}
          className={`${buttonClass} bg-blue-600 text-white`}
          onClick={() => {
            if (creating) {
              if (confirmLeave()) {
                setCreating(false);
                setTitle("");
                setCaptureCompany("");
              }
              return;
            }
            setCaptureContext(
              projectId
                ? (projectContextId ?? null)
                : contextValue === "none"
                  ? null
                  : contextValue
                    ? (contexts?.find(
                        (context) => context.id === Number(contextValue) && context.active,
                      )?.id ?? null)
                    : (contexts?.find((context) => context.key === "personal" && context.active)
                        ?.id ?? null),
            );
            setCreating(true);
            setActionError("");
          }}
        >
          + New task
        </button>
      </header>
      {projectStages && (
        <label className="mb-4 block max-w-xl text-sm">
          Stage filter
          <select
            aria-label="Stage filter"
            value={params.get("stage") || ""}
            onChange={(event) => filter("stage", event.target.value)}
            className={inputClass}
          >
            <option value="">All stages</option>
            {projectStages.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
      )}
      {!projectId && (
        <div className="mb-4 max-w-xl">
          <ProjectPicker
            value={params.get("project") || ""}
            onChange={(value) => filter("project", value)}
            label="Project filter"
          />
        </div>
      )}
      {creating && (
        <form
          aria-label="Quick capture"
          className="mb-5 space-y-3 rounded-xl border border-card-border bg-card-bg p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              const row = await write.current<WorkTodo>("/api/todos", "POST", {
                title,
                ...(projectId ? { projectId } : {}),
                contextId: captureContext,
                ...(captureCompany ? { company: captureCompany } : {}),
              });
              captureDrafts.delete(basePath);
              captureRef.current = null;
              setTitle("");
              setCaptureCompany("");
              setCreating(false);
              setNotice(`${row.reference ?? taskReference(row.id)} created.`);
              setRefresh((value) => value + 1);
            });
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm">
              Title
              <input
                aria-label="New todo title"
                autoFocus
                required
                maxLength={500}
                disabled={busy}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="max-w-full text-sm">
              Capture context
              <select
                aria-label="Capture context"
                disabled={busy}
                value={captureContext ?? ""}
                onChange={(event) =>
                  setCaptureContext(event.target.value ? Number(event.target.value) : null)
                }
                className={`${inputClass} mt-1`}
              >
                <option value="">Unclassified</option>
                {contexts
                  ?.filter((context) => context.active)
                  .map((context) => (
                    <option key={context.id} value={context.id}>
                      {context.name}
                    </option>
                  ))}
              </select>
            </label>
            <span className="py-2 text-sm text-gray-500">New · Normal</span>
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className={`${buttonClass} bg-blue-600 text-white`}
            >
              {busy ? "Saving…" : "Add task"}
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-gray-500">Optional details</summary>
            <label className="mt-3 block text-sm">
              Company
              <input
                aria-label="Capture company"
                maxLength={120}
                disabled={busy}
                value={captureCompany}
                onChange={(event) => setCaptureCompany(event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
          </details>
        </form>
      )}
      <section
        aria-label="Work filters"
        className="mb-5 space-y-4 rounded-xl border border-card-border bg-card-bg p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Work views">
            {[
              ["active", "Active"],
              ["history", "Completed history"],
              ["archived", "Archived"],
              ["all", "All unarchived"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() =>
                  navigate({ view: key === "active" ? null : key, page: null, status: null })
                }
                className={`${buttonClass} ${view === key ? "bg-blue-600 text-white" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2" aria-label="Presentation">
            {["list", "board"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => navigate({ mode: value === "list" ? null : value })}
                className={`${buttonClass} capitalize ${mode === value ? "bg-blue-600 text-white" : ""}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="text-sm">
            Search
            <input
              aria-label="Search work"
              placeholder="Reference, title or description"
              maxLength={500}
              value={params.get("q") || ""}
              onChange={(event) => filter("q", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm">
            Context
            <select
              aria-label="Filter context"
              value={contextValue}
              onChange={(event) => filter("context", event.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All contexts</option>
              <option value="none">Unclassified</option>
              {contexts?.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.name}
                  {!context.active ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Sort
            <select
              aria-label="Sort work"
              value={params.get("sort") || "updated"}
              onChange={(event) => filter("sort", event.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="priority">Priority: Urgent first</option>
              <option value="title">Title: A–Z</option>
              <option value="deadline">Deadline: earliest first</option>
              <option value="followup">Follow-up: earliest first</option>
            </select>
          </label>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">
            Deadline
            <select
              aria-label="Filter deadline"
              value={params.get("due") || ""}
              onChange={(event) => filter("due", event.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All deadlines</option>
              <option value="overdue">Overdue (open tasks)</option>
              <option value="today">Today (open tasks)</option>
              <option value="upcoming">Upcoming (open tasks)</option>
              <option value="none">No deadline</option>
            </select>
          </label>
          <label className="text-sm">
            Follow-up
            <select
              aria-label="Filter follow-up"
              value={params.get("followup") || ""}
              onChange={(event) => filter("followup", event.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All follow-ups</option>
              <option value="due">Due (open tasks)</option>
              <option value="scheduled">Active (open tasks)</option>
              <option value="none">No active follow-up</option>
            </select>
          </label>
          {[
            ["deadlineFrom", "Deadline from"],
            ["deadlineTo", "Deadline through"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                type="date"
                aria-label={label}
                value={params.get(key) || ""}
                onChange={(event) => filter(key, event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            More filters
            {["company", "course", "person", "kind", "system", "tag", "status", "priority"].some(
              (key) => params.get(key),
            )
              ? " · Active"
              : ""}
          </summary>
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["status", "Status", WORK_STATUSES, STATUS_LABELS],
                ["priority", "Priority", WORK_PRIORITIES, PRIORITY_LABELS],
                ["kind", "Kind", WORK_KINDS, KIND_LABELS],
              ] as const
            ).map(([key, label, values, labels]) => (
              <label key={key} className="text-sm">
                {label}
                <select
                  aria-label={`Filter ${key}`}
                  value={params.get(key) || ""}
                  onChange={(event) => filter(key, event.target.value)}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">All</option>
                  {key !== "status" && (
                    <option value="none">
                      {key === "priority" ? "Unmapped legacy" : "Not recorded"}
                    </option>
                  )}
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {(labels as Record<string, string>)[value]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {[
              ["company", "Company", 120],
              ["course", "Course", 120],
              ["system", "System", 120],
              ["tag", "Tag (exact)", 50],
            ].map(([key, label, max]) => (
              <label key={key} className="text-sm">
                {label}
                <input
                  aria-label={`Filter ${key}`}
                  maxLength={Number(max)}
                  value={params.get(String(key)) || ""}
                  onChange={(event) => filter(String(key), event.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
            ))}
            <ContactPicker
              allowInactive
              label="Person"
              value={person}
              onChange={(contacts) => {
                setPerson(contacts);
                filter("person", contacts[0] ? String(contacts[0].id) : "");
              }}
            />
          </div>
        </details>
        <button
          type="button"
          onClick={() =>
            navigate(
              {
                due: null,
                followup: null,
                deadlineFrom: null,
                deadlineTo: null,
                q: null,
                context: null,
                company: null,
                course: null,
                person: null,
                kind: null,
                system: null,
                tag: null,
                status: null,
                priority: null,
                page: null,
                sort: null,
              },
              true,
            )
          }
          className="text-sm text-blue-500 underline"
        >
          Clear filters
        </button>
      </section>
      {catalogError && (
        <p role="alert" className="mb-4 text-rose-500">
          {catalogError}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry contexts
          </button>
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 text-rose-500">
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-emerald-500">
          {notice}
        </p>
      )}
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-500/30 p-4 text-rose-500">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry work
          </button>
        </p>
      ) : !data ? (
        <p role="status" className="p-4">
          Loading work…
        </p>
      ) : (
        <>
          {data.items.length === 0 ? (
            <p className="rounded-xl border border-card-border p-6 text-gray-500">
              No tasks match these filters.
            </p>
          ) : mode === "board" ? (
            <TodoBoard
              items={data.items}
              onOpen={open}
              onMove={(task, status) => void move(task, status)}
            />
          ) : (
            <section
              aria-label="Work list"
              className="overflow-hidden rounded-xl border border-card-border"
            >
              <div className="hidden grid-cols-[minmax(0,1fr)_140px_90px_160px] gap-4 border-b border-card-border bg-card-bg px-4 py-3 text-xs font-medium text-gray-500 xl:grid">
                <span>Task / next action</span>
                <span>Status</span>
                <span>Priority</span>
                <span>Context / people</span>
              </div>
              <ul className="divide-y divide-card-border">
                {data.items.map((task) => {
                  const priority = priorityOf(task);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        data-open-task={task.id}
                        onClick={() => open(task)}
                        className="grid w-full min-w-0 gap-3 p-4 text-left hover:bg-blue-500/5 focus-visible:outline-2 focus-visible:outline-blue-500 xl:grid-cols-[minmax(0,1fr)_140px_90px_160px]"
                      >
                        <span className="min-w-0">
                          <span className="mb-1 block text-xs text-gray-500">
                            {task.reference ?? taskReference(task.id)}
                            {task.company ? ` · ${task.company}` : ""}
                            {task.course ? ` · ${task.course}` : ""}
                          </span>
                          <span className="block break-words font-medium [overflow-wrap:anywhere]">
                            {task.title}
                          </span>
                          {task.nextAction && (
                            <span className="mt-1 block break-words text-sm text-gray-500">
                              Next: {task.nextAction}
                            </span>
                          )}
                          {task.status === "WAITING" && (
                            <span className="mt-1 block break-words text-xs text-amber-500">
                              Waiting
                              {task.waitingOnContact || task.waitingOn
                                ? ` on ${task.waitingOnContact?.name ?? task.waitingOn}`
                                : ""}
                              {task.waitingReason ? ` · ${task.waitingReason}` : ""}
                            </span>
                          )}
                          {(task.deadlineDate || task.deadlineAt) && (
                            <span
                              className={`mt-1 block text-xs ${task.deadlineState === "OVERDUE" ? "text-rose-500" : "text-gray-500"}`}
                            >
                              Deadline:{" "}
                              {describeWorkDate({
                                date: task.deadlineDate ?? null,
                                at: task.deadlineAt ?? null,
                                timeZone: task.deadlineTimeZone ?? null,
                              })}
                              {task.deadlineState === "OVERDUE" ? " · Overdue" : ""}
                            </span>
                          )}
                          {task.activeFollowUp && (
                            <span className="mt-1 block text-xs text-amber-500">
                              Follow-up: {describeWorkDate(task.activeFollowUp)}
                              {task.activeFollowUp.state === "DUE" ? " · Due" : ""}
                            </span>
                          )}
                          {task.workaround && (
                            <span className="mt-1 block text-xs text-amber-500">
                              Workaround available
                            </span>
                          )}
                        </span>
                        <span className="text-sm">
                          {STATUS_LABELS[task.status]}
                          {task.isBlocked && (
                            <span className="mt-1 block text-xs text-amber-500">
                              Blocked · {task.blockingCount}
                            </span>
                          )}
                          <span className="mt-1 block text-xs text-gray-500">
                            Checklist {task.subtasks?.filter((item) => item.done).length ?? 0}/
                            {task.subtasks?.length ?? 0} · Children {task.completedChildCount ?? 0}/
                            {task.childCount ?? 0}
                          </span>
                        </span>
                        <span
                          className={`text-sm ${priority === "URGENT" ? "font-semibold text-rose-500" : "text-gray-500"}`}
                        >
                          {priority ? PRIORITY_LABELS[priority] : "Unmapped"}
                        </span>
                        <span className="min-w-0 break-words text-xs text-gray-500">
                          {task.context?.name ?? "Unclassified"}
                          {task.requester && (
                            <span className="mt-1 block">Requested by {task.requester.name}</span>
                          )}
                          {task.affectedPeople && task.affectedPeople.length > 0 && (
                            <span className="mt-1 block">
                              Affects {task.affectedPeople.map((person) => person.name).join(", ")}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <nav
            aria-label="Work pages"
            className="my-5 flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <span>
              {data.total
                ? `${(page - 1) * data.pageSize + 1}–${Math.min(page * data.pageSize, data.total)} of ${data.total}`
                : "0 results"}{" "}
              · Page {page}/{pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => navigate({ page: String(page - 1) })}
                className={buttonClass}
              >
                Previous page
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => navigate({ page: String(page + 1) })}
                className={buttonClass}
              >
                Next page
              </button>
            </div>
          </nav>
        </>
      )}
      <div className="mt-6 grid min-w-0 gap-3">
        <WorkContextManager
          contexts={contexts ?? []}
          onRefresh={async () => {
            setRefresh((value) => value + 1);
          }}
        />
        <ContactManager />
      </div>
      {closure && (
        <TaskClosureDialog
          task={closure.task}
          status={closure.status}
          busy={busy}
          error={actionError}
          onCancel={() => setClosure(null)}
          onConfirm={(body, revision) =>
            perform(async () => {
              await write.current(`/api/todos/${closure.task.id}`, "PATCH", body, revision);
              setClosure(null);
              setRefresh((value) => value + 1);
            })
          }
        />
      )}
      {selectedId && (
        <TaskQuickPanel
          key={selectedId}
          id={selectedId}
          returnTo={`${basePath}${(() => {
            const back = new URLSearchParams(serialized);
            back.delete("task");
            return back.size ? `?${back}` : "";
          })()}`}
          onClose={() => navigate({ task: null }, true)}
          onChanged={() => {
            setRefresh((value) => value + 1);
            onTasksChanged?.();
          }}
        />
      )}
    </div>
  );
}
