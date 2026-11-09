"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PencilSquareIcon,
  CheckIcon,
  FlagIcon,
  ArrowLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import { useSnackbar } from "@/context/SnackbarContext";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { useMemory } from "@/context/MemoryContext";

import { WORK_STATUSES, STATUS_LABELS, isClosed, priorityOf, taskReference, type WorkTodo as Todo, type ChecklistItem as Subtask, type WorkContext, type WorkStatus } from "@/lib/work-management/types";
import TaskFoundationFields, { foundationDraft, foundationPayload, type TaskFoundationDraft } from "@/components/todos/TaskFoundationFields";
import TaskClosureDialog from "@/components/todos/TaskClosureDialog";
import TaskActivityPreview from "@/components/todos/TaskActivityPreview";

export default function TodoPage() {
  const params = useParams();
  const todoId = Number(params.id);
  const currentId = useRef(todoId);
  currentId.current = todoId;
  const loadGeneration = useRef(0);
  const router = useRouter();
  const { get } = useMemory();
  const write = useRef(createWorkWriter());
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [todo, setTodo] = useState<Todo | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [editMode, setEditMode] = useState(false);

  // Draft fields
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [foundation, setFoundation] = useState<TaskFoundationDraft | null>(null);
  const [contexts, setContexts] = useState<WorkContext[]>([]);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [closure, setClosure] = useState<"DONE" | "CANCELLED" | null>(null);
  const [actionError, setActionError] = useState("");
  const [dependsOnId, setDependsOnId] = useState<number | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [xpDraft, setXpDraft] = useState<number>(0);
  const [coinsDraft, setCoinsDraft] = useState<number>(0);
  const [canDelete, setCanDelete] = useState(false);

  const { showMessage } = useSnackbar();

  const load = useCallback(async () => {
    if (currentId.current !== todoId) return;
    const generation = ++loadGeneration.current;
    const [data, allData, catalog] = await Promise.all([
      workRead<Todo>(`/api/todos/${todoId}`), workRead<Todo[]>("/api/todos?archived=all"), workRead<WorkContext[]>("/api/work-contexts"),
    ]);
    if (generation !== loadGeneration.current || currentId.current !== todoId) return;
    setTodo(data); setSubtasks(data.subtasks || []);
    setTitleDraft(data.title); setDescDraft(data.description || "");
    setFoundation(foundationDraft(data)); setContexts(catalog); setSummaryDraft(data.completionSummary ?? ""); setDependsOnId(data.dependsOn?.id ?? null);
    setXpDraft(data.rewardXp ?? 0); setCoinsDraft(data.rewardCoins ?? 0);
    setTodos(allData.filter(item => item.id !== todoId));
    setCanDelete(!allData.some(item => item.dependsOn?.id === todoId));
  }, [todoId]);

  const dependentTasks = todos.filter((t) => t.dependsOn?.id === todoId);

  useEffect(() => {
    setLoadError("");
    void load().catch(error => { if (currentId.current === todoId) setLoadError(error instanceof Error ? error.message : "Unable to load task."); });
  }, [load, todoId]);

  if (!todo || todo.id !== todoId || !foundation) return <div className="text-center py-10">{loadError ? <p role="alert">{loadError} <button onClick={() => window.location.reload()} className="underline">Retry</button></p> : "Loading..."}</div>;

  const perform = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setActionError("");
    try { await action(); }
    catch (error) { const message = error instanceof Error ? error.message : "Unable to save this change."; setActionError(message); showMessage(message); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const priority = priorityOf(todo);
  const priorityColor = priority === "URGENT" ? "text-rose-500" : priority === "HIGH" ? "text-red-500" : priority === "NORMAL" ? "text-yellow-500" : "text-green-500";
  const changeStatus = async (status: WorkStatus) => {
    if (status === "DONE" || status === "CANCELLED") { setActionError(""); setClosure(status); return; }
    await perform(async () => { await write.current(`/api/todos/${todoId}`, "PATCH", { status }, todo.revision); await load(); });
  };
  // Save todo fields
  const saveTodo = async () => {
    await write.current(`/api/todos/${todoId}`, "PATCH", {
      title: titleDraft, ...(descDraft !== (todo.description ?? "") ? { description: descDraft } : {}), ...foundationPayload(foundation),
      ...(isClosed(todo.status) ? { completionSummary: summaryDraft || null } : {}),
      dependsOnId, rewardXp: xpDraft, rewardCoins: coinsDraft,
    }, todo.revision);
    setEditMode(false);
    await load();
  };

  // Delete todo (only allowed if no other todo depends on it)
  const deleteTodo = async () => {
    const hasDependents = todos.some((t) => t.dependsOn?.id === todoId);
    if (hasDependents) {
      showMessage("Cannot delete this task because another task depends on it.");
      return;
    }

    if (!confirm("Delete this task and its checklist? Linked calendar events will be kept.")) return;
    await write.current(`/api/todos/${todoId}`, "DELETE", undefined, todo.revision);
    showMessage("Todo deleted successfully"); router.push("/todos");
  };

  // Subtask functions
  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    const created = await write.current<Subtask>(`/api/todos/${todoId}/subtasks`, "POST", { title: newSubtaskTitle }, todo.revision);
    if (currentId.current !== todoId) return;
    setSubtasks(previous => [...previous, created]); setNewSubtaskTitle("");
    setTodo(previous => previous ? { ...previous, revision: previous.revision + 1 } : previous);
  };

  const updateSubtask = async (id: number, key: "title" | "done", value: string | boolean) => {
    const row = subtasks.find(item => item.id === id);
    if (!row) return;
    const updated = await write.current<Subtask>(`/api/todos/subtasks/${id}`, "PATCH", { [key]: value }, row.revision);
    if (currentId.current !== todoId) return;
    setSubtasks(previous => previous.map(item => item.id === id ? updated : item));
    setTodo(previous => previous ? { ...previous, revision: previous.revision + 1 } : previous);
  };

  const deleteSubtask = async (id: number) => {
    const row = subtasks.find(item => item.id === id);
    if (!row) return;
    await write.current(`/api/todos/subtasks/${id}`, "DELETE", undefined, row.revision);
    if (currentId.current !== todoId) return;
    setSubtasks(previous => previous.filter(item => item.id !== id));
    setTodo(previous => previous ? { ...previous, revision: previous.revision + 1 } : previous);
  };

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <button
            onClick={() => router.push(get("prev_page", "/todos"))}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mr-4 cursor-pointer"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </button>

          <div className="min-w-0 flex-1 flex justify-center items-center gap-2">
            {editMode ? (
              <input
                aria-label="Task title"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="min-w-0 w-full text-lg font-semibold border rounded px-3 py-1 flex-1 text-center"
              />
            ) : (
              <h1 className="text-xl font-semibold flex items-center gap-2">
                {priority && <FlagIcon className={`w-5 h-5 ${priorityColor}`} />}
                {todo.title}
              </h1>
            )}
          </div>

          <div className="flex gap-2">
            {/* Edit / Save button */}
            <button
              onClick={() => { if (editMode) void perform(saveTodo); else setEditMode(true); }}
              disabled={busy || !!todo.archivedAt}
              className="flex items-center gap-1 border rounded px-3 py-1 hover:bg-gray-100 hover:text-black transition cursor-pointer ml-4"
            >
              {editMode ? (
                <>
                  <CheckIcon className="w-5 h-5 text-green-600" />
                  Save
                </>
              ) : (
                <>
                  <PencilSquareIcon className="w-5 h-5" />
                  Edit
                </>
              )}
            </button>

            {/* Delete button */}
            {!editMode && (
              <button
                onClick={() => void perform(deleteTodo)}
                disabled={busy || !canDelete}
                className={`flex items-center gap-1 border rounded px-3 py-1 transition
                  ${
                    !canDelete
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "hover:bg-red-100 hover:text-red-600 cursor-pointer"
                  }`}
              >
                <TrashIcon className="w-5 h-5" />
                Delete
              </button>
            )}
          </div>
        </div>

        <p className="mb-3 text-sm font-medium text-gray-500">{todo.reference ?? taskReference(todo.id)}{todo.archivedAt ? " · Archived" : ""}</p>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="text-sm">Status<select aria-label="Task status" value={todo.status} disabled={busy || editMode || !!todo.archivedAt || isClosed(todo.status)} onChange={event => void changeStatus(event.target.value as WorkStatus)} className="ml-3 rounded border border-card-border bg-card-bg px-3 py-2">
            {WORK_STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select></label>
          {isClosed(todo.status) && !todo.archivedAt && <button type="button" disabled={busy || editMode} onClick={() => void changeStatus("TODO")} className="rounded-lg border px-3 py-2">Reopen task</button>}
          <button type="button" disabled={busy || editMode} onClick={() => void perform(async () => { await write.current(`/api/todos/${todoId}`, "PATCH", { archived: !todo.archivedAt }, todo.revision); await load(); })} className="rounded-lg border px-3 py-2">{todo.archivedAt ? "Restore task" : "Archive task"}</button>
        </div>
        {isClosed(todo.status) && <section aria-label="Closure information" className="mb-6 rounded-lg border border-card-border p-3 text-sm">
          <p>{todo.status === "DONE" ? "Completed" : "Cancelled"}: {todo.status === "DONE" ? todo.completedAt ? new Date(todo.completedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" }) : "Not recorded" : todo.cancelledAt ? new Date(todo.cancelledAt).toLocaleString("en-CA", { timeZone: "America/Toronto" }) : "Not recorded"}</p>
          {todo.closureType === "ACCEPTED_WORKAROUND" && <p className="mt-2 font-medium text-amber-500">Closed with an explicitly accepted workaround</p>}
          {editMode ? <label className="mt-2 block">Completion summary<textarea aria-label="Completion summary" value={summaryDraft} onChange={event => setSummaryDraft(event.target.value)} className="w-full rounded border bg-card-bg p-2" /></label> : todo.completionSummary && <p className="mt-2 whitespace-pre-wrap break-words">{todo.completionSummary}</p>}
        </section>}
        <TaskFoundationFields task={todo} draft={foundation} onChange={setFoundation} contexts={contexts} editing={editMode} disabled={busy} />
        {/* Description */}
        <div className="mb-6">
          {editMode ? (
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows={4}
              placeholder="Description..."
            />
          ) : (
            <p className="text-gray-700">{todo.description || "No description"}</p>
          )}
        </div>

        {/* Personal reward configuration is retained for every task. */}
        <details className="mb-6" open={!todo.context || todo.context.key === "personal"}><summary className="mb-3 cursor-pointer text-sm font-medium">Personal rewards</summary>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex-1">
            <label className="block text-sm text-gray-500 mb-1">XP Reward:</label>
            {editMode ? (
              <input
                type="number"
                value={xpDraft}
                onChange={(e) => setXpDraft(Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
              />
            ) : (
              <span className="text-gray-700">{todo.rewardXp ?? 0} XP</span>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-500 mb-1">Coins Reward:</label>
            {editMode ? (
              <input
                type="number"
                value={coinsDraft}
                onChange={(e) => setCoinsDraft(Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
              />
            ) : (
              <span className="text-gray-700">{todo.rewardCoins ?? 0} 💰</span>
            )}
          </div>
        </div>

        </details>

        {/* Depends On */}
        <div className="mb-6">
          <label className="block text-sm text-gray-500 mb-1">Depends on:</label>
          {editMode ? (
            <select
              value={dependsOnId ?? ""}
              onChange={(e) => setDependsOnId(e.target.value === "" ? null : Number(e.target.value))}
              className="w-full border rounded px-3 py-2 bg-white text-gray-900 cursor-pointer"
            >
              <option value="">None</option>
              {todos.map((t) => (
                <option key={t.id} value={t.id} className="text-gray-900">
                  {t.title}
                </option>
              ))}
            </select>
          ) : todo.dependsOn ? (
            <button
              onClick={() => router.push(`/todos/${todo.dependsOn!.id}`)}
              className="text-blue-600 hover:underline cursor-pointer"
            >
              {todo.dependsOn.title}
            </button>
          ) : (
            <span className="text-gray-500">None</span>
          )}
        </div>

        {/* Dependent Tasks */}
        {!editMode && dependentTasks.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm text-gray-500 mb-1">Tasks depending on this:</label>
            <ul className="list-disc list-inside text-gray-700">
              {dependentTasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => router.push(`/todos/${t.id}`)}
                    className="text-blue-600 hover:underline cursor-pointer"
                  >
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Subtasks */}
        <div>
          <h2 className="font-medium mb-3 text-gray-800">Subtasks</h2>
          <ul className="space-y-2 mb-3">
            {subtasks.map((sub) => (
              <li key={sub.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sub.done}
                  disabled={busy || editMode}
                  onChange={(e) => void perform(() => updateSubtask(sub.id, "done", e.target.checked))}
                  className="cursor-pointer"
                />
                {editMode ? (
                  <>
                    <input
                      type="text"
                      aria-label={`Subtask title: ${sub.title}`}
                      defaultValue={sub.title}
                      disabled={busy}
                      onBlur={(e) => { if (e.target.value !== sub.title) void perform(() => updateSubtask(sub.id, "title", e.target.value)); }}
                      className="min-w-0 border rounded px-2 py-1 flex-1"
                    />
                    <button
                      disabled={busy}
                      onClick={() => void perform(() => deleteSubtask(sub.id))}
                      className="text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <span className={sub.done ? "line-through text-gray-400" : ""}>
                    {sub.title}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {editMode && (
            <div className="flex gap-2">
              <input
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="New subtask..."
                className="min-w-0 flex-1 border rounded px-2 py-1"
              />
              <button
                disabled={busy}
                onClick={() => void perform(addSubtask)}
                className="px-3 py-1 bg-[var(--accent)] text-white rounded hover:opacity-90 cursor-pointer"
              >
                Add
              </button>
            </div>
          )}
        </div>
        <TaskActivityPreview id={todoId} revision={todo.revision} />
        {closure && <TaskClosureDialog task={todo} status={closure} busy={busy} error={actionError} onCancel={() => setClosure(null)} onConfirm={async body => { await perform(async () => { await write.current(`/api/todos/${todoId}`, "PATCH", body, todo.revision); setClosure(null); await load(); }); }} />}
      </div>
    </div>
  );
}
