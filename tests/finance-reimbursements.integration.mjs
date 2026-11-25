import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { loadWorkModule } from "./helpers/work-support.mjs";

const require = createRequire(import.meta.url);
function modules(prisma, Prisma) {
  const deps = {
    "@/generated/prisma": { Prisma },
    "@/lib/prisma": { prisma },
    "next/server": require("next/server"),
  };
  for (const name of [
    "validation",
    "transactions",
    "server",
    "reimbursements",
    "reimbursement-server",
    "transaction-server",
    "reporting",
  ])
    deps[`./${name}`] = loadWorkModule(`src/lib/finance/${name}.ts`, deps);
  return deps;
}

test(
  "combined and partial reimbursements preserve bank movements, statement matching, ownership and report totals",
  {
    skip: process.env.RUN_REIMBURSEMENTS_DB_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const rollback = new Error("ROLLBACK_REIMBURSEMENTS");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const deps = modules({ ...tx, $transaction: (action) => action(tx) }, Prisma);
            const api = deps["./reimbursement-server"];
            const tag = randomUUID();
            await tx.user.upsert({
              where: { id: 1 },
              update: {},
              create: { id: 1, email: "owner@invalid.test" },
            });
            const stranger = await tx.user.create({ data: { email: `${tag}@invalid.test` } });
            const account = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: tag,
                normalizedName: tag,
                type: "CHEQUING",
                currency: "CAD",
              },
            });
            const otherAccount = await tx.financialAccount.create({
              data: {
                userId: stranger.id,
                name: tag,
                normalizedName: tag,
                type: "CHEQUING",
                currency: "CAD",
              },
            });
            const ledger = async (type, amount, extra = {}) =>
              tx.financialTransaction.create({
                data: {
                  userId: 1,
                  accountId: account.id,
                  type,
                  amount,
                  currency: "CAD",
                  description: "Rent",
                  occurredOn: new Date("2026-11-01"),
                  ...extra,
                },
              });
            const expenses = await Promise.all([
              ledger("EXPENSE", "-1000"),
              ledger("EXPENSE", "-1000"),
              ledger("EXPENSE", "-1000"),
            ]);
            const payment = await ledger("REFUND", "2500", {
              description: "Dad — three months",
              occurredOn: new Date("2026-11-24"),
            });
            const anotherPayment = await ledger("REFUND", "500");
            const usd = await ledger("REFUND", "500", { currency: "USD" });
            const foreign = await ledger("EXPENSE", "-1000", {
              userId: stranger.id,
              accountId: otherAccount.id,
            });
            const dadContact = await tx.workContact.create({ data: { userId: 1, name: "Dad" } });
            const plan = (id, amount = "1000", expectedUpdatedAt = null) =>
              api.saveReimbursementPlan(id, {
                contactId: dadContact.id,
                amount,
                expectedUpdatedAt,
              });
            await assert.rejects(plan(foreign.id), /not found/);
            await assert.rejects(plan(payment.id), /Only expenses/);
            await assert.rejects(plan(expenses[0].id, "1000.01"), /exceed/);
            for (const expense of expenses) await plan(expense.id);
            const allocate = (paymentId, expenseId, amount, expectedUpdatedAt = null) =>
              api.saveReimbursementAllocation(paymentId, { expenseId, amount, expectedUpdatedAt });
            await assert.rejects(allocate(usd.id, expenses[0].id, "100"), /same currency/);
            await assert.rejects(allocate(payment.id, foreign.id, "100"), /not found/);
            await allocate(payment.id, expenses[0].id, "1000");
            await allocate(payment.id, expenses[1].id, "1000");
            await allocate(payment.id, expenses[2].id, "500");
            await assert.rejects(
              allocate(
                payment.id,
                expenses[2].id,
                "501",
                (await api.getReimbursements(payment.id)).links[2].updatedAt,
              ),
              /payment amount/,
            );
            await assert.rejects(allocate(anotherPayment.id, expenses[0].id, "1"), /remaining/);
            let detail = await api.getReimbursements(expenses[2].id);
            assert.equal(detail.summary.status, "PARTIAL");
            assert.equal(detail.summary.remaining, "500.0000");
            assert.equal(detail.summary.personalCost, "500.0000");
            await assert.rejects(
              plan(expenses[2].id, "400", detail.planUpdatedAt),
              /already received/,
            );
            await assert.rejects(plan(expenses[2].id, "1000"), /changed/);
            await assert.rejects(
              api.saveReimbursementPlan(expenses[2].id, {
                remove: true,
                expectedUpdatedAt: detail.planUpdatedAt,
              }),
              /Unlink/,
            );
            const candidate = await api.getReimbursements(anotherPayment.id, "Dad");
            assert.deepEqual(
              candidate.candidates.map((item) => item.id),
              [expenses[2].id],
            );
            await allocate(anotherPayment.id, expenses[2].id, "500");
            detail = await api.getReimbursements(expenses[2].id);
            assert.equal(detail.summary.status, "COMPLETE");
            assert.equal(detail.summary.remaining, "0.0000");
            assert.equal(detail.links.length, 2);
            await assert.rejects(
              api.removeReimbursementAllocation(
                payment.id,
                detail.links[1].id,
                detail.links[1].updatedAt,
              ),
              /not found/,
            );
            await assert.rejects(
              api.removeReimbursementAllocation(expenses[2].id, detail.links[1].id, null),
              /changed/,
            );

            const transactionServer = deps["./transaction-server"];
            const serial = await transactionServer.getTransaction(expenses[2].id);
            assert.equal(serial.reimbursement.status, "COMPLETE");
            const category = await tx.financeCategory.create({
              data: { userId: 1, name: tag, normalizedName: tag, type: "EXPENSE" },
            });
            const input = deps["./transactions"].transactionInput(
              {
                type: "EXPENSE",
                amount: "900",
                date: "2026-11-01",
                description: "Changed",
                currency: "CAD",
                accountId: account.id,
                categoryId: category.id,
                expectedUpdatedAt: serial.updatedAt,
              },
              true,
            );
            await assert.rejects(
              transactionServer.saveTransactionInDb(tx, input, expenses[2].id),
              /Remove reimbursement/,
            );
            const paySerial = await transactionServer.getTransaction(payment.id);
            assert.equal(paySerial.amount, "2500.0000");
            assert.equal(paySerial.reimbursementAllocated, "2500.0000");
            // One bank row still points to the entire payment, irrespective of allocations.
            const batch = await tx.financialImport.create({
              data: {
                userId: 1,
                accountId: account.id,
                status: "COMPLETED",
                fingerprint: randomUUID(),
                matchingOnly: true,
                originalName: "rent-statement.csv",
              },
            });
            await tx.financialImportEntry.create({
              data: {
                importId: batch.id,
                rowKey: "rent-payment",
                action: "MATCH",
                transactionId: payment.id,
                originalData: { date: "2026-11-24", description: "Dad", amount: "2500.00" },
              },
            });
            const matched = await transactionServer.getTransaction(payment.id);
            assert.equal(matched.statementMatches[0].id, batch.id);
            assert.equal(matched.amount, "2500.0000");
            assert.equal((await api.getReimbursements(payment.id)).available, "0.0000");
            await assert.rejects(
              transactionServer.deleteTransaction(expenses[2].id),
              /Unlink reimbursements/,
            );
            const countBefore = await tx.financialTransaction.count({
              where: {
                userId: 1,
                id: { in: [...expenses.map((e) => e.id), payment.id, anotherPayment.id] },
              },
            });
            assert.equal(countBefore, 5, "allocations create no financial movements");
            const report = deps["./reporting"];
            const snapshots = [...expenses, payment, anotherPayment].map((row) => ({
              id: row.id,
              accountId: row.accountId,
              categoryId: null,
              date: row.occurredOn.toISOString().slice(0, 10),
              amount: row.amount.toFixed(4),
              excludedAmount: "0.0000",
              currency: row.currency,
              type: row.type,
              source: "MANUAL",
              description: row.description,
              counterparty: null,
              statementBacked: false,
            }));
            const totals = report.buildReport(
              {
                accounts: [{ ...account }],
                categories: [],
                sources: [],
                transactions: snapshots,
                receipts: [],
                income: [],
                matches: [],
                examples: { accountIds: [], receiptIds: [], incomeIds: [] },
              },
              report.reportFilters(new URLSearchParams({ month: "2026-11" }), "2026-11-24"),
            ).totals;
            assert.equal(totals.purchases, "3000.0000");
            assert.equal(totals.refunds, "3000.0000");
            assert.equal(totals.expenses, "0.0000");
            assert.equal(totals.income, "0.0000");
            const originalLink = (await api.getReimbursements(payment.id)).links.find(
              (link) => link.expenseId === expenses[2].id,
            );
            await allocate(payment.id, expenses[2].id, "400", originalLink.updatedAt);
            assert.equal((await api.getReimbursements(payment.id)).available, "100.0000");
            assert.equal(
              (await api.getReimbursements(expenses[2].id)).summary.remaining,
              "100.0000",
            );
            await api.removeReimbursementAllocation(
              expenses[2].id,
              detail.links[1].id,
              detail.links[1].updatedAt,
            );
            assert.equal((await api.getReimbursements(expenses[2].id)).summary.status, "PARTIAL");
            assert.equal(
              (
                await tx.financialTransaction.findUniqueOrThrow({
                  where: { id: anotherPayment.id },
                })
              ).amount.toFixed(4),
              "500.0000",
            );
            throw rollback;
          },
          { timeout: 20000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      await db.$disconnect();
    }
  },
);

