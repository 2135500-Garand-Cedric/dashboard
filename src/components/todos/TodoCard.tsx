"use client";

import { useMemo } from "react";
import { ChevronRightIcon, FlagIcon } from "@heroicons/react/24/solid";

type Subtask = { id: number; title: string; done: boolean; todoId: number };
type Todo = {
  id: number;
  title: string;
  description?: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  subtasks?: Subtask[];
  dependsOn?: { id: number; title: string } | null;
  priority?: number; // 1 = low, 2 = medium, 3 = high
};

export default function TodoCard({ todo, onOpen }: { todo: Todo; onOpen: () => void }) {
  const completed = useMemo(() => todo.subtasks?.filter((s) => s.done).length ?? 0, [todo]);
  const total = todo.subtasks?.length ?? 0;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  const dragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", String(todo.id));
  };

  // Priority color mapping
  const priorityColor = todo.priority === 3 ? "text-red-500" : todo.priority === 2 ? "text-yellow-500" : "text-green-500";

  return (
    <div
      draggable
      onDragStart={dragStart}
      className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded p-3 cursor-grab hover:shadow"
      onClick={onOpen}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-1">
            {todo.priority && <FlagIcon className={`w-4 h-4 ${priorityColor}`} />}
            <div className="font-medium" style={{ color: "var(--color-foreground)" }}>{todo.title}</div>
          </div>
          {todo.dependsOn && (
            <div className="text-xs text-gray-500">Depends on: {todo.dependsOn.title}</div>
          )}
        </div>
        <div className="text-gray-400">
          <ChevronRightIcon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-2">
        <div className="w-full h-2 bg-gray-200 rounded">
          <div style={{ width: `${pct}%` }} className="h-2 bg-[var(--color-accent)] rounded" />
        </div>
        {total > 0 && <div className="text-xs text-gray-500 mt-1">{completed}/{total} subtasks</div>}
      </div>
    </div>
  );
}
