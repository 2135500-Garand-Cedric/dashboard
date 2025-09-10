// src/components/todos/TodoColumn.tsx
"use client";

import TodoCard from "./TodoCard";
import type { ReactNode } from "react";

type Subtask = { id: number; title: string; done: boolean; todoId: number };
type Todo = {
  id: number;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  subtasks?: Subtask[];
  dependsOn?: { id: number; title: string } | null;
};

export default function TodoColumn({
  title,
  color,
  items,
  onOpen,
}: {
  title: string;
  color?: string;
  items: Todo[];
  onOpen: (todo: Todo) => void;
}) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded p-3 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ color: "var(--color-foreground)" }} className="font-semibold">{title}</h3>
        <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
      </div>

      <div className="space-y-3">
        {items.map((t) => (
          <TodoCard key={t.id} todo={t} onOpen={() => onOpen(t)} />
        ))}
        {items.length === 0 && <div className="text-sm text-gray-400">No items</div>}
      </div>
    </div>
  );
}