test(
  "concurrent reimbursements cannot overpay the same expense",
  {
    skip: process.env.RUN_REIMBURSEMENTS_DB_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    let accountId;
    let contactId;
    const ids = [];
    try {
      const tag = randomUUID();
      await db.user.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, email: "owner@invalid.test" },
      });
      const account = await db.financialAccount.create({
        data: { userId: 1, name: tag, normalizedName: tag, type: "CASH", currency: "CAD" },
      });
      accountId = account.id;
      for (const [type, amount] of [
        ["EXPENSE", "-500"],
        ["REFUND", "500"],
        ["REFUND", "500"],
      ]) {
        const row = await db.financialTransaction.create({
          data: {
            userId: 1,
            accountId,
            description: tag,
            occurredOn: new Date("2026-11-24"),
            type,
            amount,
            currency: "CAD",
          },
        });
        ids.push(row.id);
      }
      contactId = (await db.workContact.create({ data: { userId: 1, name: "Dad" } })).id;
      const api = modules(db, Prisma)["./reimbursement-server"];
      await api.saveReimbursementPlan(ids[0], {
        contactId,
        amount: "500",
        expectedUpdatedAt: null,
      });
      const results = await Promise.allSettled(
        ids.slice(1).map((paymentId) =>
          api.saveReimbursementAllocation(paymentId, {
            expenseId: ids[0],
            amount: "500",
            expectedUpdatedAt: null,
          }),
        ),
      );
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const failed = results.find((result) => result.status === "rejected");
      assert.match(failed.reason.message, /remaining reimbursement/);
      const detail = await api.getReimbursements(ids[0]);
      assert.equal(detail.summary.received, "500.0000");
      assert.equal(detail.summary.remaining, "0.0000");
    } finally {
      await db.financialReimbursement.deleteMany({ where: { expenseId: { in: ids } } });
      await db.financialReimbursementPlan.deleteMany({ where: { expenseId: { in: ids } } });
      await db.financialTransaction.deleteMany({ where: { id: { in: ids } } });
      if (contactId) await db.workContact.delete({ where: { id: contactId } });
      if (accountId) await db.financialAccount.delete({ where: { id: accountId } });
      await db.$disconnect();
    }
  },
);

