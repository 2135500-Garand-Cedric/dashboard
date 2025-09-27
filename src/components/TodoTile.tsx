"use client";

import { useEffect, useState } from "react";

type Subtask = { id: number; title: string; done: boolean };
type Todo = {
  id: number;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority?: 1 | 2 | 3;
  subtasks?: Subtask[];
  updatedAt: string; // ensure updatedAt is included from API
};

export default function TodoDashboardTile() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const loadTodos = async () => {
    const res = await fetch("/api/todos");
    const data: Todo[] = await res.json();
    // Only show "IN_PROGRESS" todos and sort by updatedAt descending
    const inProgressTodos = data
      .filter((t) => t.status === "IN_PROGRESS")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    setTodos(inProgressTodos);
  };

  useEffect(() => {
    loadTodos();
  }, []);

  const getPriorityColor = (priority?: number) => {
    switch (priority) {
      case 1:
        return "bg-green-500";
      case 2:
        return "bg-yellow-500";
      case 3:
        return "bg-red-500";
      default:
        return "bg-gray-300";
    }
  };

  if (todos.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 shadow max-w-md">
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--color-foreground)" }}
        >
          In Progress Todos
        </h2>
        <p className="text-sm text-gray-500 mt-2">No tasks in progress.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow p-4 max-w-md">
      <h2
        className="text-lg font-semibold mb-3"
        style={{ color: "var(--color-foreground)" }}
      >
        In Progress Todos
      </h2>

      <ul
        className={`space-y-3 ${
          todos.length > 4 ? "max-h-[18rem] overflow-y-auto" : ""
        }`}
      >
        {todos.map((todo) => {
          const completed = todo.subtasks?.filter((s) => s.done).length ?? 0;
          const total = todo.subtasks?.length ?? 0;
          const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

          return (
            <li
              key={todo.id}
              onClick={() => (window.location.href = `/todos/${todo.id}`)}
              className="flex flex-col p-3 rounded hover:bg-[var(--hover-bg)] transition border border-[var(--card-border)] cursor-pointer"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-[var(--color-foreground)]">{todo.title}</h3>
                {todo.priority && (
                  <span
                    className={`inline-block w-3 h-3 rounded-full ${getPriorityColor(
                      todo.priority
                    )}`}
                    title={`Priority: ${["Low", "Medium", "High"][todo.priority - 1]}`}
                  />
                )}
              </div>

              {total > 0 && (
                <div className="mt-2">
                  <div className="w-full h-2 bg-gray-200 rounded">
                    <div
                      style={{ width: `${progress}%` }}
                      className="h-2 bg-[var(--color-accent)] rounded"
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
