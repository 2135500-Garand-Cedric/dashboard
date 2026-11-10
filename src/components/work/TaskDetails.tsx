"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { isClosed, STATUS_LABELS, WORK_STATUSES, taskReference, type ChecklistItem, type WorkContact, type WorkContext, type WorkResults, type WorkStatus, type WorkTodo } from "@/lib/work-management/types";
import TaskFoundationFields, { foundationDraft, foundationPayload, type TaskFoundationDraft } from "@/components/todos/TaskFoundationFields";
import TaskClosureDialog from "@/components/todos/TaskClosureDialog";
import TaskActivityPreview from "@/components/todos/TaskActivityPreview";
import ContactPicker from "./ContactPicker";
import { useWorkDraftGuard } from "./useWorkDraftGuard";
const inputClass = "scroll-mt-24 w-full min-w-0 rounded-lg border border-card-border bg-card-bg p-2";
const buttonClass = "scroll-mt-24 rounded-lg border border-card-border px-3 py-2 text-sm disabled:opacity-50";
type People = { requester: WorkContact[]; waiting: WorkContact[]; affected: WorkContact[] };
const peopleOf = (task: WorkTodo): People => ({ requester: task.requester ? [task.requester] : [], waiting: task.waitingOnContact ? [task.waitingOnContact] : [], affected: task.affectedPeople ?? [] });
const personPayload = (people: People) => ({ requesterId: people.requester[0]?.id ?? null, waitingOnContactId: people.waiting[0]?.id ?? null, affectedContactIds: people.affected.map(person => person.id) });
type TaskDraft = { base: WorkTodo; title: string; description: string; summary: string; draft: TaskFoundationDraft; people: People; dependencyId: number | null; xp: number; coins: number; newStep: string; stepDrafts: Record<number, string> };
// Browser-memory only: no localStorage, database draft writes or fake history.
const taskDrafts = new Map<number, TaskDraft>();
const time = (value?: string | null) => value ? new Date(value).toLocaleString("en-CA", { timeZone: "America/Toronto" }) : "Not recorded";

