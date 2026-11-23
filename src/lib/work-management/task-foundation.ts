import type { Todo } from "@/generated/prisma";
import { WorkValidationError, workId, workText } from "./validation";
import { WORK_STATUSES, WORK_PRIORITIES, WORK_KINDS, isClosed, legacyPriorityLevel } from "./types";

export const TASK_FIELDS = [
  "occasion",
  "recurrence",
  "firstDeadline",
  "title",
  "description",
  "priority",
  "priorityLevel",
  "status",
  "dependsOnId",
  "activityTypeId",
  "projectId",
  "stageId",
  "kind",
  "system",
  "desiredOutcome",
  "nextAction",
  "waitingOn",
  "waitingReason",
  "workaround",
  "completionSummary",
  "closureMode",
  "acceptWorkaround",
  "archived",
  "requesterId",
  "affectedContactIds",
  "parentId",
  "parentRevision",
  "transitionToken",
  "allowBlocked",
  "overrideReason",
  "allowUnfinishedChildren",
];
const optionalText = {
  system: 120,
  desiredOutcome: 10000,
  nextAction: 1000,
  waitingOn: 500,
  waitingReason: 5000,
  workaround: 10000,
  completionSummary: 10000,
};
export type TaskData = Partial<
  Pick<
    Todo,
    | "title"
    | "description"
    | "priorityLevel"
    | "status"
    | "dependsOnId"
    | "parentId"
    | "activityTypeId"
    | "projectId"
    | "stageId"
    | "requesterId"
    | "kind"
    | "system"
    | "desiredOutcome"
    | "nextAction"
    | "waitingOn"
    | "waitingReason"
    | "workaround"
    | "completionSummary"
    | "closureType"
    | "completedAt"
    | "cancelledAt"
    | "archivedAt"
  >
