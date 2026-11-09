"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { WORK_STATUSES, STATUS_LABELS, isClosed, taskReference, type WorkContext, type WorkTodo, type WorkStatus } from "@/lib/work-management/types";
import { useSnackbar } from "@/context/SnackbarContext";
import { useMemory } from "@/context/MemoryContext";
import TodoColumn from "./TodoColumn";
import TodoCard from "./TodoCard";
import TaskClosureDialog from "./TaskClosureDialog";
import WorkContextManager from "./WorkContextManager";

export default function TodoBoard({ setUserXp, setUserCoins }: { setUserXp: React.Dispatch<React.SetStateAction<number>>; setUserCoins: React.Dispatch<React.SetStateAction<number>> }) {
  const [todos, setTodos] = useState<WorkTodo[]>([]), [contexts, setContexts] = useState<WorkContext[]>([]);
  const [loading, setLoading] = useState(true), [creating, setCreating] = useState(false), [newTitle, setNewTitle] = useState("");
  const [captureContext, setCaptureContext] = useState<number | null>(null), [contextFilter, setContextFilter] = useState("all");
  const [archived, setArchived] = useState(false), [search, setSearch] = useState("");
  const [closure, setClosure] = useState<{ task: WorkTodo; status: "DONE" | "CANCELLED" } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [actionError, setActionError] = useState("");
  const captureInitialized = useRef(false), busyRef = useRef(false), write = useRef(createWorkWriter());
  const { pageRouter } = useMemory(), { showMessage } = useSnackbar();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, user, catalog] = await Promise.all([workRead<WorkTodo[]>("/api/todos?archived=all"), workRead<{ totalXp: number; coins: number }>("/api/users"), workRead<WorkContext[]>("/api/work-contexts")]);
      setTodos(data); setUserXp(user.totalXp); setUserCoins(user.coins); setContexts(catalog); setError("");
      if (!captureInitialized.current) { setCaptureContext(catalog.find(context => context.key === "personal" && context.active)?.id ?? null); captureInitialized.current = true; }
      else setCaptureContext(previous => previous !== null && !catalog.some(context => context.id === previous && context.active) ? null : previous);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load tasks."); }
    finally { setLoading(false); }
  }, [setUserXp, setUserCoins]);
  useEffect(() => { void load(); }, [load]);
  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError("");
    try { await action(); }
    catch (error) { const message = error instanceof Error ? error.message : "Unable to save this change."; setActionError(message); showMessage(message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function move(task: WorkTodo, status: WorkStatus) {
    if (busyRef.current || task.status === status) return;
    if (isClosed(task.status) || task.archivedAt) { pageRouter('/todos', `/todos/${task.id}`); return; }
    if (status === "DONE" || status === "CANCELLED") { setActionError(""); setClosure({ task, status }); return; }
    await perform(async () => { await write.current(`/api/todos/${task.id}`, "PATCH", { status }, task.revision); await load(); });
  }
  const visible = todos.filter(task => !!task.archivedAt === archived && (contextFilter === "all" || (task.contextId ?? null) === (contextFilter === "none" ? null : Number(contextFilter))) && `${task.title} ${task.reference ?? taskReference(task.id)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const open = (task: WorkTodo) => pageRouter('/todos', `/todos/${task.id}`);
  return <div>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <button type="button" disabled={loading} onClick={() => setCreating(value => !value)} className="inline-flex items-center gap-2 rounded-lg border border-card-border px-3 py-2"><PlusIcon className="h-5 w-5" />New</button>
      <label className="text-sm">Filter context<select aria-label="Filter context" value={contextFilter} onChange={event => { const value = event.target.value; setContextFilter(value); if (value !== "all") setCaptureContext(value === "none" || !contexts.some(context => context.id === Number(value) && context.active) ? null : Number(value)); }} className="ml-2 max-w-full rounded border bg-card-bg p-2"><option value="all">All contexts</option><option value="none">Unclassified</option>{contexts.map(context => <option key={context.id} value={context.id}>{context.name}{!context.active ? " (inactive)" : ""}</option>)}</select></label>
      <input aria-label="Search tasks" placeholder="Search title or reference" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 max-w-full rounded border bg-card-bg p-2" />
      <button type="button" onClick={() => setArchived(value => !value)} aria-pressed={archived} className="rounded border px-3 py-2">{archived ? "Show active" : "Show archived"}</button>
    </div>
    {creating && <form className="mb-4 flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-card-border p-3" onSubmit={event => { event.preventDefault(); void perform(async () => { await write.current("/api/todos", "POST", { title: newTitle, contextId: captureContext }); setNewTitle(""); setCreating(false); await load(); }); }}>
      <label className="min-w-0 flex-1 text-sm">Title<input aria-label="New todo title" required maxLength={500} value={newTitle} onChange={event => setNewTitle(event.target.value)} className="block w-full min-w-0 rounded border bg-card-bg p-2" /></label>
      <label className="max-w-full text-sm">Capture context<select aria-label="Capture context" value={captureContext ?? ""} onChange={event => setCaptureContext(event.target.value ? Number(event.target.value) : null)} className="block max-w-full rounded border bg-card-bg p-2"><option value="">Unclassified</option>{contexts.filter(context => context.active).map(context => <option key={context.id} value={context.id}>{context.name}</option>)}</select></label>
      <span className="py-2 text-sm text-gray-500">New · Normal</span><button type="submit" disabled={busy || !newTitle.trim()} className="rounded bg-blue-600 px-4 py-2 text-white">Add</button>
    </form>}
    <WorkContextManager contexts={contexts} onRefresh={load} />
    {error && <p role="alert" className="mb-4 text-rose-500">{error} <button type="button" onClick={() => void load()} className="underline">Retry</button></p>}
    {loading ? <p role="status">Loading…</p> : archived ? <section aria-label="Archived tasks"><h2 className="mb-3 text-xl font-semibold">Archived</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-3">{visible.map(task => <TodoCard key={task.id} todo={task} onOpen={() => open(task)} />)}</div>{!visible.length && <p>No archived tasks match.</p>}</section> : <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 2xl:grid-cols-6">{WORK_STATUSES.filter(status => status !== "CANCELLED").map(status => <div key={status} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const task = todos.find(task => task.id === Number(event.dataTransfer.getData("text/plain"))); if (task) void move(task, status); }}>
        <TodoColumn title={STATUS_LABELS[status]} color={status === "DONE" ? "var(--success)" : status === "WAITING" ? "var(--warning)" : "var(--accent)"} items={visible.filter(task => task.status === status)} onOpen={open} />
      </div>)}</div>
      <details className="mt-5 rounded-lg border border-card-border p-3"><summary className="cursor-pointer font-medium">Cancelled ({visible.filter(task => task.status === "CANCELLED").length})</summary><div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">{visible.filter(task => task.status === "CANCELLED").map(task => <TodoCard key={task.id} todo={task} onOpen={() => open(task)} />)}</div></details>
    </>}
    {closure && <TaskClosureDialog task={closure.task} status={closure.status} busy={busy} error={actionError} onCancel={() => setClosure(null)} onConfirm={async body => { await perform(async () => { await write.current(`/api/todos/${closure.task.id}`, "PATCH", body, closure.task.revision); setClosure(null); await load(); }); }} />}
  </div>;
}
