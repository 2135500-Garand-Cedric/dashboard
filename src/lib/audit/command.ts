import { currentActor } from "@/lib/accounts/context.mjs";
import type { Prisma } from "@/generated/prisma";
import { OWNER_DATABASE_USER_ID as owner } from "@/lib/owner-policy";
import { withinAuditCommand } from "./writer.mjs";
import { auditRecordChange } from "./server";

type Delegate = { findFirst: (args: unknown) => Promise<Record<string, unknown> | null> };
type Identity = string | number | null | undefined;
export type AuditCommand<T = unknown> = {
  model: string;
  category: string;
  entityType: string;
  label: string;
  id?: Identity;
  action?: string;
  key?: string;
  related?: { type: string; id: string | number }[];
  resultId?: (result: T) => Identity;
  before?: unknown;
  eventId?: (row: Record<string, unknown>) => Identity;
};
export async function auditedCommand<T>(
  db: Prisma.TransactionClient,
  spec: AuditCommand<T>,
  command: () => Promise<T>,
): Promise<T> {
  const subject = currentActor()?.id ?? owner;
  const table = (db as unknown as Record<string, Delegate>)[spec.model];
  if (!table?.findFirst) throw new Error("Unknown audit command model.");
  const read = async (id: Identity) => {
    if (id == null) return null;
    const include =
      spec.model === "financialIncomeRecord"
        ? {
            documents: { select: { id: true } },
            deductions: { select: { typeId: true, amount: true } },
          }
        : spec.model === "financialReceipt"
          ? { documents: { select: { id: true } } }
          : spec.model === "financialTransaction"
            ? {
                transfer: {
                  select: {
                    transactions: {
                      select: { accountId: true, amount: true, currency: true },
                      orderBy: { accountId: "asc" },
                    },
                  },
                },
              }
            : spec.model === "vocabulary"
              ? {
                  activityVocab: {
                    select: { activityId: true, status: true },
                    orderBy: { activityId: "asc" },
                    take: 100,
                  },
                }
              : spec.model === "financialImport"
                ? {
                    documents: { select: { id: true } },
                    entries: {
                      select: { id: true, transactionId: true, action: true, normalized: true },
                      orderBy: { id: "asc" },
                      take: 10001,
                    },
                  }
                : undefined;
    const row = await table.findFirst({
      where: {
        id,
        ...(["user", "activityType"].includes(spec.model) ? {} : { userId: subject }),
      },
      ...(include ? { include } : {}),
    });
    if (row && include)
      row.settings = Object.fromEntries(Object.keys(include).map((key) => [key, row[key]]));
    return row;
  };
  const before = spec.before === undefined ? await read(spec.id) : spec.before;
  const result = await withinAuditCommand(command);
  // Business replay keys are still enforced by each existing domain command.
  if (
    result &&
    typeof result === "object" &&
    (("replayed" in result && result.replayed) || ("reused" in result && result.reused))
  )
    return result;
  const resultId =
    spec.resultId?.(result) ??
    spec.id ??
    (result && typeof result === "object" && "id" in result
      ? (result as { id: Identity }).id
      : null);
  const after = await read(resultId);
  if (!before && !after) return result;
  const eventId = spec.eventId?.((after ?? before) as Record<string, unknown>) ?? resultId;
  const sourceTransactionId = ["financialIncomeRecord", "financialReceipt"].includes(spec.model)
    ? ((after ?? before) as { transactionId?: number | null })?.transactionId
    : null;
  const verb = !before ? "created" : !after ? "deleted" : "changed";
  await auditRecordChange(
    db,
    {
      category: spec.category,
      entityType: spec.entityType,
      entityId: eventId,
      action: spec.action ?? `${spec.entityType}.${verb}`,
      summary: `${spec.label} ${verb}`,
      entityReference: `${spec.label} #${sourceTransactionId ?? eventId}`,
      ...(spec.key ? { operationKey: spec.key, eventKey: `${spec.entityType}:${spec.key}` } : {}),
      related:
        spec.related ??
        (sourceTransactionId
          ? [{ type: "transaction", id: sourceTransactionId }]
          : spec.model === "financialImport"
            ? [
                ...new Set(
                  [
                    ...((before as { entries?: { transactionId: number | null }[] })?.entries ??
                      []),
                    ...((after as { entries?: { transactionId: number | null }[] })?.entries ?? []),
                  ]
                    .filter((row) => row.transactionId)
                    .map((row) => row.transactionId!),
                ),
              ]
                .slice(0, 8)
                .map((id) => ({ type: "transaction", id }))
            : undefined),
    },
    before,
    after,
  );
  return result;
}
