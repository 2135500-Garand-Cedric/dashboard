"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PencilSquareIcon,
  CheckIcon,
  FlagIcon,
  ArrowLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

type Subtask = { id: number; title: string; done: boolean };
type Todo = {
  id: number;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority?: number;
  dependsOn?: { id: number; title: string } | null;
  subtasks?: Subtask[];
  rewardXp?: number;
  rewardCoins?: number;
};

export default function TodoPage() {
  const params = useParams();
  const todoId = Number(params.id);
  const router = useRouter();

  const [todo, setTodo] = useState<Todo | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [editMode, setEditMode] = useState(false);

  // Draft fields
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState<number | null>(null);
  const [dependsOnId, setDependsOnId] = useState<number | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [xpDraft, setXpDraft] = useState<number>(0);
  const [coinsDraft, setCoinsDraft] = useState<number>(0);
  const [canDelete, setCanDelete] = useState(false);

  const load = async () => {
    // Load the todo
    const res = await fetch(`/api/todos/${todoId}`);
    const data = await res.json();
    setTodo(data);
    setTitleDraft(data.title);
    setDescDraft(data.description || "");
    setPriorityDraft(data.priority ?? null);
    setDependsOnId(data.dependsOn?.id ?? null);
    setSubtasks(data.subtasks || []);
    setXpDraft(data.rewardXp ?? 0);
    setCoinsDraft(data.rewardCoins ?? 0);

    // Load all todos for "depends on" select and delete check
    const allRes = await fetch("/api/todos");
    const allData = await allRes.json();
    setTodos(allData.filter((t: Todo) => t.id !== todoId));
    setCanDelete(!allData.some((t: Todo) => t.dependsOn?.id === todoId));
  };

  const dependentTasks = todos.filter((t) => t.dependsOn?.id === todoId);

  useEffect(() => {
    load();
  }, [todoId]);

  if (!todo) return <div className="text-center py-10">Loading...</div>;

  const priorityColor =
    priorityDraft === 3
      ? "text-red-500"
      : priorityDraft === 2
      ? "text-yellow-500"
      : "text-green-500";

  // Save todo fields
  const saveTodo = async () => {
    await fetch(`/api/todos/${todoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleDraft,
        description: descDraft,
        priority: priorityDraft,
        dependsOnId,
        rewardXp: xpDraft,
        rewardCoins: coinsDraft,
      }),
    });
    await load();
  };

  // Delete todo (only allowed if no other todo depends on it)
  const deleteTodo = async () => {
    const hasDependents = todos.some((t) => t.dependsOn?.id === todoId);
    if (hasDependents) {
      alert("Cannot delete this task because another task depends on it.");
      return;
    }

    const res = await fetch(`/api/todos/${todoId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/todos");
    }
  };

  // Subtask functions
  const addSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    const res = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubtaskTitle }),
    });
    if (res.ok) {
      const newSub: Subtask = await res.json();
      setSubtasks([...subtasks, newSub]);
      setNewSubtaskTitle("");
    }
  };

  const updateSubtask = async (id: number, key: keyof Subtask, value: any) => {
    const res = await fetch(`/api/todos/subtasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    if (res.ok) {
      setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
    }
  };

  const deleteSubtask = async (id: number) => {
    const res = await fetch(`/api/todos/subtasks/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSubtasks(subtasks.filter((s) => s.id !== id));
    }
  };

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/todos")}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mr-4 cursor-pointer"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </button>

          <div className="flex-1 flex justify-center items-center gap-2">
            {editMode ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="text-lg font-semibold border rounded px-3 py-1 flex-1 text-center"
              />
            ) : (
              <h1 className="text-xl font-semibold flex items-center gap-2">
                {todo.priority && <FlagIcon className={`w-5 h-5 ${priorityColor}`} />}
                {todo.title}
              </h1>
            )}
          </div>

          <div className="flex gap-2">
            {/* Edit / Save button */}
            <button
              onClick={async () => {
                if (editMode) await saveTodo();
                setEditMode(!editMode);
              }}
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
                onClick={deleteTodo}
                disabled={!canDelete}
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

        {/* XP / Coins */}
        <div className="mb-6 flex gap-6">
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

        {/* Priority selector */}
        {editMode && (
          <div className="mb-6">
            <label className="block text-sm text-gray-500 mb-1">Priority:</label>
            <select
              value={priorityDraft ?? ""}
              onChange={(e) => setPriorityDraft(Number(e.target.value) || null)}
              className="w-full border rounded px-3 py-2 bg-white text-gray-900 cursor-pointer"
            >
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
            </select>
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
                  onChange={(e) => updateSubtask(sub.id, "done", e.target.checked)}
                  className="cursor-pointer"
                />
                {editMode ? (
                  <>
                    <input
                      type="text"
                      value={sub.title}
                      onChange={(e) => updateSubtask(sub.id, "title", e.target.value)}
                      className="border rounded px-2 py-1 flex-1"
                    />
                    <button
                      onClick={() => deleteSubtask(sub.id)}
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
                className="flex-1 border rounded px-2 py-1"
              />
              <button
                onClick={addSubtask}
                className="px-3 py-1 bg-[var(--accent)] text-white rounded hover:opacity-90 cursor-pointer"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
