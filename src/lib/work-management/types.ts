export const WORK_STATUSES = ["NEW", "BACKLOG", "TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"] as const;
export type WorkStatus = typeof WORK_STATUSES[number];
export const STATUS_LABELS: Record<WorkStatus, string> = { NEW: "New", BACKLOG: "Backlog", TODO: "To do", IN_PROGRESS: "In progress", WAITING: "Waiting", DONE: "Done", CANCELLED: "Cancelled" };
export const WORK_PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;
export type WorkPriority = typeof WORK_PRIORITIES[number];
export const WORK_KINDS = ["TASK", "ISSUE", "REQUEST", "IMPROVEMENT", "MAINTENANCE"] as const;
export type WorkKind = typeof WORK_KINDS[number];
export const PRIORITY_LABELS = { URGENT: "Urgent", HIGH: "High", NORMAL: "Normal", LOW: "Low" };
export const KIND_LABELS = { TASK: "Task", ISSUE: "Issue", REQUEST: "Request", IMPROVEMENT: "Improvement", MAINTENANCE: "Maintenance" };
export function taskReference(id: number): string { return `TASK-${String(id).padStart(4, "0")}`; }
export function isClosed(status: string): boolean { return status === "DONE" || status === "CANCELLED"; }
export function legacyPriorityLevel(value: number | null | undefined): WorkPriority | null {
  return value === 1 ? "LOW" : value === 2 || value == null ? "NORMAL" : value === 3 ? "HIGH" : null;
}
export interface WorkContext { id: number; name: string; key: string; active: boolean; revision: number; }
export interface ChecklistItem { id: number; todoId?: number; title: string; done: boolean; revision: number; }
export interface WorkTodo {
  id: number; reference?: string; revision: number; title: string; description?: string | null;
  status: WorkStatus; priority?: number | null; legacyPriority?: number | null; priorityLevel?: WorkPriority | null;
  contextId?: number | null; context?: WorkContext | null; kind?: WorkKind | null;
  company?: string | null; course?: string | null; system?: string | null; tags?: string[];
  desiredOutcome?: string | null; nextAction?: string | null; waitingOn?: string | null;
  waitingReason?: string | null; workaround?: string | null; completionSummary?: string | null;
  closureType?: "OUTCOME_ACHIEVED" | "ACCEPTED_WORKAROUND" | "CANCELLED" | null;
  completedAt?: string | null; cancelledAt?: string | null; archivedAt?: string | null;
  dependsOnId?: number | null; dependsOn?: { id: number; title: string; status?: string } | null;
  subtasks?: ChecklistItem[]; rewardXp?: number; rewardCoins?: number; updatedAt: string; createdAt?: string;
}
export function priorityOf(task: Pick<WorkTodo, "priorityLevel" | "priority">): WorkPriority | null {
  return task.priorityLevel === undefined ? legacyPriorityLevel(task.priority) : task.priorityLevel;
}
export interface WorkActivityEntry { id: number; action: string; createdAt: string; todoReference: string; changes: Record<string, { before: unknown; after: unknown }>; }
