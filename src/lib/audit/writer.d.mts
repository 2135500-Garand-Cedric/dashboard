import type { Prisma } from "@/generated/prisma";
export const AUDIT_CATEGORIES: readonly string[];
export const AUDIT_OUTCOMES: readonly string[];
export type AuditState = Record<string, unknown> | null;
export type AuditInput = {
  userId: number;
  actorKind: "OWNER" | "USER" | "SYSTEM" | "ANONYMOUS";
  actorGithubId?: string;
  actorUserId?: number | null;
  category: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  entityReference?: string;
  summary: string;
  before?: AuditState;
  after?: AuditState;
  related?: { type: string; id: string | number }[];
  operationKey?: string;
  eventKey?: string;
  outcome?: string;
  occurredAt?: Date;
  originType?: string;
  originId?: string | number;
  force?: boolean;
};
export function auditSnapshot(row: unknown): AuditState;
export function auditDifferences(before: AuditState, after: AuditState): Record<string, unknown>;
export function appendAudit(
  db: Pick<Prisma.TransactionClient, "auditEvent">,
  event: AuditInput,
): Promise<unknown>;
export function pruneAudit(
  db: Pick<Prisma.TransactionClient, "auditEvent">,
  now?: Date,
  limit?: number,
): Promise<number>;

export function withinAuditCommand<T>(action: () => Promise<T>): Promise<T>;
