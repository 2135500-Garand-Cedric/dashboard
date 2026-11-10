import type { Prisma } from "@/generated/prisma";
import { WORK_KINDS, WORK_PRIORITIES, WORK_STATUSES } from "./types";
import { WorkValidationError, workId } from "./validation";

export const WORK_PAGE_SIZE = 30;
export function parseWorkQuery(params: URLSearchParams) {
  const choice = (name: string, values: readonly string[], fallback: string) => {
    const value = params.get(name) || fallback;
    if (!values.includes(value)) throw new WorkValidationError(`Choose a valid ${name} filter.`);
    return value;
  };
  const text = (name: string, max: number) => {
    const value = (params.get(name) || "").trim();
    if (value.length > max) throw new WorkValidationError(`The ${name} filter is too long.`);
    return value;
  };
  const id = (name: string, unclassified = false) => {
    const value = params.get(name) || "";
    return value === "" || (unclassified && value === "none") ? value : String(workId(value));
  };
  return {
    q: text("q", 500), view: choice("view", ["active", "history", "archived", "all"], "active"),
    context: id("context", true), person: id("person"), company: text("company", 120), course: text("course", 120), system: text("system", 120), tag: text("tag", 50),
    status: choice("status", ["", ...WORK_STATUSES], ""), priority: choice("priority", ["", "none", ...WORK_PRIORITIES], ""), kind: choice("kind", ["", "none", ...WORK_KINDS], ""),
    sort: choice("sort", ["updated", "created", "priority", "title"], "updated"), page: params.has("page") ? workId(params.get("page")) : 1,
  };
}
export type WorkQuery = ReturnType<typeof parseWorkQuery>;
export function workQueryWhere(query: WorkQuery, userId: number): Prisma.TodoWhereInput {
  const AND: Prisma.TodoWhereInput[] = [{ userId }, { archivedAt: query.view === "archived" ? { not: null } : null }];
  if (query.view === "active") AND.push({ status: { notIn: ["DONE", "CANCELLED"] } });
  if (query.view === "history") AND.push({ status: { in: ["DONE", "CANCELLED"] } });
  if (query.context) AND.push({ contextId: query.context === "none" ? null : Number(query.context) });
  for (const field of ["company", "course", "system"] as const) if (query[field]) AND.push({ [field]: { contains: query[field], mode: "insensitive" } });
  if (query.tag) AND.push({ tags: { has: query.tag } });
  if (query.status) AND.push({ status: query.status as Prisma.EnumTodoStatusFilter["equals"] });
  if (query.priority) AND.push({ priorityLevel: query.priority === "none" ? null : query.priority as Prisma.EnumWorkPriorityNullableFilter["equals"] });
  if (query.kind) AND.push({ kind: query.kind === "none" ? null : query.kind as Prisma.EnumWorkTaskKindNullableFilter["equals"] });
  if (query.person) {
    const id = Number(query.person);
    AND.push({ OR: [{ requesterId: id }, { waitingOnContactId: id }, { affectedPeople: { some: { contactId: id, contact: { userId } } } }] });
  }
  if (query.q) {
    const reference = /^TASK-0*(\d+)$/i.exec(query.q), id = reference ? Number(reference[1]) : 0;
    AND.push({ OR: [{ title: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }, ...(id > 0 && id <= 2147483647 ? [{ id }] : [])] });
  }
  return { AND };
}
export function workQueryOrder(sort: string): Prisma.TodoOrderByWithRelationInput[] {
  return sort === "priority" ? [{ priorityLevel: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "desc" }] : sort === "title" ? [{ title: "asc" }, { id: "asc" }] : [{ [sort === "created" ? "createdAt" : "updatedAt"]: "desc" }, { id: "desc" }];
}
