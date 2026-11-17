import { workBody, WorkValidationError } from "./validation";
import { WORK_STATUSES, type WorkStatus } from "./types";
export function noteInput(value: unknown) {
  const body = workBody(value, [
    "body",
    "documentationUrls",
    "occurredAt",
    "taskStatus",
    "taskRevision",
  ]);
  if (typeof body.body !== "string" || !body.body.trim() || body.body.length > 50000)
    throw new WorkValidationError("Write a note between 1 and 50,000 characters.");
  if (body.body.includes("\0"))
    throw new WorkValidationError("Notes cannot contain null characters.");
  const text = body.body.replace(/\r\n?/g, "\n");
  const documentationUrls = body.documentationUrls ?? [];
  if (!Array.isArray(documentationUrls) || documentationUrls.length > 10)
    throw new WorkValidationError("Use up to 10 documentation links.");
  const urls = documentationUrls.map((raw) => {
    if (typeof raw !== "string" || raw.length > 2048 || /[\x00-\x20\x7f\\]/.test(raw))
      throw new WorkValidationError(
        "Use complete HTTP or HTTPS documentation URLs without spaces or credentials.",
      );
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new WorkValidationError("Enter a complete HTTP or HTTPS documentation URL.");
    }
    if (
      url.href.length > 2048 ||
      !["https:", "http:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      throw new WorkValidationError(
        "Documentation links must use HTTP or HTTPS without embedded credentials.",
      );
    return url.href;
  });
  let occurredAt: Date | null = null;
  if (body.occurredAt != null && body.occurredAt !== "") {
    if (
      typeof body.occurredAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(body.occurredAt)
    )
      throw new WorkValidationError(
        "Choose a valid occurred-at date and time with an explicit time zone.",
      );
    occurredAt = new Date(body.occurredAt);
    const localDate = body.occurredAt.slice(0, 10),
      calendar = new Date(`${localDate}T00:00:00Z`);
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      !Number.isFinite(calendar.getTime()) ||
      calendar.toISOString().slice(0, 10) !== localDate
    )
      throw new WorkValidationError("Choose a valid occurred-at date and time.");
  }
  const taskStatus =
    body.taskStatus == null || body.taskStatus === "" ? null : String(body.taskStatus);
  if (taskStatus !== null && !WORK_STATUSES.includes(taskStatus as WorkStatus))
    throw new WorkValidationError("Choose a valid task status.");
  if (
    taskStatus !== null &&
    (!Number.isSafeInteger(body.taskRevision) || Number(body.taskRevision) < 1)
  )
    throw new WorkValidationError("Reload the task before changing its status with a note.", 428);
  return {
    body: text,
    documentationUrls: [...new Set(urls)],
    occurredAt,
    taskStatus: taskStatus as WorkStatus | null,
    taskRevision: taskStatus === null ? null : Number(body.taskRevision),
  };
}
