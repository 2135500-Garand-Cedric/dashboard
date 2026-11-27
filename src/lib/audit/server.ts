import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID, OWNER_GITHUB_ID } from "@/lib/owner-policy";
import { appendAudit, auditSnapshot, type AuditInput } from "./writer.mjs";
export { auditSnapshot } from "./writer.mjs";
export function recordAudit(
  db: Prisma.TransactionClient,
  event: Omit<AuditInput, "userId" | "actorKind" | "actorGithubId">,
) {
  return appendAudit(db, {
    ...event,
    userId: OWNER_DATABASE_USER_ID,
    actorKind: "OWNER",
    actorGithubId: OWNER_GITHUB_ID,
  });
}
export async function auditRecordChange(
  db: Prisma.TransactionClient,
  event: Omit<AuditInput, "userId" | "actorKind" | "actorGithubId" | "before" | "after">,
  before: unknown,
  after: unknown,
) {
  return recordAudit(db, { ...event, before: auditSnapshot(before), after: auditSnapshot(after) });
}
