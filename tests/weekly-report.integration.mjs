import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { weeklyModules } from "./helpers/weekly-report.mjs";

const enabled = process.env.RUN_WEEKLY_REPORT_DB_TEST === "1";
test(
  "weekly reporting reads exact owned history, missing measurements and canonical finances without changing records",
  { skip: !enabled },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const prisma = new PrismaClient();
    const rollback = new Error("ROLLBACK_WEEKLY_FIXTURE");
    try {
      await assert.rejects(
        prisma.$transaction(
          async (tx) => {
            await tx.user.upsert({
              where: { id: 1 },
              create: { id: 1, email: `weekly-owner-${randomUUID()}@invalid.test` },
              update: {},
            });
            const foreign = await tx.user.create({
              data: { email: `${randomUUID()}@invalid.test` },
            });
            const prefix = `Weekly ${randomUUID()}`;
            const at = new Date("2001-01-02T12:00:00Z");
            const now = new Date();
            const baseModules = weeklyModules({ ...tx, $transaction: (fn) => fn(tx) });
            const p = baseModules.period.weeklyPeriod(
              new URLSearchParams("week=2001-01-01&dataset=all"),
              "UTC",
              now,
            );
            const project = await tx.workProject.create({ data: { userId: 1, name: prefix } });
            const task = (title, extra = {}) =>
              tx.todo.create({
                data: { userId: 1, title: `${prefix} ${title}`, projectId: project.id, ...extra },
              });
            const done = await task("completed then reopened"),
              removed = await task("removed"),
              cancelled = await task("cancelled");
            const audit = (todo, action, date = at) =>
              tx.workActivity.create({
                data: {
                  userId: 1,
                  actorGithubId: "89470930",
                  todoId: todo.id,
                  todoReference: `TASK-${todo.id}`,
                  action,
                  changes: {
                    status: { before: "TODO", after: action === "COMPLETED" ? "DONE" : "TODO" },
                  },
                  createdAt: date,
                },
              });
            await audit(done, "COMPLETED");
            await audit(done, "COMPLETED", new Date(at.getTime() + 1000));
            await audit(done, "REOPENED", new Date(at.getTime() + 2000));
            await audit(removed, "COMPLETED");
            await tx.todo.delete({ where: { id: removed.id } });
            await audit(cancelled, "CANCELLED");
            const other = await tx.todo.create({
              data: { userId: foreign.id, title: "Foreign task" },
            });
            await tx.workActivity.create({
              data: {
                userId: foreign.id,
                actorGithubId: "123",
                todoId: other.id,
                todoReference: `TASK-${other.id}`,
                action: "COMPLETED",
                changes: {},
                createdAt: at,
              },
            });
            for (let i = 0; i < 6; i++)
              await audit(
                await task(`extra ${i}`, i === 0 ? { parentId: done.id } : {}),
                "COMPLETED",
                new Date(at.getTime() + i * 10000),
              );
            // Current planning stays current even when the selected report week is old.
            const today = now.toISOString().slice(0, 10);
            const dueTask = await tx.todo.create({
              data: {
                userId: 1,
                title: `${prefix} due now`,
                deadlineAt: new Date(now.getTime() - 3600000),
                deadlineTimeZone: "UTC",
              },
            });
            await tx.workFollowUp.create({
              data: { todoId: dueTask.id, at: new Date(now.getTime() - 60000), timeZone: "UTC" },
            });
            const closed = await tx.todo.create({
              data: {
                userId: 1,
                title: `${prefix} closed`,
                status: "DONE",
                deadlineDate: "2000-01-01",
              },
            });
            const archived = await tx.todo.create({
              data: {
                userId: 1,
                title: `${prefix} archived`,
                archivedAt: now,
                deadlineDate: "2000-01-01",
              },
            });
            const target = await tx.workProject.create({
              data: { userId: 1, name: `${prefix} target`, targetDate: today },
            });
            for (const id of [1, 5])
              await tx.activity.upsert({
                where: { id },
                create: { id, activity: `Activity ${id}` },
                update: {},
              });
            await tx.practice.create({
              data: {
                userId: 1,
                activityId: 1,
                date: at,
                wordCount: 10,
                weakCount: 2,
                goodCount: 3,
                perfectCount: 5,
                durationSeconds: 60,
                averageBefore: 40,
                averageAfter: 41.5,
                activityName: "Saved activity name",
              },
            });
            await tx.practice.create({
              data: {
                userId: 1,
                activityId: 1,
                date: at,
                wordCount: 10,
                weakCount: 1,
                goodCount: 4,
                perfectCount: 5,
              },
            });
            await tx.practice.create({
              data: {
                userId: 1,
                activityId: 5,
                date: at,
                wordCount: 3,
                weakCount: 1,
                goodCount: 1,
                perfectCount: 1,
                durationSeconds: 20,
                averageBefore: 41.5,
                averageAfter: 41.75,
              },
            });
            await tx.practice.create({
              data: {
                userId: foreign.id,
                activityId: 1,
                date: at,
                wordCount: 999,
                weakCount: 999,
                goodCount: 0,
                perfectCount: 0,
              },
            });
            const article = (title, date) =>
              tx.knowledgeArticle.create({
                data: { userId: 1, title: `${prefix} ${title}`, createdAt: date },
              });
            const created = await article("created", at),
              changed = await article("current later title", new Date("2000-01-01T12:00:00Z"));
            const revision = (record, title, date, rev) =>
              tx.knowledgeArticleRevision.create({
                data: {
                  articleId: record.id,
                  userId: 1,
                  revision: rev,
                  title,
                  summary: "",
                  body: "Private body must not leave report",
                  type: "PROCEDURE",
                  tags: [],
                  action: rev === 1 ? "CREATED" : "EDITED",
                  actorGithubId: "89470930",
                  recordedAt: date,
                },
              });
            await revision(created, "Created in week", at, 1);
            await revision(created, "Created and edited in week", at, 2);
            await revision(changed, "Historical title", at, 1);
            await revision(
              changed,
              "Later title must not replace weekly history",
              new Date("2001-02-01T12:00:00Z"),
              2,
            );
            const account = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: prefix,
                normalizedName: prefix.toLowerCase(),
                type: "CHEQUING",
                currency: "CAD",
              },
            });
            const movement = (type, amount, extra = {}) =>
              tx.financialTransaction.create({
                data: {
                  userId: 1,
                  accountId: account.id,
                  occurredOn: new Date("2001-01-02T00:00:00Z"),
                  currency: "CAD",
                  description: `${prefix} ${type}`,
                  type,
                  amount,
                  ...extra,
                },
              });
            const income = await movement("INCOME", "400");
            const purchase = await movement("EXPENSE", "-125", { source: "IMPORTED" });
            await movement("EXPENSE", "-125", { excludedAmount: "125" });
            await movement("REFUND", "10");
            await movement("ADJUSTMENT", "5");
            await tx.financialReceipt.create({
              data: {
                userId: 1,
                accountId: account.id,
                transactionId: purchase.id,
                purchasedOn: new Date("2001-01-02"),
                merchant: prefix,
                subtotal: "125",
                total: "125",
                currency: "CAD",
              },
            });
            await tx.financialIncomeRecord.create({
              data: {
                userId: 1,
                accountId: account.id,
                transactionId: income.id,
                paidOn: new Date("2001-01-02"),
                description: prefix,
                grossAmount: "500",
                netAmount: "400",
                currency: "CAD",
              },
            });
            const peer = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: `${prefix} savings`,
                normalizedName: `${prefix} savings`.toLowerCase(),
                type: "SAVINGS",
                currency: "CAD",
              },
            });
            const transfer = await tx.financialTransfer.create({ data: { userId: 1 } });
            await movement("TRANSFER", "-100", { transferId: transfer.id });
            await movement("TRANSFER", "100", { transferId: transfer.id, accountId: peer.id });
            const usd = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: `${prefix} USD`,
                normalizedName: `${prefix} usd`.toLowerCase(),
                type: "SAVINGS",
                currency: "USD",
              },
            });
            await movement("INCOME", "900", { currency: "USD", accountId: usd.id });
            const statement = await tx.financialImport.create({
              data: {
                userId: 1,
                accountId: account.id,
                status: "COMPLETED",
                matchingOnly: true,
                fingerprint: randomUUID().replaceAll("-", "").padEnd(64, "0"),
                originalName: "Fixture statement.csv",
                periodStart: new Date("2001-01-01"),
                periodEnd: new Date("2001-01-07"),
              },
            });
            await tx.financialImportEntry.create({
              data: {
                importId: statement.id,
                rowKey: "matched-deposit",
                action: "MATCH",
                transactionId: income.id,
                originalData: { description: "Deposit" },
                normalized: { date: "2001-01-02", amount: "400.0000", description: "Deposit" },
              },
            });
            await tx.financialImportEntry.create({
              data: {
                importId: statement.id,
                rowKey: "unmatched-row",
                action: "REVIEW",
                originalData: { description: "Other row" },
                normalized: { date: "2001-01-02", amount: "-20.0000", description: "Other row" },
              },
            });
            let writes = 0;
            const blocked = new Set([
              "create",
              "createMany",
              "update",
              "updateMany",
              "upsert",
              "delete",
              "deleteMany",
              "$executeRaw",
              "$executeRawUnsafe",
            ]);
            let readonly;
            readonly = new Proxy(tx, {
              get(target, key) {
                if (key === "$transaction") return (fn) => fn(readonly);
                if (blocked.has(key))
                  return () => {
                    writes++;
                    throw new Error("Report attempted a write");
                  };
                const value = target[key];
                if (value && typeof value === "object")
                  return new Proxy(value, {
                    get(model, method) {
                      if (blocked.has(method))
                        return () => {
                          writes++;
                          throw new Error("Report attempted a mutation");
                        };
                      const fn = model[method];
                      return typeof fn === "function" ? fn.bind(model) : fn;
                    },
                  });
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            const modules = weeklyModules(readonly);
            const report = await modules.zone.runInTimeZone("UTC", () =>
              modules.server.weeklyReport(new URLSearchParams("week=2001-01-01&dataset=all"), now),
            );
            for (const key of ["work", "attention", "japanese", "knowledge", "finance"])
              assert.equal(report[key].error, null, `${key}: ${report[key].error}`);
            assert.equal(report.work.data.completed.total, 8);
            assert.equal(report.work.data.completed.items.length, 3);
            assert.equal(report.work.data.reopened.total, 1);
            assert.equal(report.work.data.cancelled.total, 1);
            const more = await modules.zone.runInTimeZone("UTC", () =>
              modules.server.weeklyItems(
                new URLSearchParams({
                  week: p.week,
                  dataset: "all",
                  section: "completed",
                  cursor: report.work.data.completed.nextCursor,
                }),
                now,
              ),
            );
            const all = [...report.work.data.completed.items, ...more.items];
            assert.equal(new Set(all.map((row) => row.id)).size, 8);
            assert.ok(
              all.find((row) => row.href === `/todos/${done.id}`).badges.includes("Reopened"),
            );
            assert.ok(all.some((row) => row.href === null && row.badges.includes("Deleted")));
            const due = await modules.work.attention(readonly, p, "attention", 0, 10000);
            assert.equal(due.items.filter((row) => row.href === `/todos/${dueTask.id}`).length, 1);
            assert.deepEqual(due.items.find((row) => row.href === `/todos/${dueTask.id}`).badges, [
              "Overdue deadline",
              "Follow-up due",
            ]);
            assert.ok(
              !due.items.some((row) =>
                [`/todos/${closed.id}`, `/todos/${archived.id}`].includes(row.href),
              ),
            );
            const targets = await modules.work.attention(readonly, p, "projects", 0, 10000);
            assert.ok(targets.items.some((row) => row.href === `/projects/${target.id}`));
            assert.equal(report.japanese.data.vocab.sessions, 2);
            assert.equal(report.japanese.data.vocab.reviews, 20);
            assert.equal(report.japanese.data.vocab.durationSeconds, 60);
            assert.equal(report.japanese.data.vocab.partialTime, true);
            assert.equal(report.japanese.data.vocab.impact, 1.5);
            assert.equal(report.japanese.data.vocab.partialImpact, true);
            assert.equal(report.japanese.data.kanji.reviews, 3);
            assert.equal(report.knowledge.data.created.total, 1);
            assert.equal(report.knowledge.data.changed.total, 1);
            assert.equal(report.knowledge.data.changed.items[0].title, "Historical title");
            assert.equal(
              report.finance.data.unmatched.total,
              2,
              "matched deposit is excluded; receipt does not mark an expense statement-matched",
            );
            assert.ok(
              !report.finance.data.unmatched.items.some(
                (row) => row.href === `/finance/income/deposits/${income.id}`,
              ),
            );
            assert.equal(report.finance.data.totals.income, "400.0000");
            assert.equal(report.finance.data.totals.expenses, "115.0000");
            assert.equal(report.finance.data.totals.net, "290.0000");
            assert.equal(report.finance.data.totals.adjustments, "5.0000");
            const finance = modules.load("src/lib/finance/reporting-server.ts");
            const filters = modules.load("src/lib/finance/reporting.ts").reportFilters(
              new URLSearchParams({
                mode: "custom",
                from: p.week,
                to: p.financeTo,
                currency: "CAD",
                dataset: "all",
              }),
            );
            const canonical = await finance.financeReport(filters);
            assert.deepEqual(report.finance.data.totals, canonical.totals);
            assert.equal(writes, 0);
            assert.ok(!JSON.stringify(report).includes("Private body must not leave report"));
            // A UTC Sunday can already belong to Monday in the saved timezone.
            const tokyo = modules.period.weeklyPeriod(
              new URLSearchParams("week=2001-01-01"),
              "Asia/Tokyo",
              now,
            );
            for (const date of [new Date(tokyo.start.getTime() + 1000), tokyo.end]) {
              await tx.practice.create({
                data: {
                  userId: 1,
                  activityId: 1,
                  date,
                  wordCount: 1,
                  weakCount: 1,
                  goodCount: 0,
                  perfectCount: 0,
                },
              });
            }
            const localPractices = await modules.learning.practiceSummary(readonly, tokyo);
            assert.equal(
              localPractices.vocab.sessions,
              3,
              "local Monday is included; next Monday boundary is excluded",
            );
            assert.equal(localPractices.vocab.reviews, 21);
            const broken = weeklyModules(readonly, {
              "@/lib/finance/reporting-server": {
                financeReport: async () => {
                  throw new Error("Private failure");
                },
              },
            });
            const partial = await broken.zone.runInTimeZone("UTC", () =>
              broken.server.weeklyReport(new URLSearchParams("week=2001-01-01"), now),
            );
            assert.equal(partial.finance.data, null);
            assert.ok(partial.finance.error);
            assert.ok(partial.work.data);
            assert.ok(!JSON.stringify(partial).includes("Private failure"));
            throw rollback;
          },
          { timeout: 60000 },
        ),
        (error) => {
          if (error !== rollback) throw error;
          return true;
        },
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
