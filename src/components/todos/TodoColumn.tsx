"use client";

import TodoCard from "./TodoCard";

type Subtask = { id: number; title: string; done: boolean; todoId: number };
type Todo = {
  id: number;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  updatedAt: string;
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
  // Sort items by updatedAt descending (most recent first)
  const sortedItems = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded p-3 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ color: "var(--color-foreground)" }} className="font-semibold">
          {title}
        </h3>
        <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
      </div>

      {/* Scrollable items */}
      <div className="flex-1 overflow-y-auto space-y-3 max-h-[70vh]">
        {sortedItems.map((t) => (
          <TodoCard key={t.id} todo={t} onOpen={() => onOpen(t)} />
        ))}
        {sortedItems.length === 0 && (
          <div className="text-sm text-gray-400">No items</div>
        )}
      </div>
    </div>
  );
}
