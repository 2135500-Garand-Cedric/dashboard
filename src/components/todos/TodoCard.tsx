"use client";

import { useMemo } from "react";
import { ChevronRightIcon, FlagIcon, CurrencyDollarIcon } from "@heroicons/react/24/solid";

import {
  type WorkTodo as Todo,
  priorityOf,
  PRIORITY_LABELS,
  taskReference,
} from "@/lib/work-management/types";

export default function TodoCard({ todo, onOpen }: { todo: Todo; onOpen: () => void }) {
  const completed = useMemo(() => todo.subtasks?.filter((s) => s.done).length ?? 0, [todo]);
  const total = todo.subtasks?.length ?? 0;

  const dragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", String(todo.id));
  };

  const priority = priorityOf(todo);
  const priorityColor =
    priority === "URGENT"
      ? "text-rose-500"
      : priority === "HIGH"
        ? "text-red-500"
        : priority === "NORMAL"
          ? "text-yellow-500"
          : "text-green-500";

  return (
    <div
      draggable={!todo.archivedAt}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      onDragStart={dragStart}
      className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded p-3 cursor-grab hover:shadow"
      onClick={onOpen}
    >
      <div className="flex min-w-0 justify-between items-start">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-gray-500">
            {todo.reference ?? taskReference(todo.id)} · {todo.context?.name ?? "Unclassified"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {priority && (
              <FlagIcon
                aria-label={PRIORITY_LABELS[priority]}
                className={`w-4 h-4 ${priorityColor}`}
              />
            )}
            <div
              className="min-w-0 break-words font-medium"
              style={{ color: "var(--color-foreground)" }}
            >
              {todo.title}
            </div>
            {(!todo.context || todo.context.key === "personal") && (
              <div className="text-xs text-gray-500 flex items-center gap-1 flex-nowrap whitespace-nowrap">
                <span>+{todo.rewardXp ?? 0} XP</span>
                <span className="flex items-center gap-0.5">
                  +{todo.rewardCoins ?? 0}{" "}
                  <CurrencyDollarIcon className="w-3 h-3 text-yellow-600" />
                </span>
              </div>
            )}
          </div>
          {todo.requester && (
            <p className="mt-1 break-words text-xs text-gray-500">
              Requested by {todo.requester.name}
            </p>
          )}
          {todo.workaround && <p className="mt-1 text-xs text-amber-500">Workaround available</p>}
          {todo.nextAction && <p className="mt-2 break-words text-sm">{todo.nextAction}</p>}
          {todo.status === "WAITING" && (
            <p className="mt-1 break-words text-sm text-amber-500">
              Waiting
              {todo.waitingOnContact?.name || todo.waitingOn
                ? ` on ${todo.waitingOnContact?.name ?? todo.waitingOn}`
                : ""}
              {todo.waitingReason ? ` · ${todo.waitingReason}` : ""}
            </p>
          )}
          {todo.isBlocked && (
            <p className="mt-1 text-xs text-amber-500">
              Blocked · {todo.blockingCount} unresolved prerequisite(s)
            </p>
          )}
          {todo.dependsOn && (
            <div className="text-xs text-gray-500">Depends on: {todo.dependsOn.title}</div>
          )}
        </div>
        <div className="text-gray-400">
          <ChevronRightIcon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-2">
        <p className="text-xs text-gray-500">
          Child tasks {todo.completedChildCount ?? 0}/{todo.childCount ?? 0} Done
        </p>
        {total > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            {completed}/{total} checklist items
          </div>
        )}
      </div>
    </div>
  );
}