>;
export function parseTaskFields(body: Record<string, unknown>): TaskData {
  const data: TaskData = {};
  if (body.title !== undefined) data.title = workText(body.title, "title", 500)!;
  if (body.description !== undefined)
    data.description = workText(body.description, "description", 50000, true);
  for (const [key, max] of Object.entries(optionalText))
    if (body[key] !== undefined)
      Object.assign(data, { [key]: workText(body[key], key, max, true)?.trim() || null });
  if (body.priority !== undefined) {
    if (body.priority !== null && ![1, 2, 3].includes(body.priority as number))
      throw new WorkValidationError("Choose a reviewed named priority for this legacy value.");
    data.priorityLevel = legacyPriorityLevel(body.priority as number | null);
  }
  if (body.priorityLevel !== undefined) {
    if (
      body.priorityLevel !== null &&
      !WORK_PRIORITIES.includes(body.priorityLevel as (typeof WORK_PRIORITIES)[number])
    )
      throw new WorkValidationError("Choose Urgent, High, Normal or Low priority.");
    if (body.priority !== undefined && data.priorityLevel !== body.priorityLevel)
      throw new WorkValidationError(
        "The named and legacy priorities disagree. Send one priority value.",
      );
    data.priorityLevel = body.priorityLevel as TaskData["priorityLevel"];
  }
  if (body.status !== undefined) {
    if (!WORK_STATUSES.includes(body.status as (typeof WORK_STATUSES)[number]))
      throw new WorkValidationError("Choose a valid task status.");
    data.status = body.status as TaskData["status"];
  }
  if (body.kind !== undefined) {
    if (body.kind !== null && !WORK_KINDS.includes(body.kind as (typeof WORK_KINDS)[number]))
      throw new WorkValidationError("Choose a valid task kind.");
    data.kind = body.kind as TaskData["kind"];
  }
  for (const key of [
    "activityTypeId",

    "projectId",
    "stageId",
    "dependsOnId",
    "requesterId",

    "parentId",
  ] as const)
    if (body[key] !== undefined) data[key] = body[key] === null ? null : workId(body[key]);
  if (body.parentRevision !== undefined) workId(body.parentRevision);
  for (const key of ["allowBlocked", "allowUnfinishedChildren"])
    if (body[key] !== undefined && typeof body[key] !== "boolean")
      throw new WorkValidationError("Confirm the reviewed transition explicitly.");
  if (body.overrideReason !== undefined)
    workText(body.overrideReason, "override reason", 2000, true);
  if (
    body.transitionToken !== undefined &&
    (typeof body.transitionToken !== "string" || !/^[a-f0-9]{64}$/.test(body.transitionToken))
  )
    throw new WorkValidationError("Reload the action review before confirming.");
  if (body.archived !== undefined && typeof body.archived !== "boolean")
    throw new WorkValidationError("Archive must be true or false.");
  if (body.acceptWorkaround !== undefined && typeof body.acceptWorkaround !== "boolean")
    throw new WorkValidationError("Confirm whether the workaround is accepted.");
  if (
    body.closureMode !== undefined &&
    !["OUTCOME_ACHIEVED", "ACCEPTED_WORKAROUND"].includes(body.closureMode as string)
  )
    throw new WorkValidationError("Choose a valid completion outcome.");
  return data;
}
export function lifecycleData(
  row: Pick<
    Todo,
    "status" | "archivedAt" | "workaround" | "priorityLevel" | "completionSummary" | "closureType"
  >,
  data: TaskData,
  body: Record<string, unknown>,
  now: Date,
): TaskData {
  const result = { ...data },
    status = data.status ?? row.status;
  if (data.priorityLevel === null && row.priorityLevel !== null)
    throw new WorkValidationError("Choose a named priority.");
  if (
    row.archivedAt &&
    status !== row.status &&
    body.archived !== false &&
    !(isClosed(row.status) && !isClosed(status))
  )
    throw new WorkValidationError("Restore this task before changing its status.", 409);
  if (body.closureMode !== undefined || body.acceptWorkaround === true) {
    if (status !== "DONE")
      throw new WorkValidationError("A completion outcome applies only when marking a task Done.");
  }
  if (body.closureMode === "ACCEPTED_WORKAROUND") {
    if (
      body.acceptWorkaround !== true ||
      !(data.workaround === undefined ? row.workaround : data.workaround)?.trim() ||
      !data.completionSummary?.trim()
    )
      throw new WorkValidationError(
        "To close with a workaround, explicitly accept it and provide both the workaround and a completion explanation.",
      );
    result.closureType = "ACCEPTED_WORKAROUND";
  } else if (body.acceptWorkaround === true)
    throw new WorkValidationError("Select accepted workaround as the completion outcome.");
  if (body.closureMode === "OUTCOME_ACHIEVED") result.closureType = "OUTCOME_ACHIEVED";
  if (!isClosed(status) && data.completionSummary)
    throw new WorkValidationError("Save the completion summary when closing the task.");
  if (status !== row.status) {
    if (status === "DONE") {
      result.completedAt = now;
      result.cancelledAt = null;
      result.closureType ??= "OUTCOME_ACHIEVED";
      result.completionSummary ??= null;
    } else if (status === "CANCELLED") {
      result.cancelledAt = now;
      result.completedAt = null;
      result.closureType = "CANCELLED";
      result.completionSummary ??= null;
    } else if (isClosed(row.status)) {
      result.completedAt = null;
      result.cancelledAt = null;
      result.closureType = null;
      result.completionSummary = null;
    }
  }
  if (status === "DONE" && (result.closureType ?? row.closureType) === "ACCEPTED_WORKAROUND") {
    const workaround = result.workaround === undefined ? row.workaround : result.workaround;
    const summary =
      result.completionSummary === undefined ? row.completionSummary : result.completionSummary;
    if (!workaround?.trim() || !summary?.trim())
      throw new WorkValidationError(
        "An accepted workaround closure must retain its workaround and explanation.",
      );
  }
  if (body.archived !== undefined)
    result.archivedAt = body.archived ? (row.archivedAt ?? now) : null;
  if (isClosed(row.status) && !isClosed(status)) result.archivedAt = null;
  return result;
}
export const AUDIT_FIELDS = [
  "activityType",
  "title",
  "description",
  "status",
  "priorityLevel",
  "requester",
  "affectedPeople",
  "kind",
  "system",
  "desiredOutcome",
  "nextAction",
  "waitingOn",
  "waitingReason",
  "workaround",
  "completionSummary",
  "closureType",
  "completedAt",
  "cancelledAt",
  "archivedAt",
  "dependsOnId",
  "parentId",
];
export function taskChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of AUDIT_FIELDS) {
    let old: unknown = before?.[field] ?? null,
      next: unknown = after[field] ?? null;
    if (["activityType", "requester", "affectedPeople"].includes(field)) {
      const snapshot = (value: unknown): unknown => {
        if (Array.isArray(value))
          return value
            .map((item) => snapshot((item as { contact?: unknown }).contact ?? item))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const person = value as { id: number; name: string } | null;
        return person ? { id: person.id, name: person.name } : null;
      };
      old = snapshot(old);
      next = snapshot(next);
    }
    if (JSON.stringify(old) !== JSON.stringify(next)) changes[field] = { before: old, after: next };
  }
  return JSON.parse(JSON.stringify(changes)) as typeof changes;
}
export function activityAction(
  before: { status: string; archivedAt: unknown } | null,
  after: { status: string; archivedAt: unknown },
  changes: Record<string, unknown>,
) {
  if (!before) return "CREATED";
  if (before.status !== after.status) {
    if (after.status === "DONE") return "COMPLETED";
    if (after.status === "CANCELLED") return "CANCELLED";
    if (isClosed(before.status)) return "REOPENED";
    return "STATUS_CHANGED";
  }
  if ("archivedAt" in changes) return after.archivedAt ? "ARCHIVED" : "RESTORED";
  if (Object.keys(changes).length === 1 && "priorityLevel" in changes) return "PRIORITY_CHANGED";
  if (Object.keys(changes).length === 1 && "activityType" in changes)
    return "ACTIVITY_TYPE_CHANGED";
  return "UPDATED";
}
