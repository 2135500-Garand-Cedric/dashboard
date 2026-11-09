"use client";
import { useEffect, useState } from "react";
import { useMemory } from "@/context/MemoryContext";
import { workRead } from "@/lib/work-management/client";
import { isClosed, priorityOf, PRIORITY_LABELS, STATUS_LABELS, taskReference, type WorkTodo } from "@/lib/work-management/types";
export default function TodoDashboardTile() {
  const { pageRouter } = useMemory();
  const [todos, setTodos] = useState<WorkTodo[]>([]), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    void workRead<WorkTodo[]>("/api/todos").then(data => {
      if (active) setTodos(data.filter(task => !task.archivedAt && !isClosed(task.status)).sort((a, b) => (rank[priorityOf(a) ?? "NORMAL"] - rank[priorityOf(b) ?? "NORMAL"]) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Unable to load tasks."); });
    return () => { active = false; };
  }, []);
  return <div className="max-w-md rounded-xl border border-card-border bg-card-bg p-4 shadow"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Tasks</h2><button type="button" onClick={() => pageRouter('/', '/todos')} className="text-sm text-blue-500">View all</button></div>
    {error ? <p role="alert" className="text-rose-500">{error}</p> : !todos.length ? <p className="text-sm text-gray-500">No active tasks.</p> : <ul className="space-y-2">{todos.slice(0, 6).map(task => { const priority = priorityOf(task); return <li key={task.id}><button type="button" onClick={() => pageRouter('/', `/todos/${task.id}`)} className="w-full min-w-0 rounded-lg border border-card-border p-3 text-left hover:bg-blue-500/5"><p className="mb-1 text-xs text-gray-500">{task.reference ?? taskReference(task.id)} · {task.context?.name ?? "Unclassified"}</p><p className="break-words font-medium">{task.title}</p><div className="mt-1 flex flex-wrap gap-x-3 text-sm"><span>{STATUS_LABELS[task.status] ?? task.status}</span>{priority && <span className={priority === "URGENT" ? "text-rose-500" : "text-gray-500"}>{PRIORITY_LABELS[priority]}</span>}</div>{task.nextAction && <p className="mt-1 break-words text-sm">{task.nextAction}</p>}{!!task.subtasks?.length && <p className="mt-1 text-xs text-gray-500">{task.subtasks.filter(item => item.done).length}/{task.subtasks.length} steps completed</p>}</button></li>; })}</ul>}
  </div>;
}
