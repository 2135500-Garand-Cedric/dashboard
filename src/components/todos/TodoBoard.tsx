"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { createWorkWriter, workRead } from "@/lib/work-management/client";
import { useSnackbar } from "@/context/SnackbarContext";
import TodoColumn from "./TodoColumn";
import { useMemory } from "@/context/MemoryContext";


type Subtask = { id: number; title: string; done: boolean; todoId: number };

type Todo = {
  id: number;
  revision: number;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority?: number;
  dependsOnId?: number | null;
  dependsOn?: { id: number; title: string } | null;
  updatedAt: string;
  subtasks?: Subtask[];
  rewardXp?: number;
  rewardCoins?: number;
};

export default function TodoBoard({
  setUserXp,
  setUserCoins,
}: {
  setUserXp: React.Dispatch<React.SetStateAction<number>>;
  setUserCoins: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const { pageRouter } = useMemory();
  const { showMessage } = useSnackbar();
  const write = useRef(createWorkWriter());
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Load todos from API
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, user] = await Promise.all([workRead<Todo[]>("/api/todos"), workRead<{ totalXp: number; coins: number }>("/api/users")]);
      setTodos(data); setUserXp(user.totalXp); setUserCoins(user.coins); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load tasks."); }
    finally { setLoading(false); }
  }, [setUserXp, setUserCoins]);

  useEffect(() => {
    void load();
  }, [load]);

  function todosByStatus(status: Todo["status"]) {
    return todos.filter((t) => t.status === status);
  }

  // Drag & drop
  const onDropTo = async (status: Todo["status"], e: React.DragEvent) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));

    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    if (busyRef.current || todo.status === status) return;
    busyRef.current = true; setBusy(true);
    try {
      await write.current(`/api/todos/${id}`, "PATCH", { status }, todo.revision);
      await load();
    } catch (error) { showMessage(error instanceof Error ? error.message : "Unable to change task status."); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  // Create a new todo
  const createTodo = async () => {
    if (!newTitle.trim() || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await write.current("/api/todos", "POST", { title: newTitle });
      setNewTitle(""); setCreating(false); await load();
    } catch (error) { showMessage(error instanceof Error ? error.message : "Unable to create task."); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return (
    <div>
      {/* Header: New Todo */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-1 rounded bg-[var(--color-card-bg)] border border-[var(--color-card-border)] hover:bg-[var(--accent)]/8 cursor-pointer"
            onClick={() => setCreating((c) => !c)}
          >
            <PlusIcon className="w-5 h-5" />
            New
          </button>

          {creating && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="min-w-0 w-full sm:w-48 px-2 py-1 border rounded"
                aria-label="New todo title"
                placeholder="New todo title"
              />
              <button
                disabled={busy}
                onClick={createTodo}
                className="px-2 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90 cursor-pointer"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div role="alert" className="mb-4 text-rose-500">{error} <button type="button" onClick={() => void load()} className="underline">Retry</button></div>}
      {/* Todo Columns */}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {["TODO", "IN_PROGRESS", "DONE"].map((status) => (
            <div
              key={status}
              onDragOver={onDragOver}
              onDrop={(e) => onDropTo(status as Todo["status"], e)}
              className="cursor-pointer h-full"
            >
              <TodoColumn
                title={
                  status === "TODO"
                    ? "Todo"
                    : status === "IN_PROGRESS"
                    ? "In Progress"
                    : "Done"
                }
                color={
                  status === "TODO"
                    ? "var(--accent)"
                    : status === "IN_PROGRESS"
                    ? "var(--warning)"
                    : "var(--success)"
                }
                items={todosByStatus(status as Todo["status"])}
                onOpen={(todo) => pageRouter('/todos', `/todos/${todo.id}`)}
              />
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
