import { workBody, workId, WorkValidationError } from "@/lib/work-management/validation";
export const ARTICLE_TYPES = ["REFERENCE", "PROCEDURE", "TROUBLESHOOTING"] as const;
export function articleInput(value: unknown) {
  const input = workBody(value, [
    "draftId",
    "taskIds",
    "projectIds",
    "folderId",
    "title",
    "summary",
    "body",
    "type",
    "tags",
    "pinned",
    "archived",
    "taskId",
    "projectId",
    "restoreRevision",
  ]);
  function text(key: string, max: number, required = false) {
    const value = input[key] ?? "";
    if (
      typeof value !== "string" ||
      value.length > max ||
      value.includes("\0") ||
      (required && !value.trim())
    )
      throw new WorkValidationError(
        `Enter a valid ${key} (up to ${max.toLocaleString()} characters).`,
      );
    return value.replace(/\r\n?/g, "\n");
  }
  const type = input.type ?? "REFERENCE";
  if (!ARTICLE_TYPES.includes(type as (typeof ARTICLE_TYPES)[number]))
    throw new WorkValidationError("Choose a valid article type.");
  const raw = input.tags ?? [];
  if (
    !Array.isArray(raw) ||
    raw.length > 20 ||
    raw.some(
      (tag) =>
        typeof tag !== "string" || !tag.trim() || tag.trim().length > 80 || /[\x00-\x1f]/.test(tag),
    )
  )
    throw new WorkValidationError("Use up to 20 tags, each between 1 and 80 characters.");
  for (const key of ["pinned", "archived"]) {
    if (input[key] !== undefined && typeof input[key] !== "boolean")
      throw new WorkValidationError(`Choose a valid ${key} value.`);
  }
  return {
    folderId: input.folderId == null ? null : workId(input.folderId),
    title: text("title", 300, true).trim(),
    summary: text("summary", 1000).trim(),
    body: text("body", 200000),
    type: String(type),
    tags: [...new Map(raw.map((tag: string) => [tag.trim().toLowerCase(), tag.trim()])).values()],
    pinned: input.pinned === true,
    archived: input.archived === true,
  };
}
export function listPage(params: URLSearchParams) {
  const value = params.get("page") || "1";
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 100000)
    throw new WorkValidationError("Choose a valid page.");
  return Number(value);
}
