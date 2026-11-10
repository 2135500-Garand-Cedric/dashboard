"use client";
import { WORK_STATUSES, STATUS_LABELS, type WorkStatus, type WorkTodo } from "@/lib/work-management/types";
import TodoColumn from "./TodoColumn";
export default function TodoBoard({ items, onOpen, onMove }: { items: WorkTodo[]; onOpen: (task: WorkTodo) => void; onMove: (task: WorkTodo, status: WorkStatus) => void }) {
  return <section aria-label="Work board" className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{WORK_STATUSES.map(status => <div key={status} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const task = items.find(task => task.id === Number(event.dataTransfer.getData("text/plain"))); if (task) onMove(task, status); }}>
    <TodoColumn title={`${STATUS_LABELS[status]} (${items.filter(task => task.status === status).length})`} color={status === "DONE" ? "var(--success)" : status === "WAITING" ? "var(--warning)" : "var(--accent)"} items={items.filter(task => task.status === status)} onOpen={onOpen} />
  </div>)}</section>;
}
