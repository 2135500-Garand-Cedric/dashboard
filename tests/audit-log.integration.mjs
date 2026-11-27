import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { appendAudit, auditSnapshot, pruneAudit } from "../src/lib/audit/writer.mjs";
import { updateDelivery } from "../src/lib/audit/delivery.mjs";
import { loadWorkModule } from "./helpers/work-support.mjs";
import { loadWorkServices } from "../scripts/helpers/work-services.mjs";
import { loadFinanceServices } from "../scripts/helpers/finance-services.mjs";
import { logDateRange, logDateDefaults } from "../src/lib/audit/dates.mjs";
const enabled = process.env.RUN_AUDIT_DB_TEST === "1";
const owner = { OWNER_DATABASE_USER_ID: 1, OWNER_GITHUB_ID: "89470930" };
const event = {
  userId: 1,
  actorKind: "OWNER",
  actorGithubId: owner.OWNER_GITHUB_ID,
  category: "WORK",
  action: "task.changed",
  entityType: "task",
  summary: "Task changed",
};

test(
  "audit database contract: atomicity, retries, safe links, retention and accepted-send failure isolation",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const tag = randomUUID();
    const rollback = new Error("ROLLBACK_AUDIT_FIXTURE");
    try {
      await db.user.upsert({
        where: { id: 1 },
        create: { id: 1, email: "audit-owner@invalid.test" },
        update: {},
      });
      await t.test("audit insert failure rolls back the business write", async () => {
        await assert.rejects(
          db.$transaction(async (tx) => {
            const faulty = {
              ...tx,
              auditEvent: {
                ...tx.auditEvent,
                createMany: async () => {
                  throw new Error("AUDIT_UNAVAILABLE");
                },
              },
            };
            const { auditedCommand } = loadWorkModule("src/lib/audit/command.ts", {
              "@/lib/owner-policy": owner,
              "./writer.mjs": await import("../src/lib/audit/writer.mjs"),
              "./server": loadWorkModule("src/lib/audit/server.ts", {
                "@/lib/owner-policy": owner,
                "./writer.mjs": await import("../src/lib/audit/writer.mjs"),
              }),
            });
            await auditedCommand(
              faulty,
              { model: "todo", category: "WORK", entityType: "task", label: "Task" },
              () => tx.todo.create({ data: { userId: 1, title: tag } }),
            );
          }),
          /AUDIT_UNAVAILABLE/,
        );
        assert.equal(await db.todo.count({ where: { title: tag } }), 0);
      });
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const root = { ...tx, $transaction: (action) => action(tx) };
            const work = loadWorkServices(root);
            const finance = loadFinanceServices(root);
            await t.test(
              "work commands group changes, preserve receipts and no-op saves",
              async () => {
                const key = randomUUID();
                const started = performance.now();
                const task = await work.server.createTodo(
                  { title: `Audit fixture ${tag}` },
                  { requestKey: key },
                );
                const latency = performance.now() - started;
                assert.equal(
                  (
                    await work.server.createTodo(
                      { title: `Audit fixture ${tag}` },
                      { requestKey: key },
                    )
                  ).id,
                  task.id,
                );
                const logs = await tx.auditEvent.findMany({ where: { eventKey: `work:${key}` } });
                assert.equal(logs.length, 1);
                assert.equal(logs[0].entityId, String(task.id));
                const noOpCount = await tx.auditEvent.count();
                await work.server.patchTodo(
                  task.id,
                  { title: task.title },
                  { requestKey: randomUUID(), revision: task.revision },
                );
                assert.equal(await tx.auditEvent.count(), noOpCount);
                const other = await work.server.createTodo(
                  { title: `Related ${tag}` },
                  { requestKey: randomUUID() },
                );
                const current = await work.server.getTodo(task.id);
                const linkKey = randomUUID();
                await work.relationships.relationshipCommand(
                  task.id,
                  { kind: "blocks", targetId: other.id },
                  { requestKey: linkKey, revision: current.revision },
                );
                const linkLog = await tx.auditEvent.findFirst({
                  where: { eventKey: `work:${linkKey}` },
                });
                assert.ok(linkLog, "inverse blocking relationship must produce history");
                assert.match(linkLog.summary, /blocks/);
                assert.ok(
                  linkLog.changes.related.some(
                    (ref) => ref.type === "task" && ref.id === String(other.id),
                  ),
                );
                const note = await work.supporting.createNote(
                  task.id,
                  { body: "SECRET AUDIT NOTE" },
                  { requestKey: randomUUID() },
                );
                const noteLog = await tx.auditEvent.findFirst({
                  where: { entityType: "note", entityId: String(note.id) },
                });
                assert.deepEqual(noteLog.changes.body, { changed: true });
                assert.doesNotMatch(JSON.stringify(noteLog), /SECRET AUDIT NOTE/);
                t.diagnostic(
                  `Representative task create including audit: ${latency.toFixed(1)} ms`,
                );
              },
            );
            await t.test(
              "a transfer produces one event and two preserved ledger legs",
              async () => {
                const account = (type) =>
                  tx.financialAccount.create({
                    data: {
                      userId: 1,
                      name: randomUUID(),
                      normalizedName: randomUUID(),
                      type,
                      currency: "CAD",
                    },
                  });
                const from = await account("CHEQUING"),
                  to = await account("CREDIT_CARD");
                const input = finance.transactionInput({
                  type: "TRANSFER",
                  date: "2026-11-25",
                  description: tag,
                  amount: "125.25",
                  currency: "CAD",
                  accountId: from.id,
                  destinationAccountId: to.id,
                  requestKey: randomUUID(),
                });
                const started = performance.now();
                const saved = await finance.transactions.saveTransaction(input);
                const id = saved.transaction?.id ?? saved.id;
                assert.ok(id, JSON.stringify(saved));
                assert.equal(
                  await tx.auditEvent.count({ where: { eventKey: `finance:${input.requestKey}` } }),
                  1,
                );
                const row = await tx.financialTransaction.findUnique({
                  where: { id },
                  include: { transfer: { include: { transactions: true } } },
                });
                assert.equal(row.transfer.transactions.length, 2);
                assert.equal(
                  row.transfer.transactions.reduce((sum, leg) => sum + Number(leg.amount), 0),
                  0,
                );
                t.diagnostic(
                  `Representative transfer save including audit: ${(performance.now() - started).toFixed(1)} ms`,
                );
              },
            );
            await t.test(
              "event keys replay once and query filters/cursors are owner scoped",
              async () => {
                const key = `audit-fixture:${tag}`;
                await appendAudit(tx, { ...event, eventKey: key });
                await appendAudit(tx, { ...event, eventKey: key });
                assert.equal(await tx.auditEvent.count({ where: { eventKey: key } }), 1);
                const foreign = await tx.user.create({ data: { email: `${tag}@invalid.test` } });
                const privateLog = await tx.auditEvent.create({
                  data: {
                    userId: foreign.id,
                    actorKind: "SYSTEM",
                    category: "WORK",
                    action: "task.changed",
                    entityType: "task",
                    summary: "FOREIGN_PRIVATE",
                    outcome: "SUCCESS",
                    entityReference: "",
                    changes: {},
                    eventKey: randomUUID(),
                    operationKey: randomUUID(),
                  },
                });
                const query = loadWorkModule("src/lib/audit/query.ts", {
                  "./dates.mjs": { logDateRange, logDateDefaults },
                  "@/lib/prisma": { prisma: tx },
                  "@/lib/owner-policy": owner,
                  "@/lib/time-zone-context": { getAppTimeZone: () => "UTC" },
                  "./writer.mjs": await import("../src/lib/audit/writer.mjs"),
                  "@/lib/finance/activity-links": loadWorkModule(
                    "src/lib/finance/activity-links.ts",
                  ),
                  "@/lib/calendar-occasion-core": {},
                  "@/lib/calendar-annual": {},
                });
                assert.equal(await query.logDetail(privateLog.id), null);
                assert.equal((await query.listLogs({ search: "FOREIGN_PRIVATE" })).items.length, 0);
                assert.throws(() => query.logFilters({ from: "2026-02-30" }), /date range/);
                assert.throws(() => query.logFilters({ cursor: "bad" }), /filters changed/);
                const deleted = await tx.auditEvent.create({
                  data: {
                    userId: 1,
                    actorKind: "SYSTEM",
                    category: "WORK",
                    action: "task.deleted",
                    entityType: "task",
                    entityId: "2147483647",
                    summary: "Deleted fixture",
                    outcome: "SUCCESS",
                    entityReference: "",
                    changes: {},
                    eventKey: randomUUID(),
                    operationKey: randomUUID(),
                  },
                });
                assert.equal((await query.logDetail(deleted.id)).sourceState, "deleted");
                const counts = await tx.auditEvent.count();
                await query.listLogs({});
                assert.equal(
                  await tx.auditEvent.count(),
                  counts,
                  "reading logs must not produce logs",
                );
              },
            );
            await t.test(
              "provider acceptance survives an audit insert error without a new send",
              async () => {
                const email = await tx.emailDelivery.create({
                  data: { userId: 1, kind: "test", dedupeKey: tag, payload: {} },
                });
                const faulty = {
                  ...tx,
                  auditEvent: {
                    ...tx.auditEvent,
                    createMany: async () =>
                      tx.$executeRawUnsafe('SELECT * FROM "audit_deliberately_missing_table"'),
                  },
                };
                let sends = 1;
                await updateDelivery(faulty, "emailDelivery", {
                  where: { id: email.id, status: "PENDING" },
                  data: { status: "SENT" },
                });
                assert.equal(
                  (await tx.emailDelivery.findUnique({ where: { id: email.id } })).status,
                  "SENT",
                );
                const retried = await updateDelivery(tx, "emailDelivery", {
                  where: { id: email.id, status: "PENDING" },
                  data: { status: "SENT" },
                });
                if (retried.count) sends++;
                assert.equal(sends, 1);
                assert.equal(
                  await tx.auditEvent.count({
                    where: { eventKey: `delivery:emailDelivery:${email.id}:SENT` },
                  }),
                  0,
                );
              },
            );
            await t.test("retention preserves source and domain-history tables", async () => {
              const old = await appendAudit(tx, {
                ...event,
                eventKey: `old:${tag}`,
                occurredAt: new Date(Date.now() - 181 * 86400000),
              });
              const before = await tx.todo.count();
              await pruneAudit(tx);
              assert.equal(await tx.auditEvent.count({ where: { eventKey: old.eventKey } }), 0);
              assert.equal(await tx.todo.count(), before);
            });
            throw rollback;
          },
          { timeout: 110000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      await db.$disconnect();
    }
  },
);
