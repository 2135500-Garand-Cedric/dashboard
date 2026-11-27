import { appendAudit, auditSnapshot } from "./writer.mjs";

// Provider acceptance must survive an audit insert failure. The savepoint keeps
// an optional audit failure from aborting a recorded external-delivery outcome.
async function deliveryAudit(tx, event) {
  await tx.$executeRawUnsafe("SAVEPOINT audit_delivery");
  try {
    await appendAudit(tx, event);
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT audit_delivery");
  } catch {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT audit_delivery");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT audit_delivery");
    console.error("Audit: delivery history unavailable.");
  }
}
export async function updateDelivery(db, model, args) {
  if (!args.data.status || !["SENT", "FAILED", "UNKNOWN", "SKIPPED"].includes(args.data.status))
    return db[model].updateMany(args);
  const action = async (tx) => {
    const rows = await tx[model].findMany({
      where: { AND: [args.where, { status: { not: args.data.status } }] },
      select: {
        id: true,
        status: true,
        ...(model === "pushDelivery"
          ? { subscription: { select: { userId: true } } }
          : { userId: true }),
      },
      take: 101,
    });
    const result = await tx[model].updateMany(args);
    if (!result.count) return result;
    const outcome =
      args.data.status === "SENT"
        ? "ACCEPTED"
        : args.data.status === "UNKNOWN"
          ? "UNKNOWN"
          : args.data.status === "SKIPPED"
            ? "SKIPPED"
            : "FAILED";
    if (rows.length > 100) {
      await deliveryAudit(tx, {
        userId: rows[0].userId ?? rows[0].subscription.userId,
        actorKind: "SYSTEM",
        category: model === "emailDelivery" ? "EMAIL" : "NOTIFICATIONS",
        entityType: "delivery",
        action: "delivery.batch_outcome",
        outcome,
        summary: "Delivery batch updated",
        after: auditSnapshot({ count: result.count, status: args.data.status }),
      });
      return result;
    }
    for (const row of rows.slice(0, 100)) {
      if (row.status === args.data.status) continue;
      await deliveryAudit(tx, {
        userId: row.userId ?? row.subscription.userId,
        actorKind: "SYSTEM",
        category: model === "emailDelivery" ? "EMAIL" : "NOTIFICATIONS",
        entityType: model === "emailDelivery" ? "email" : "delivery",
        entityId: String(row.id),
        action: model === "emailDelivery" ? "email.outcome" : "push.outcome",
        outcome,
        summary: model === "emailDelivery" ? "Email delivery outcome" : "Push delivery outcome",
        before: auditSnapshot({ status: row.status }),
        after: auditSnapshot({ status: args.data.status, errorCode: args.data.errorCode ?? null }),
        eventKey: `delivery:${model}:${row.id}:${args.data.status}`,
      });
    }
    return result;
  };
  return typeof db.$transaction === "function" ? db.$transaction(action) : action(db);
}