test(
  "an expense tracks independent expected and received amounts for several people",
  {
    skip: process.env.RUN_REIMBURSEMENTS_DB_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const rollback = new Error("ROLLBACK_PEOPLE");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const api = modules({ ...tx, $transaction: (action) => action(tx) }, Prisma)[
              "./reimbursement-server"
            ];
            const tag = randomUUID();
            const account = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: tag,
                normalizedName: tag,
                type: "CHEQUING",
                currency: "CAD",
              },
            });
            const ledger = (type, amount) =>
              tx.financialTransaction.create({
                data: {
                  userId: 1,
                  accountId: account.id,
                  description: tag,
                  occurredOn: new Date("2026-11-25"),
                  type,
                  amount,
                  currency: "CAD",
                },
              });
            const contacts = {};
            for (const name of ["Dad", "Mom", "Friend"])
              contacts[name] = await tx.workContact.create({ data: { userId: 1, name } });
            const foreignUser = await tx.user.create({ data: { email: `${tag}@invalid.test` } });
            const foreignContact = await tx.workContact.create({
              data: { userId: foreignUser.id, name: "Private person" },
            });
            const expense = await ledger("EXPENSE", "-1000");
            await assert.rejects(
              api.saveReimbursementPlan(expense.id, {
                contactId: foreignContact.id,
                amount: "100",
                expectedUpdatedAt: null,
              }),
              /active person/,
            );
            const task = await tx.todo.create({
              data: { userId: 1, title: "Shared person test", requesterId: contacts.Dad.id },
            });
            assert.equal(task.requesterId, contacts.Dad.id);
            const dadPayment = await ledger("REFUND", "400");
            const momPayment = await ledger("REFUND", "300");
            await api.saveReimbursementPlan(expense.id, {
              contactId: contacts.Dad.id,
              amount: "400",
              expectedUpdatedAt: null,
            });
            await api.saveReimbursementPlan(expense.id, {
              contactId: contacts.Mom.id,
              amount: "300",
              expectedUpdatedAt: null,
            });
            await assert.rejects(
              api.saveReimbursementPlan(expense.id, {
                contactId: contacts.Friend.id,
                amount: "301",
                expectedUpdatedAt: null,
              }),
              /cannot exceed/,
            );
            let details = await api.getReimbursements(expense.id);
            const dad = details.plans.find((plan) => plan.person === "Dad");
            const mom = details.plans.find((plan) => plan.person === "Mom");
            assert.equal(details.summary.expected, "700.0000");
            await assert.rejects(
              api.saveReimbursementAllocation(dadPayment.id, {
                expenseId: expense.id,
                amount: "400",
                expectedUpdatedAt: null,
              }),
              /which person's/,
            );
            await api.saveReimbursementAllocation(dadPayment.id, {
              expenseId: expense.id,
              planId: dad.id,
              amount: "400",
              expectedUpdatedAt: null,
            });
            await api.saveReimbursementAllocation(momPayment.id, {
              expenseId: expense.id,
              planId: mom.id,
              amount: "200",
              expectedUpdatedAt: null,
            });
            details = await api.getReimbursements(expense.id);
            assert.equal(details.plans.find((plan) => plan.id === dad.id).status, "COMPLETE");
            assert.equal(details.plans.find((plan) => plan.id === mom.id).remaining, "100.0000");
            assert.equal(details.summary.received, "600.0000");
            assert.equal(details.summary.remaining, "100.0000");
            assert.equal(details.summary.personalCost, "400.0000");
            const link = details.links.find((link) => link.planId === mom.id);
            await assert.rejects(
              api.saveReimbursementAllocation(momPayment.id, {
                expenseId: expense.id,
                planId: mom.id,
                amount: "301",
                expectedUpdatedAt: link.updatedAt,
              }),
              /payment amount|remaining reimbursement/,
            );
            await assert.rejects(
              api.saveReimbursementPlan(expense.id, {
                planId: mom.id,
                contactId: contacts.Dad.id,
                amount: "300",
                expectedUpdatedAt: mom.updatedAt,
              }),
              /already has/,
            );
            await assert.rejects(
              api.saveReimbursementPlan(expense.id, {
                planId: mom.id,
                remove: true,
                expectedUpdatedAt: mom.updatedAt,
              }),
              /Unlink/,
            );
            await api.removeReimbursementAllocation(expense.id, link.id, link.updatedAt);
            await api.saveReimbursementPlan(expense.id, {
              planId: mom.id,
              remove: true,
              expectedUpdatedAt: mom.updatedAt,
            });
            details = await api.getReimbursements(expense.id);
            assert.equal(details.plans.length, 1);
            assert.equal(details.summary.person, "Dad");
            assert.equal(details.summary.received, "400.0000");
            await tx.workContact.update({
              where: { id: contacts.Dad.id },
              data: { name: "Renamed dad", active: false },
            });
            const currentPlan = details.plans[0];
            await api.saveReimbursementPlan(expense.id, {
              planId: currentPlan.id,
              contactId: contacts.Dad.id,
              amount: "500",
              expectedUpdatedAt: currentPlan.updatedAt,
            });
            assert.equal(
              (await api.getReimbursements(expense.id)).plans[0].person,
              "Dad",
              "historical name remains a snapshot",
            );
            const anotherExpense = await ledger("EXPENSE", "-1000");
            await assert.rejects(
              api.saveReimbursementPlan(anotherExpense.id, {
                contactId: contacts.Dad.id,
                amount: "100",
                expectedUpdatedAt: null,
              }),
              /active person/,
            );
            assert.equal(
              (await tx.todo.findUniqueOrThrow({ where: { id: task.id } })).requesterId,
              contacts.Dad.id,
            );

            assert.equal(
              (
                await tx.financialTransaction.findUniqueOrThrow({ where: { id: dadPayment.id } })
              ).amount.toFixed(4),
              "400.0000",
            );
            throw rollback;
          },
          { timeout: 20000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      await db.$disconnect();
    }
  },
);

