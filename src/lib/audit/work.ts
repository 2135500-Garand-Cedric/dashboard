import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { recordAudit, auditSnapshot } from "./server";

type DB = Prisma.TransactionClient;
type Row = Record<string, unknown>;
const specs: Record<string, { model: string; type: string; category: string; label: string }> = {
  todo: { model: "todo", type: "task", category: "WORK", label: "Task" },
  task: { model: "todo", type: "task", category: "WORK", label: "Task" },
  project: { model: "workProject", type: "project", category: "WORK", label: "Project" },
  event: { model: "event", type: "event", category: "CALENDAR", label: "Event" },
  contact: { model: "workContact", type: "person", category: "PEOPLE", label: "Person" },
  subtask: { model: "subtask", type: "subtask", category: "WORK", label: "Checklist item" },
  knowledge: {
    model: "knowledgeArticle",
    type: "article",
    category: "KNOWLEDGE",
    label: "Article",
  },
};
function specFor(operation: string) {
  const parts = operation.toLowerCase().split(":");
  if (parts[0] === "knowledge-draft" || operation.includes("image-draft")) return null;
  const base = specs[parts[0]];
  if (!base) throw new Error("Unregistered audited work command.");
  let spec = { ...base },
    id = /^\d+$/.test(parts[1]) ? Number(parts[1]) : null;
  if (parts[0] === "knowledge" && ["folder", "template"].includes(parts[1])) {
    spec = {
      model: parts[1] === "folder" ? "knowledgeFolder" : "knowledgeTemplate",
      type: parts[1],
      category: "KNOWLEDGE",
      label: parts[1] === "folder" ? "Folder" : "Template",
    };
    id = /^\d+$/.test(parts[2]) ? Number(parts[2]) : null;
  }
  if (parts[0] === "todo" && parts[2] === "subtask") {
    spec = { model: "subtask", type: "subtask", category: "WORK", label: "Checklist item" };
    id = null;
  }
  for (const [token, model, type, label] of [
    ["note", "workNote", "note", "Note"],
    ["attachment", "workAttachment", "attachment", "File"],
  ]) {
    const index = parts.indexOf(token);
    if (index < 0) continue;
    spec = { ...base, model, type, label };
    id = /^\d+$/.test(parts[index + 1]) ? Number(parts[index + 1]) : null;
  }
  return { ...spec, id, parts };
}
async function read(db: DB, spec: NonNullable<ReturnType<typeof specFor>>, id: number | null) {
  if (!id) return null;
  const delegate = (
    db as unknown as Record<string, { findFirst: (args: unknown) => Promise<Row | null> }>
  )[spec.model];
  const row = await delegate.findFirst({
    where: { id, ...(spec.model === "subtask" ? { todo: { userId: owner } } : { userId: owner }) },
  });
  if (!row) return null;
  if (spec.model === "todo") {
    const task = await db.todo.findFirst({
      where: { id, userId: owner },
      select: {
        _count: {
          select: {
            prerequisites: true,
            blocking: true,
            children: true,
            subtasks: true,
            relationsAsFirst: true,
            relationsAsSecond: true,
          },
        },
        affectedPeople: { select: { contactId: true }, orderBy: { contactId: "asc" }, take: 100 },
        followUps: {
          where: { status: "ACTIVE" },
          select: { date: true, at: true, reason: true },
          take: 1,
        },
        focusRecords: { select: { date: true, active: true }, orderBy: { date: "desc" }, take: 2 },
        recurrence: {
          select: {
            frequency: true,
            active: true,
            until: true,
            anchor: true,
            timeZone: true,
            template: true,
          },
        },
      },
    });
    row.settings = task;
    row.followUpDate = task?.followUps[0]?.date ?? null;
    row.followUpAt = task?.followUps[0]?.at ?? null;
  }
  if (spec.model === "workProject") {
    row.settings = await db.workProject.findFirst({
      where: { id, userId: owner },
      select: {
        stages: {
          select: { id: true, name: true, active: true, position: true },
          orderBy: { id: "asc" },
          take: 100,
        },
        milestones: {
          where: { removedAt: null },
          select: { id: true, label: true, date: true, at: true, completedAt: true },
          orderBy: { id: "asc" },
          take: 100,
        },
      },
    });
  }
  if (spec.model === "event")
    row.settings = await db.event.findFirst({
      where: { id, userId: owner },
      select: {
        conversions: {
          where: { active: true },
          select: { id: true, todoId: true, mode: true },
          take: 1,
        },
        taskLinks: { select: { todoId: true, role: true }, orderBy: { todoId: "asc" }, take: 100 },
        recurrence: {
          select: {
            frequency: true,
            active: true,
            until: true,
            anchor: true,
            timeZone: true,
            template: true,
          },
        },
      },
    });
  if (spec.model === "knowledgeArticle")
    row.settings = await db.knowledgeArticle.findFirst({
      where: { id, userId: owner },
      select: {
        tasks: { select: { todoId: true }, orderBy: { todoId: "asc" }, take: 100 },
        projects: { select: { projectId: true }, orderBy: { projectId: "asc" }, take: 100 },
        tags: { select: { tagId: true }, orderBy: { tagId: "asc" }, take: 50 },
      },
    });
  return row;
}
export async function prepareWorkAudit(db: DB, operation: string, input?: unknown) {
  const spec = specFor(operation);
  const action =
    input && typeof input === "object" && "action" in input ? String(input.action) : "";
  const intent = [
    "deadline",
    "followup-create",
    "followup-complete",
    "followup-cancel",
    "followup-snooze",
  ].includes(action)
    ? action
    : "";
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const related: { type: string; id: number }[] = [];
  for (const [key, type] of [
    ["targetId", "task"],
    ["taskId", "task"],
    ["parentId", "task"],
    ["projectId", "project"],
  ]) {
    if (typeof body[key] === "number" && Number.isSafeInteger(body[key]) && Number(body[key]) > 0)
      related.push({ type, id: Number(body[key]) });
  }
  if (
    operation.startsWith("knowledge:") &&
    ["task", "project"].includes(String(body.kind)) &&
    typeof body.id === "number" &&
    Number.isSafeInteger(body.id) &&
    body.id > 0
  )
    related.push({ type: String(body.kind), id: body.id });
  return spec
    ? {
        spec,
        before: await read(db, spec, spec.id),
        intent,
        related,
        relationshipKind: ["parent", "child", "blocked-by", "blocks", "related"].includes(
          String(body.kind),
        )
          ? String(body.kind)
          : "",
      }
    : null;
}
export async function finishWorkAudit(
  db: DB,
  operation: string,
  result: unknown,
  key: string,
  context: Awaited<ReturnType<typeof prepareWorkAudit>>,
) {
  if (!context) return;
  const { spec, before, intent, related, relationshipKind } = context;
  const value = result && typeof result === "object" ? (result as Row) : {};
  const id = spec.id ?? (typeof value.id === "number" ? value.id : null);
  const after = await read(db, spec, id);
  if (!before && !after) return;
  const verb = !before ? "created" : !after || after.removedAt ? "removed" : "changed";
  const operationName = spec.parts
    .filter(
      (part) =>
        !/^\d+$/.test(part) &&
        !["new", "create", "patch", "save", "delete", "remove"].includes(part),
    )
    .join(".");
  const reference =
    spec.type === "task"
      ? `TASK-${String(id).padStart(4, "0")}`
      : spec.type === "project"
        ? `PROJECT-${String(id).padStart(4, "0")}`
        : `${spec.label} #${id}`;
  let beforeState = auditSnapshot(before);
  const afterState = auditSnapshot(after);
  if (value.statusChange && typeof value.statusChange === "object") {
    const change = value.statusChange as { before?: unknown; after?: unknown };
    beforeState ??= {};
    beforeState.status = change.before;
    if (afterState) afterState.status = change.after;
  }
  const subject =
    [
      "relationship",
      "stage",
      "milestone",
      "focus",
      "recurrence",
      "link",
      "convert",
      "conversion",
    ].find((part) => spec.parts.includes(part)) ??
    (spec.type === "task" && spec.parts.includes("project") ? "project membership" : "");
  await recordAudit(db, {
    category: spec.category,
    action: `${operationName}${intent ? `.${intent}` : ""}.${verb}`,
    entityType: spec.type,
    entityId: id,
    entityReference: reference,
    summary: intent
      ? `${spec.label} ${intent.replaceAll("-", " ")}`
      : `${spec.label} ${subject ? `${subject}${relationshipKind ? ` (${relationshipKind})` : ""} ` : ""}${verb}`,
    before: beforeState,
    after: afterState,
    operationKey: key,
    eventKey: `work:${key}`,
    originType: "work-command",
    originId: key,
    related: [
      ...related,
      ...(typeof value.taskId === "number" ? [{ type: "task", id: value.taskId }] : []),
      ...(typeof (after ?? before)?.todoId === "number"
        ? [{ type: "task", id: (after ?? before)!.todoId as number }]
        : []),
    ],
  });
}
