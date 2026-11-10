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
export interface WorkContact { id: number; name: string; company: string | null; active: boolean; revision: number; }
export interface WorkResults { items: WorkTodo[]; total: number; page: number; pageSize: number; }
export interface ChecklistItem { id: number; todoId?: number; title: string; done: boolean; revision: number; }
export interface WorkTodo {
  deadlineDate?: string | null; deadlineAt?: string | null; deadlineTimeZone?: string | null; deadlineState?: string | null; activeFollowUp?: WorkFollowUp | null; timeZone?: string;
  parentId?: number | null; parent?: GraphTaskStub | null; childCount?: number; completedChildCount?: number; dependencyCount?: number; blockingCount?: number; isBlocked?: boolean; dependencyReviewRequired?: boolean; relatedCount?: number; legacyDependencyWritable?: boolean;
  id: number; reference?: string; revision: number; title: string; description?: string | null;
  status: WorkStatus; priority?: number | null; legacyPriority?: number | null; priorityLevel?: WorkPriority | null;
  requesterId?: number | null; requester?: WorkContact | null; waitingOnContactId?: number | null; waitingOnContact?: WorkContact | null; affectedPeople?: WorkContact[];
  dependents?: { id: number; title: string; status: string }[]; dependentCount?: number; supportingRecordCount?: number;
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

export interface WorkNote { id: number; todoId: number; body: string; documentationUrls: string[]; occurredAt: string | null; revision: number; createdAt: string; updatedAt: string; removedAt: string | null; }
export interface WorkNoteVersion { id: number; noteId: number; revision: number; body: string; documentationUrls: string[]; occurredAt: string | null; action: string; recordedAt: string; note?: WorkNote; }
export interface WorkAttachment { id: number; todoId: number; originalName: string; mimeType: string; byteSize: number; revision: number; createdAt: string; updatedAt: string; removedAt: string | null; cleanupPending: boolean; }
export interface SupportEditorHandle { discard: () => void; isDirty: () => boolean; isBusy: () => boolean; }
export interface SupportEditorState { dirty: boolean; busy: boolean; }

export interface GraphTaskStub { id: number; reference: string; title: string; status: WorkStatus | null; revision: number | null; parentId: number | null; archivedAt: string | null; reviewReason?: string | null; }
export interface TransitionReview { taskRevision: number; currentStatus: WorkStatus; archived: boolean; requestedStatus: string; workaround: string | null; token: string; blockingCount: number; blockers: GraphTaskStub[]; unfinishedChildCount: number; unfinishedChildren: GraphTaskStub[]; descendantCount: number; }
export interface RelationshipResults { task: WorkTodo; total: number; page: number; pageSize: number; items: { task: GraphTaskStub; origin: string; reviewReason: string | null }[]; }
export interface WorkFollowUp { id: number; todoId: number; date: string | null; at: string | null; timeZone: string | null; reason: string | null; status: string; outcome: string | null; resolvedAt: string | null; previousId: number | null; createdAt: string; state?: string | null; }
export interface WorkKeyDate { id: number; todoId: number; label: string; date: string | null; at: string | null; timeZone: string | null; removedAt: string | null; }
export interface WorkDatesView { timeZone: string; taskRevision: number; actionable: boolean; deadline: { date: string | null; at: string | null; timeZone: string | null }; deadlineState: string | null; activeFollowUp: WorkFollowUp | null; followUps: WorkFollowUp[]; total: number; page: number; pageSize: number; keyDates: WorkKeyDate[]; keyTotal: number; keyPage: number; }
