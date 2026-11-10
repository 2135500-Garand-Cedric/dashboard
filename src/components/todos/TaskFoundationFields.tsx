"use client";

import { WORK_PRIORITIES, WORK_KINDS, PRIORITY_LABELS, KIND_LABELS, priorityOf, type WorkContext, type WorkTodo } from "@/lib/work-management/types";
export type TaskFoundationDraft = {
  priorityLevel: WorkTodo["priorityLevel"]; contextId: number | null; kind: WorkTodo["kind"];
  company: string; course: string; system: string; tags: string; desiredOutcome: string;
  nextAction: string; waitingOn: string; waitingReason: string; workaround: string;
};
export function foundationDraft(task: WorkTodo): TaskFoundationDraft {
  return { priorityLevel: priorityOf(task), contextId: task.contextId ?? null, kind: task.kind ?? null,
    company: task.company ?? "", course: task.course ?? "", system: task.system ?? "", tags: (task.tags ?? []).join(", "),
    desiredOutcome: task.desiredOutcome ?? "", nextAction: task.nextAction ?? "", waitingOn: task.waitingOn ?? "", waitingReason: task.waitingReason ?? "", workaround: task.workaround ?? "" };
}
export function foundationPayload(draft: TaskFoundationDraft) {
  return { ...draft, tags: draft.tags.split(",").map(value => value.trim()).filter(Boolean) };
}
const inputClass = "min-w-0 w-full rounded-lg border border-card-border bg-card-bg px-3 py-2 text-foreground";
export default function TaskFoundationFields({ task, draft, onChange, contexts, editing, disabled, section = "all" }: { task: WorkTodo; draft: TaskFoundationDraft; onChange: (value: TaskFoundationDraft) => void; contexts: WorkContext[]; editing: boolean; disabled: boolean; section?: "all" | "main" | "metadata" }) {
  const textFields: { key: Exclude<keyof TaskFoundationDraft, "contextId" | "priorityLevel" | "kind">; label: string; multiline?: boolean }[] = [
    { key: "desiredOutcome", label: "Desired outcome", multiline: true }, { key: "nextAction", label: "Next action" },
    { key: "company", label: "Company" }, { key: "course", label: "Course" }, { key: "system", label: "System" }, { key: "tags", label: "Tags (comma separated)" },
    { key: "waitingOn", label: "Waiting on" }, { key: "waitingReason", label: "Waiting reason", multiline: true }, { key: "workaround", label: "Workaround", multiline: true },
  ];
  const priority = priorityOf(task);
  return <section aria-label="Task information" className="mb-6 space-y-4">
    {section !== "main" && <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
      <label className="block text-sm">Priority{editing ? <select aria-label="Priority" value={draft.priorityLevel ?? ""} disabled={disabled} onChange={event => onChange({ ...draft, priorityLevel: event.target.value as TaskFoundationDraft["priorityLevel"] || null })} className={inputClass}>
        {draft.priorityLevel === null && <option value="">Unmapped legacy priority</option>}{WORK_PRIORITIES.map(value => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
      </select> : <p className={`mt-1 font-medium ${priority === "URGENT" ? "text-rose-500" : ""}`}>{priority ? PRIORITY_LABELS[priority] : `Unmapped legacy priority (${task.legacyPriority ?? task.priority})`}</p>}</label>
      <label className="block text-sm">Context{editing ? <select aria-label="Context" value={draft.contextId ?? ""} disabled={disabled} onChange={event => onChange({ ...draft, contextId: event.target.value ? Number(event.target.value) : null })} className={inputClass}>
        <option value="">Unclassified</option>{contexts.filter(context => context.active || context.id === draft.contextId).map(context => <option key={context.id} value={context.id}>{context.name}{!context.active ? " (inactive)" : ""}</option>)}
      </select> : <p className="mt-1 font-medium">{task.context?.name ?? "Unclassified"}</p>}</label>
      <label className="block text-sm">Kind{editing ? <select aria-label="Kind" value={draft.kind ?? ""} disabled={disabled} onChange={event => onChange({ ...draft, kind: event.target.value as TaskFoundationDraft["kind"] || null })} className={inputClass}>
        {!draft.kind && <option value="">Not recorded</option>}{WORK_KINDS.map(value => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}
      </select> : <p className="mt-1 font-medium">{task.kind ? KIND_LABELS[task.kind] : "Not recorded"}</p>}</label>
    </div>}
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">{textFields.filter(field => section === "all" || (["desiredOutcome", "nextAction", "waitingOn", "waitingReason", "workaround"].includes(field.key) ? section === "main" : section === "metadata")).filter(field => editing || !!task[field.key as keyof WorkTodo]?.toString()).map(field => <label key={field.key} className={`block min-w-0 text-sm ${field.multiline ? "sm:col-span-2" : ""}`}>{field.label}
      {editing ? field.multiline ? <textarea aria-label={field.label} rows={2} disabled={disabled} value={draft[field.key]} onChange={event => onChange({ ...draft, [field.key]: event.target.value })} className={inputClass} /> : <input aria-label={field.label} disabled={disabled} value={draft[field.key]} onChange={event => onChange({ ...draft, [field.key]: event.target.value })} className={inputClass} /> : <p className="mt-1 whitespace-pre-wrap break-words">{field.key === "tags" ? task.tags?.join(", ") : task[field.key]}</p>}
    </label>)}</div>
  </section>;
}