test(
  "multiple-person migration preserves the person and amount on existing links",
  {
    skip: process.env.RUN_REIMBURSEMENTS_DB_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const rollback = new Error("ROLLBACK_MIGRATION");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const schema = `reimbursement_${randomUUID().replaceAll("-", "")}`;
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            await tx.$executeRawUnsafe(
              'CREATE TABLE "FinancialReimbursementPlan" ("expenseId" INTEGER PRIMARY KEY, "userId" INTEGER NOT NULL, person TEXT, "expectedAmount" DECIMAL(19,4), "updatedAt" TIMESTAMPTZ(3))',
            );
            await tx.$executeRawUnsafe(
              'CREATE TABLE "FinancialReimbursement" (id SERIAL PRIMARY KEY, "expenseId" INTEGER, "paymentId" INTEGER, amount DECIMAL(19,4))',
            );
            await tx.$executeRawUnsafe(
              'CREATE UNIQUE INDEX "FinancialReimbursement_expenseId_paymentId_key" ON "FinancialReimbursement"("expenseId", "paymentId")',
            );
            await tx.$executeRawUnsafe(
              "INSERT INTO \"FinancialReimbursementPlan\" VALUES (17, 1, 'Dad', 1000, CURRENT_TIMESTAMP)",
            );
            await tx.$executeRawUnsafe(
              'INSERT INTO "FinancialReimbursement" ("expenseId", "paymentId", amount) VALUES (17, 25, 500)',
            );
            const sql = readFileSync(
              "prisma/migrations/20261125100000_multiple_reimbursement_people/migration.sql",
              "utf8",
            ).replace(/^BEGIN;|^COMMIT;/gm, "");
            for (const statement of sql
              .split(";")
              .map((text) => text.trim())
              .filter(Boolean))
              await tx.$executeRawUnsafe(statement);
            const rows = await tx.$queryRawUnsafe(
              'SELECT p.person, p."expectedAmount"::text AS expected, r.amount::text AS amount, r."expenseId", r."paymentId", r."planId" FROM "FinancialReimbursement" r JOIN "FinancialReimbursementPlan" p ON p.id = r."planId"',
            );
            assert.equal(rows.length, 1);
            assert.equal(rows[0].person, "Dad");
            assert.equal(rows[0].expected, "1000.0000");
            assert.equal(rows[0].amount, "500.0000");
            assert.equal(rows[0].expenseId, 17);
            assert.equal(rows[0].paymentId, 25);
            assert.ok(rows[0].planId > 0);
            throw rollback;
          },
          { timeout: 20000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      await db.$disconnect();
    }
  },
);

