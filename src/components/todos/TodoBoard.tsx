"use client";

import { useEffect, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import TodoColumn from "./TodoColumn";
import { useRouter } from "next/navigation";

type Subtask = { id: number; title: string; done: boolean; todoId: number };
type Todo = {
  id: number;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority?: number;
  dependsOnId?: number | null;
  dependsOn?: { id: number; title: string } | null;
  subtasks?: Subtask[];
};

export default function TodoBoard() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const router = useRouter();

  // Load todos from API
  async function load() {
    setLoading(true);
    const res = await fetch("/api/todos");
    const data = await res.json();
    setTodos(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function todosByStatus(status: Todo["status"]) {
    return todos.filter((t) => t.status === status);
  }

  // Drag & drop
  const onDropTo = async (status: Todo["status"], e: React.DragEvent) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));

    await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    await load();
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  // Create a new todo
  const createTodo = async () => {
    if (!newTitle.trim()) return;
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    setNewTitle("");
    setCreating(false);
    await load();
  };

  return (
    <div>
      {/* Header: New Todo */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-1 rounded bg-[var(--color-card-bg)] border border-[var(--color-card-border)] hover:bg-[var(--accent)]/8 cursor-pointer"
            onClick={() => setCreating((c) => !c)}
          >
            <PlusIcon className="w-5 h-5" />
            New
          </button>

          {creating && (
            <div className="ml-2 flex items-center gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="px-2 py-1 border rounded"
                placeholder="New todo title"
              />
              <button
                onClick={createTodo}
                className="px-2 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90 cursor-pointer"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Todo Columns */}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {["TODO", "IN_PROGRESS", "DONE"].map((status) => (
            <div
              key={status}
              onDragOver={onDragOver}
              onDrop={(e) => onDropTo(status as Todo["status"], e)}
              className="cursor-pointer"
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
                onOpen={(todo) => router.push(`/todos/${todo.id}`)} // Navigate to page
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