export default function TaskDetails({ todoId, panel = false, returnTo = "/todos", onClose, onChanged }: { todoId: number; panel?: boolean; returnTo?: string; onClose: () => void; onChanged?: () => void }) {
  const [todo, setTodo] = useState<WorkTodo | null>(null), [contexts, setContexts] = useState<WorkContext[]>([]), [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(""), [description, setDescription] = useState(""), [summary, setSummary] = useState("");
  const [draft, setDraft] = useState<TaskFoundationDraft | null>(null), [people, setPeople] = useState<People>({ requester: [], waiting: [], affected: [] });
  const [dependencyId, setDependencyId] = useState<number | null>(null), [dependencySearch, setDependencySearch] = useState(""), [choices, setChoices] = useState<WorkTodo[]>([]), [dependencyError, setDependencyError] = useState("");
  const [xp, setXp] = useState(0), [coins, setCoins] = useState(0), [newStep, setNewStep] = useState(""), [stepDrafts, setStepDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [closure, setClosure] = useState<"DONE" | "CANCELLED" | null>(null);
  const write = useRef(createWorkWriter()), lock = useRef(false), current = useRef(todoId), generation = useRef(0), retryAction = useRef<(() => Promise<void>) | null>(null);
  current.current = todoId;
  const dirty = !!todo && todo.id === todoId && ((editing && (title !== todo.title || description !== (todo.description ?? "") || summary !== (todo.completionSummary ?? "") || JSON.stringify(draft) !== JSON.stringify(foundationDraft(todo)) || JSON.stringify(personPayload(people)) !== JSON.stringify(personPayload(peopleOf(todo))) || dependencyId !== (todo.dependsOnId ?? null) || xp !== (todo.rewardXp ?? 0) || coins !== (todo.rewardCoins ?? 0))) || !!newStep || Object.keys(stepDrafts).length > 0);
  const liveDraft = useRef<TaskDraft | null>(null), discarded = useRef(false);
  liveDraft.current = dirty && todo && draft && !discarded.current ? { base: todo, title, description, summary, draft, people, dependencyId, xp, coins, newStep, stepDrafts } : null;
  const forgetDraft = useCallback(() => { discarded.current = true; liveDraft.current = null; taskDrafts.delete(todoId); }, [todoId]);
  const confirmLeave = useWorkDraftGuard(dirty, forgetDraft);
  useEffect(() => () => { if (liveDraft.current) taskDrafts.set(todoId, liveDraft.current); }, [todoId]);
  const adopt = useCallback((task: WorkTodo) => {
    setTodo(previous => ({ ...task, dependents: task.dependents ?? previous?.dependents, dependentCount: task.dependentCount ?? previous?.dependentCount }));
    setTitle(task.title); setDescription(task.description ?? ""); setSummary(task.completionSummary ?? ""); setDraft(foundationDraft(task)); setPeople(peopleOf(task));
    setDependencyId(task.dependsOnId ?? null); setXp(task.rewardXp ?? 0); setCoins(task.rewardCoins ?? 0); setNewStep(""); setStepDrafts({});
  }, []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoadError("");
    const [task, catalog] = await Promise.all([workRead<WorkTodo>(`/api/todos/${todoId}`), workRead<WorkContext[]>("/api/work-contexts")]);
    if (current.current !== todoId || generation.current !== version) return;
    const saved = taskDrafts.get(todoId);
    if (saved) {
      adopt(saved.base); setTitle(saved.title); setDescription(saved.description); setSummary(saved.summary); setDraft(saved.draft); setPeople(saved.people); setDependencyId(saved.dependencyId); setXp(saved.xp); setCoins(saved.coins); setNewStep(saved.newStep); setStepDrafts(saved.stepDrafts); setEditing(true); discarded.current = false;
      setNotice("Unsaved draft restored. Save to apply it, or discard edits.");
    } else { adopt(task); setEditing(false); }
    setContexts(catalog); setError(""); setDependencySearch("");
  }, [todoId, adopt]);
  useEffect(() => { void load().catch(error => { if (current.current === todoId) setLoadError(error instanceof Error ? error.message : "Unable to load task."); }); }, [load, todoId]);
  useEffect(() => {
    if (!editing) return;
    let active = true;
    const timer = setTimeout(() => { void workRead<WorkResults>(`/api/work-items?view=all&q=${encodeURIComponent(dependencySearch)}`).then(data => { if (active) { setChoices(data.items.filter(item => item.id !== todoId)); setDependencyError(""); } }).catch(error => { if (active) setDependencyError(error instanceof Error ? error.message : "Unable to load prerequisites."); }); }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [dependencySearch, editing, todoId]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice(""); retryAction.current = action;
    try { await action(); retryAction.current = null; }
    catch (error) { if (current.current === todoId) setError(error instanceof Error ? error.message : "Unable to save this change."); }
    finally { lock.current = false; setBusy(false); }
  }
  function close() { if (!busy && confirmLeave()) onClose(); }
  if (!todo || todo.id !== todoId || !draft) return <div className="p-5"><button type="button" data-close-task onClick={close} className={buttonClass}>{panel ? "Close details" : "Back to All Work"}</button>{loadError ? <p role="alert" className="mt-4 text-rose-500">{loadError} <button type="button" onClick={() => void load().catch(error => setLoadError(error instanceof Error ? error.message : "Unable to load task."))} className="underline">Retry</button></p> : <p role="status" className="mt-4">Loading task…</p>}</div>;
  async function patch(body: Record<string, unknown>) {
    const updated = await write.current<WorkTodo>(`/api/todos/${todoId}`, "PATCH", body, todo!.revision);
    if (current.current !== todoId) return;
    adopt(updated); onChanged?.();
  }
  async function save() {
    if (Object.keys(stepDrafts).length || newStep.trim()) throw new Error("Save or discard the pending checklist changes before saving the task.");
    await patch({ title, ...(description !== (todo!.description ?? "") ? { description } : {}), ...foundationPayload(draft!), ...personPayload(people), dependsOnId: dependencyId, rewardXp: xp, rewardCoins: coins, ...(isClosed(todo!.status) ? { completionSummary: summary || null } : {}) });
    forgetDraft(); setEditing(false); setNotice("Task saved.");
  }
  async function stepChange(step: ChecklistItem, body: Record<string, unknown>, remove = false) {
    const result = await write.current<ChecklistItem>(`/api/todos/subtasks/${step.id}`, remove ? "DELETE" : "PATCH", remove ? undefined : body, step.revision);
    if (current.current !== todoId) return;
    setTodo(previous => previous ? { ...previous, revision: previous.revision + 1, subtasks: remove ? previous.subtasks?.filter(item => item.id !== step.id) : previous.subtasks?.map(item => item.id === step.id ? result : item) } : previous);
    setStepDrafts(previous => { const next = { ...previous }; delete next[step.id]; return next; }); onChanged?.();
  }
  const selectedDependency = choices.find(item => item.id === dependencyId) ?? (todo.dependsOn?.id === dependencyId ? todo.dependsOn : null);
  return <article data-work-dirty={dirty} className="min-w-0 p-4 sm:p-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} data-close-task onClick={close} className={buttonClass}>{panel ? "Close details" : "← All Work"}</button>{panel && <Link href={`/todos/${todoId}?returnTo=${encodeURIComponent(returnTo)}`} className={buttonClass}>Open full page</Link>}</div><div className="flex flex-wrap gap-2">{editing ? <><button type="button" disabled={busy} onClick={() => void perform(save)} className={`${buttonClass} bg-blue-600 text-white`}>Save</button><button type="button" disabled={busy} onClick={() => { if (confirmLeave()) { adopt(todo); setEditing(false); setError(""); } }} className={buttonClass}>Discard edits</button></> : <button type="button" disabled={busy || !!todo.archivedAt} onClick={() => { discarded.current = false; setEditing(true); }} className={buttonClass}>Edit</button>}</div></header>
    <p className="mb-2 text-sm text-gray-500">{todo.reference ?? taskReference(todo.id)}{todo.archivedAt ? " · Archived" : ""}</p>
    {editing ? <label className="block text-sm">Task title<input aria-label="Task title" required maxLength={500} disabled={busy} value={title} onChange={event => setTitle(event.target.value)} className={`${inputClass} mt-1 text-xl font-semibold`} /></label> : <h1 id={`task-title-${todoId}`} className="break-words text-2xl font-semibold [overflow-wrap:anywhere]">{todo.title}</h1>}
    {error && <div role="alert" className="my-4 rounded-lg border border-rose-500/30 p-3 text-sm text-rose-500">{error}<div className="mt-2 flex flex-wrap gap-3"><button type="button" disabled={busy} className="underline" onClick={() => { if (retryAction.current) void perform(retryAction.current); }}>Retry failed change</button><button type="button" disabled={busy} className="underline" onClick={() => { if (confirmLeave()) void perform(load); }}>Reload task</button></div></div>}{notice && <p role="status" className="my-3 text-sm text-emerald-500">{notice}</p>}
    <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
      <div className="min-w-0 space-y-6">
        <section><h2 className="mb-2 font-semibold">Description</h2>{editing ? <textarea aria-label="Description" maxLength={50000} rows={5} disabled={busy} value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /> : <p className="whitespace-pre-wrap break-words text-sm">{todo.description || "No description"}</p>}</section>
        <TaskFoundationFields section="main" task={todo} draft={draft} onChange={setDraft} contexts={contexts} editing={editing} disabled={busy} />
        {isClosed(todo.status) && <section aria-label="Closure information" className="rounded-lg border border-card-border p-3 text-sm"><h2 className="font-semibold">Completion outcome</h2><p className="mt-2">{todo.status === "DONE" ? "Completed" : "Cancelled"}: {time(todo.status === "DONE" ? todo.completedAt : todo.cancelledAt)}</p>{todo.closureType === "ACCEPTED_WORKAROUND" && <p className="mt-2 text-amber-500">Closed with an explicitly accepted workaround</p>}{editing ? <label className="mt-2 block">Completion summary<textarea aria-label="Completion summary" value={summary} disabled={busy} onChange={event => setSummary(event.target.value)} className={inputClass} /></label> : todo.completionSummary && <p className="mt-2 whitespace-pre-wrap break-words">{todo.completionSummary}</p>}</section>}
        <section aria-label="Checklist"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-semibold">Checklist</h2><span className="text-xs text-gray-500">{todo.subtasks?.filter(step => step.done).length ?? 0}/{todo.subtasks?.length ?? 0} completed</span></div><ul className="space-y-3">{todo.subtasks?.map(step => <li key={step.id} className="flex flex-wrap items-center gap-2"><input type="checkbox" aria-label={`Complete checklist: ${step.title}`} checked={step.done} disabled={busy || editing || !!todo.archivedAt} onChange={event => void perform(() => stepChange(step, { done: event.target.checked }))} />{editing ? <><input aria-label={`Subtask title: ${step.title}`} value={stepDrafts[step.id] ?? step.title} disabled={busy} onChange={event => setStepDrafts(previous => { const next = { ...previous }; if (event.target.value === step.title) delete next[step.id]; else next[step.id] = event.target.value; return next; })} onBlur={event => { if (event.target.value !== step.title) void perform(() => stepChange(step, { title: event.target.value })); }} className="min-w-0 flex-1 rounded border bg-card-bg p-2" /><button type="button" disabled={busy} aria-label={`Delete checklist: ${step.title}`} onClick={() => void perform(() => stepChange(step, {}, true))} className={`${buttonClass} text-rose-500`}>Delete</button></> : <span className={`min-w-0 break-words text-sm ${step.done ? "line-through text-gray-500" : ""}`}>{step.title}</span>}</li>)}</ul>{!todo.subtasks?.length && <p className="text-sm text-gray-500">No checklist items.</p>}{editing && <div className="mt-3 flex gap-2"><input aria-label="New checklist item" placeholder="New checklist item" maxLength={500} disabled={busy} value={newStep} onChange={event => setNewStep(event.target.value)} className={inputClass} /><button type="button" disabled={busy || !newStep.trim()} onClick={() => void perform(async () => { const step = await write.current<ChecklistItem>(`/api/todos/${todoId}/subtasks`, "POST", { title: newStep }, todo.revision); if (current.current !== todoId) return; setTodo(previous => previous ? { ...previous, revision: previous.revision + 1, subtasks: [...(previous.subtasks ?? []), step] } : previous); setNewStep(""); onChanged?.(); })} className={buttonClass}>Add step</button></div>}</section>
        <section className="space-y-3"><h2 className="font-semibold">Prerequisite</h2>{editing ? <><input aria-label="Search prerequisite" placeholder="Search title, description or TASK reference" maxLength={500} value={dependencySearch} onChange={event => setDependencySearch(event.target.value)} className={inputClass} />{dependencyError && <p role="alert" className="text-sm text-rose-500">{dependencyError}</p>}<select aria-label="Depends on" value={dependencyId ?? ""} disabled={busy} onChange={event => setDependencyId(event.target.value ? Number(event.target.value) : null)} className={inputClass}><option value="">None</option>{selectedDependency && !choices.some(item => item.id === selectedDependency.id) && <option value={selectedDependency.id}>{taskReference(selectedDependency.id)} · {selectedDependency.title}</option>}{choices.map(item => <option key={item.id} value={item.id}>{taskReference(item.id)} · {item.title}</option>)}</select><p className="text-xs text-gray-500">Showing up to 30 results. Search by reference to find a specific task.</p></> : todo.dependsOn ? <Link href={`/todos/${todo.dependsOn.id}`} className="break-words text-sm text-blue-500">{taskReference(todo.dependsOn.id)} · {todo.dependsOn.title}</Link> : <p className="text-sm text-gray-500">None</p>}{!!todo.dependentCount && <div className="text-sm"><h3 className="mb-2 font-medium">Tasks depending on this ({todo.dependentCount})</h3>{todo.dependents?.map(item => <Link key={item.id} href={`/todos/${item.id}`} className="mb-1 block break-words text-blue-500">{taskReference(item.id)} · {item.title}</Link>)}{todo.dependentCount > (todo.dependents?.length ?? 0) && <p className="text-xs text-gray-500">Showing the first 30 dependent tasks.</p>}</div>}</section>
        <TaskActivityPreview id={todoId} revision={todo.revision} />
      </div>
      <aside className="min-w-0 space-y-5 rounded-xl border border-card-border bg-card-bg p-4">
        <section className="space-y-3"><label className="block text-sm">Status<select aria-label="Task status" value={todo.status} disabled={busy || editing || !!todo.archivedAt || isClosed(todo.status)} onChange={event => { const status = event.target.value as WorkStatus; if (isClosed(status)) { setError(""); setClosure(status as "DONE" | "CANCELLED"); } else void perform(() => patch({ status })); }} className={`${inputClass} mt-1`}>{WORK_STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label><div className="flex flex-wrap gap-2">{isClosed(todo.status) && !todo.archivedAt && <button type="button" disabled={busy || editing} onClick={() => void perform(() => patch({ status: "TODO" }))} className={buttonClass}>Reopen task</button>}<button type="button" disabled={busy || editing} onClick={() => void perform(() => patch({ archived: !todo.archivedAt }))} className={buttonClass}>{todo.archivedAt ? "Restore task" : "Archive task"}</button></div></section>
        <TaskFoundationFields section="metadata" task={todo} draft={draft} onChange={setDraft} contexts={contexts} editing={editing} disabled={busy} />
        <section className="space-y-3"><h2 className="font-semibold">People</h2>{editing ? <><ContactPicker label="Requester" value={people.requester} disabled={busy} onChange={requester => setPeople(previous => ({ ...previous, requester }))} /><ContactPicker label="Affected people" multiple value={people.affected} disabled={busy} onChange={affected => setPeople(previous => ({ ...previous, affected }))} /><ContactPicker label="Waiting-on contact" value={people.waiting} disabled={busy} onChange={waiting => setPeople(previous => ({ ...previous, waiting }))} /></> : <dl className="space-y-3 text-sm">{[["Requester", people.requester], ["Affected people", people.affected], ["Waiting-on contact", people.waiting]].map(([label, contacts]) => <div key={String(label)}><dt className="text-gray-500">{String(label)}</dt><dd className="mt-1 break-words">{(contacts as WorkContact[]).map(contact => `${contact.name}${contact.company ? ` (${contact.company})` : ""}${!contact.active ? " · Inactive" : ""}`).join(", ") || "Not recorded"}</dd></div>)}</dl>}</section>
        <details open={!todo.context || todo.context.key === "personal"}><summary className="cursor-pointer text-sm font-medium">Personal rewards</summary><div className="mt-3 grid gap-3 text-sm"><label>XP reward{editing ? <input aria-label="XP reward" type="number" min={0} max={2147483647} disabled={busy} value={xp} onChange={event => setXp(Number(event.target.value))} className={inputClass} /> : <p>{todo.rewardXp ?? 0} XP</p>}</label><label>Coins reward{editing ? <input aria-label="Coins reward" type="number" min={0} max={2147483647} disabled={busy} value={coins} onChange={event => setCoins(Number(event.target.value))} className={inputClass} /> : <p>{todo.rewardCoins ?? 0} coins</p>}</label></div></details>
        <dl className="space-y-2 border-t border-card-border pt-3 text-xs text-gray-500"><div><dt>Created</dt><dd>{time(todo.createdAt)}</dd></div><div><dt>Updated</dt><dd>{time(todo.updatedAt)}</dd></div>{todo.archivedAt && <div><dt>Archived</dt><dd>{time(todo.archivedAt)}</dd></div>}</dl>
        {!editing && <button type="button" disabled={busy || !!todo.dependentCount} onClick={() => { if (confirmLeave() && window.confirm("Delete this task and its checklist? Linked calendar events and recorded history will be kept.")) void perform(async () => { await write.current(`/api/todos/${todoId}`, "DELETE", undefined, todo.revision); onChanged?.(); onClose(); }); }} className={`${buttonClass} text-rose-500`}>Delete task</button>}
      </aside>
    </div>
    {closure && <TaskClosureDialog task={todo} status={closure} busy={busy} error={error} onCancel={() => setClosure(null)} onConfirm={body => perform(async () => { await patch(body); setClosure(null); })} />}
  </article>;
}