test(
  "shared people migration reuses unique task contacts and preserves ambiguous reimbursement names",
  {
    skip: process.env.RUN_REIMBURSEMENTS_DB_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const rollback = new Error("ROLLBACK_SHARED_PEOPLE_MIGRATION");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const schema = `shared_people_${randomUUID().replaceAll("-", "")}`;
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            await tx.$executeRawUnsafe(
              'CREATE TABLE "WorkContact" (id SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, name VARCHAR(120), company VARCHAR(120), active BOOLEAN, revision INTEGER, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP)',
            );
            await tx.$executeRawUnsafe(
              'CREATE TABLE "FinancialReimbursementPlan" (id SERIAL PRIMARY KEY, "expenseId" INTEGER, "userId" INTEGER NOT NULL, person VARCHAR(100), "expectedAmount" DECIMAL(19,4))',
            );
            await tx.$executeRawUnsafe(
              'CREATE UNIQUE INDEX "FinancialReimbursementPlan_expenseId_person_key" ON "FinancialReimbursementPlan"("expenseId",person)',
            );
            await tx.$executeRawUnsafe(
              "INSERT INTO \"WorkContact\" (\"userId\",name) VALUES (1,'Dad'),(1,'Mom'),(1,'Mom'),(2,'Uncle')",
            );
            await tx.$executeRawUnsafe(
              "INSERT INTO \"FinancialReimbursementPlan\" (\"expenseId\",\"userId\",person,\"expectedAmount\") VALUES (17,1,'Dad',1000),(18,1,'Mom',500),(19,1,'Mom',300),(20,1,'Uncle',200)",
            );
            const sql = readFileSync(
              "prisma/migrations/20261125120000_shared_people/migration.sql",
              "utf8",
            ).replace(/^BEGIN;|^COMMIT;/gm, "");
            for (const statement of sql
              .split(";")
              .map((text) => text.trim())
              .filter(Boolean))
              await tx.$executeRawUnsafe(statement);
            const rows = await tx.$queryRawUnsafe(
              'SELECT p.person,p."contactId",p."expectedAmount"::text AS amount,c."userId",c.notes FROM "FinancialReimbursementPlan" p JOIN "WorkContact" c ON c.id=p."contactId" ORDER BY p."expenseId"',
            );
            assert.equal(rows[0].contactId, 1, "existing unique task contact is reused");
            assert.equal(rows[0].amount, "1000.0000");
            assert.equal(
              rows[1].contactId,
              rows[2].contactId,
              "same reimbursement person reused across expenses",
            );
            assert.ok(
              ![2, 3].includes(rows[1].contactId),
              "ambiguous task contacts are never guessed",
            );
            assert.equal(rows[3].userId, 1, "a different owner contact cannot be reused");
            assert.notEqual(rows[3].contactId, 4);
            assert.equal(rows[3].amount, "200.0000");
            assert.ok(rows[1].notes);
            throw rollback;
          },
          { timeout: 20000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      await db.$disconnect();
    }
  },
);
