import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFinanceServices } from "../scripts/helpers/finance-services.mjs";

test(
  "fixed statements require explicit same-account signed matches, preserve money and safely retry",
  {
    skip: process.env.RUN_FINANCE_FIXED_STATEMENT_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient(),
      root = await mkdtemp(join(tmpdir(), "fixed-statement-"));
    const previous = process.env.FINANCE_UPLOAD_DIR;
    process.env.FINANCE_UPLOAD_DIR = root;
    const rollback = new Error("ROLLBACK_FIXED_STATEMENT");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            let serial = 0;
            const services = loadFinanceServices({
              ...tx,
              $transaction: async (callback) => {
                const name = `fixed_${++serial}`;
                await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
                try {
                  const result = await callback(tx);
                  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
                  return result;
                } catch (error) {
                  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
                  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
                  throw error;
                }
              },
            });
            const account = (currency = "CAD") =>
              tx.financialAccount.create({
                data: {
                  userId: 1,
                  name: randomUUID(),
                  normalizedName: randomUUID(),
                  type: "CHEQUING",
                  currency,
                },
              });
            const bank = await account(),
              other = await account(),
              usd = await account("USD");
            const movement = (accountId, type, amount, currency = "CAD") =>
              tx.financialTransaction.create({
                data: {
                  userId: 1,
                  accountId,
                  type,
                  amount,
                  currency,
                  occurredOn: new Date("2026-10-01"),
                  description: randomUUID(),
                  source: "MANUAL",
                },
              });
            const expense = await movement(bank.id, "EXPENSE", "-12.3456");
            const identical = await movement(bank.id, "EXPENSE", "-12.3456");
            const income = await movement(bank.id, "INCOME", "100");
            const refund = await movement(bank.id, "REFUND", "5");
            const makeTransfer = async (from, to, amount) =>
              (
                await services.transactions.saveTransaction(
                  services.transactionInput({
                    type: "TRANSFER",
                    date: "2026-10-01",
                    description: randomUUID(),
                    accountId: from,
                    destinationAccountId: to,
                    amount,
                    currency: "CAD",
                    requestKey: randomUUID(),
                  }),
                )
              ).transaction;
            const transfer = await makeTransfer(bank.id, other.id, "20");
            const inbound = {
              id: (await makeTransfer(other.id, bank.id, "30")).transfer.transactionId,
            };
            const wrongAccount = await movement(other.id, "EXPENSE", "-12.3456");
            await movement(usd.id, "EXPENSE", "-12.3456", "USD");
            await movement(bank.id, "ADJUSTMENT", "-12.3456");
            const source = await tx.financialIncomeSource.create({
              data: {
                userId: 1,
                name: randomUUID(),
                normalizedName: randomUUID(),
                kind: "EMPLOYMENT",
              },
            });
            const category = await tx.financeCategory.create({
              data: {
                userId: 1,
                name: randomUUID(),
                normalizedName: randomUUID(),
                type: "EXPENSE",
              },
            });
            const incomeRecord = await tx.financialIncomeRecord.create({
              data: {
                userId: 1,
                sourceId: source.id,
                accountId: bank.id,
                transactionId: income.id,
                paidOn: new Date("2026-11-06"),
                description: "Pay",
                netAmount: "100",
                currency: "CAD",
              },
            });
            const receipt = await tx.financialReceipt.create({
              data: {
                userId: 1,
                accountId: bank.id,
                categoryId: category.id,
                transactionId: expense.id,
                purchasedOn: new Date("2026-11-06"),
                merchant: "Purchase",
                subtotal: "12.3456",
                total: "12.3456",
                currency: "CAD",
              },
            });
            const text =
              "date,ref #,description,amount\n2026-11-06,0001,Purchase,-12.3456\n2026-11-06,0002,Pay,100\n2026-11-06,0003,Transfer out,-20\n2026-11-06,0004,Transfer in,30\n";
            const buffer = Buffer.from(text),
              parsed = services.csv.parseStatement(buffer, {
                delimiter: "AUTO",
                encoding: "AUTO",
                headerRow: 1,
              });
            const period = services.fixed.fixedStatementPeriod(
              { periodStart: "2026-11-01", periodEnd: "2026-11-30" },
              parsed,
            );
            const file = {
              buffer,
              originalName: "fixed.csv",
              mimeType: "text/csv",
              extension: "csv",
              contentHash: createHash("sha256").update(buffer).digest("hex"),
            };
            const count = await tx.financialTransaction.count();
            let { batch } = await services.statements.createStatement(
              bank.id,
              parsed,
              file,
              period,
            );
            assert.equal(batch.periodStart, period.periodStart);
            assert.equal(batch.matchingOnly, true);
            assert.ok(
              batch.rows.every((row) => row.action === "MATCH" && row.review.matchId === null),
            );
            assert.deepEqual(
              new Set(batch.rows[0].candidates.map((row) => row.id)),
              new Set([expense.id, identical.id]),
            );
            assert.deepEqual(
              batch.rows[1].candidates.map((row) => row.id),
              [income.id],
            );
            await assert.rejects(
              services.statements.commitStatement(batch.id, { expectedRevision: batch.revision }),
              /match|select/i,
            );
            const patch = (row, review = row.review, action = "MATCH") => ({
              expectedRevision: batch.revision,
              rows: [{ id: row.id, action, review }],
            });
            await assert.rejects(
              services.statements.updateStatement(
                batch.id,
                patch(batch.rows[0], batch.rows[0].review, "CREATE"),
              ),
              /matched/i,
            );
            await assert.rejects(
              services.statements.updateStatement(
                batch.id,
                patch(batch.rows[0], batch.rows[0].review, "SKIP"),
              ),
              /matched/i,
            );
            await assert.rejects(
              services.statements.updateStatement(
                batch.id,
                patch(batch.rows[0], { ...batch.rows[0].review, amount: "-11.0000" }),
              ),
              /cannot be changed/i,
            );
            await assert.rejects(
              services.statements.updateStatement(
                batch.id,
                patch(batch.rows[0], { ...batch.rows[0].review, matchId: wrongAccount.id }),
              ),
              /same signed amount/i,
            );
            assert.equal(
              (await services.transactions.getTransaction(expense.id)).statementMatches.length,
              0,
            );
            batch = await services.statements.updateStatement(
              batch.id,
              patch(batch.rows[0], { ...batch.rows[0].review, matchId: expense.id }),
            );
            assert.equal(batch.status, "COMPLETED");
            assert.equal(batch.rows.filter((row) => row.transactionId).length, 1);
            assert.equal(batch.rows.filter((row) => !row.transactionId).length, 3);
            assert.equal(
              (await services.transactions.getTransaction(expense.id)).statementMatches[0].id,
              batch.id,
            );
            const summary = (
              await services.statements.listStatements(
                new URLSearchParams({ account: String(bank.id) }),
              )
            ).batches.find((row) => row.id === batch.id);
            assert.equal(summary.matchedCount, 1);
            assert.equal(summary.remainingCount, 3);
            const version = batch.revision;
            await assert.rejects(
              services.statements.updateStatement(batch.id, {
                ...patch(batch.rows[1]),
                expectedRevision: version - 1,
              }),
              /changed|reload/i,
            );
            // Correcting and unlinking a statement row updates badges, never money.
            batch = await services.statements.updateStatement(
              batch.id,
              patch(batch.rows[0], { ...batch.rows[0].review, matchId: identical.id }),
            );
            assert.equal(
              (await services.transactions.getTransaction(expense.id)).statementMatches.length,
              0,
            );
            assert.equal(
              (await services.transactions.getTransaction(identical.id)).statementMatches[0].id,
              batch.id,
            );
            batch = await services.statements.updateStatement(
              batch.id,
              patch(batch.rows[0], { ...batch.rows[0].review, matchId: null }),
            );
            assert.equal(batch.status, "COMPLETED");
            assert.equal(batch.rows.filter((row) => row.transactionId).length, 0);
            assert.equal(
              (await services.transactions.getTransaction(identical.id)).statementMatches.length,
              0,
            );
            const ids = [expense.id, income.id, transfer.id, inbound.id];
            batch = await services.statements.updateStatement(batch.id, {
              expectedRevision: batch.revision,
              rows: batch.rows.map((row, index) => ({
                id: row.id,
                action: "MATCH",
                review: {
                  ...row.review,
                  matchId: ids[index],
                  type: index > 1 ? "TRANSFER" : row.review.type,
                },
              })),
            });
            assert.ok(
              batch.rows.every((row) => row.errors.length === 0),
              JSON.stringify(batch.rows.map((row) => row.errors)),
            );
            assert.equal(
              (await services.transactions.getTransaction(expense.id)).statementMatches.length,
              1,
            );
            const result = await services.statements.commitStatement(batch.id, {
              expectedRevision: batch.revision,
            });
            assert.equal(result.batch.status, "COMPLETED");
            assert.equal(
              (await services.transactions.getTransaction(expense.id)).statementMatches[0].id,
              batch.id,
            );
            assert.equal(
              (
                await services.statements.commitStatement(batch.id, {
                  expectedRevision: batch.revision,
                })
              ).replayed,
              true,
            );
            assert.equal(
              (await services.statements.createStatement(bank.id, parsed, file, period)).reused,
              true,
            );
            await assert.rejects(
              services.statements.createStatement(bank.id, parsed, file, {
                ...period,
                periodEnd: "2026-12-01",
              }),
              /different statement period/i,
            );
            await assert.rejects(
              services.receipts.saveReceipt(
                services.receiptInput(
                  {
                    merchant: "Changed merchant",
                    date: "2026-11-06",
                    accountId: bank.id,
                    categoryId: category.id,
                    currency: "CAD",
                    subtotal: "12.3456",
                    total: "12.3456",
                    tax: "0",
                    tip: "0",
                    transactionAction: "LINK",
                    transactionId: expense.id,
                    expectedUpdatedAt: receipt.updatedAt.toISOString(),
                  },
                  true,
                ),
                null,
                receipt.id,
              ),
              /Only its notes/i,
            );
            await assert.rejects(
              services.income.saveIncome(
                services.incomeInput(
                  {
                    sourceId: source.id,
                    date: "2026-11-06",
                    description: "Changed pay",
                    accountId: bank.id,
                    currency: "CAD",
                    netAmount: "100",
                    grossAmount: null,
                    deductions: [],
                    transactionAction: "LINK",
                    transactionId: income.id,
                    expectedUpdatedAt: incomeRecord.updatedAt.toISOString(),
                  },
                  true,
                ),
                null,
                incomeRecord.id,
              ),
              /Only its notes/i,
            );
            await assert.rejects(
              services.receipts.deleteReceipt(receipt.id, true, receipt.updatedAt.toISOString()),
              /Only its notes/i,
            );
            await assert.rejects(
              services.income.deleteIncome(
                incomeRecord.id,
                false,
                incomeRecord.updatedAt.toISOString(),
              ),
              /Only its notes/i,
            );
            const currentIncome = await services.transactions.getTransaction(income.id);
            await assert.rejects(
              services.activities.saveActivityNotes(
                income.id,
                { notes: "Safe", amount: "999" },
                currentIncome.updatedAt,
              ),
              /only the notes/i,
            );
            await services.activities.saveActivityNotes(
              income.id,
              { notes: "Updated after statement matching" },
              currentIncome.updatedAt,
            );
            assert.equal(
              (await services.transactions.getTransaction(income.id)).notes,
              "Updated after statement matching",
            );
            assert.equal(
              (await tx.financialIncomeRecord.findUnique({ where: { id: incomeRecord.id } })).notes,
              "Updated after statement matching",
            );
            assert.equal(
              (
                await tx.financialTransaction.findUnique({ where: { id: income.id } })
              ).amount.toFixed(4),
              "100.0000",
            );
            await assert.rejects(
              services.activities.saveActivityNotes(
                income.id,
                { notes: "stale" },
                currentIncome.updatedAt,
              ),
              /changed/i,
            );
            const currentExpense = await services.transactions.getTransaction(expense.id);
            await services.activities.saveActivityNotes(
              expense.id,
              { notes: "Expense note" },
              currentExpense.updatedAt,
            );
            assert.equal(
              (await tx.financialReceipt.findUnique({ where: { id: receipt.id } })).notes,
              "Expense note",
            );
            assert.equal(await tx.financialTransaction.count(), count);
            assert.equal(
              await tx.financialMatch.count({
                where: {
                  importEntryId: { in: batch.rows.map((row) => row.id) },
                  status: "CONFIRMED",
                },
              }),
              4,
            );
            const refundBytes = Buffer.from(
              "date,ref #,description,amount\n2026-11-06,refund-1,Returned item,5\n",
            );
            const refundParsed = services.csv.parseStatement(refundBytes, {
              delimiter: "AUTO",
              encoding: "AUTO",
              headerRow: 1,
            });
            let refundBatch = (
              await services.statements.createStatement(
                bank.id,
                refundParsed,
                {
                  ...file,
                  buffer: refundBytes,
                  contentHash: createHash("sha256").update(refundBytes).digest("hex"),
                },
                period,
              )
            ).batch;
            refundBatch = await services.statements.updateStatement(refundBatch.id, {
              expectedRevision: refundBatch.revision,
              rows: [
                {
                  id: refundBatch.rows[0].id,
                  action: "MATCH",
                  review: { ...refundBatch.rows[0].review, type: "REFUND", matchId: refund.id },
                },
              ],
            });
            assert.equal(refundBatch.status, "COMPLETED");
            const matchedRefund = await services.transactions.getTransaction(refund.id);
            assert.equal(matchedRefund.editable, false);
            await assert.rejects(
              services.transactions.saveTransaction(
                services.transactionInput(
                  {
                    accountId: bank.id,
                    categoryId: category.id,
                    type: "REFUND",
                    amount: "5",
                    currency: "CAD",
                    date: "2026-11-06",
                    description: "Changed refund",
                    expectedUpdatedAt: matchedRefund.updatedAt,
                  },
                  true,
                ),
                refund.id,
              ),
              /import|linked|reconciliation/i,
            );
            await services.activities.saveActivityNotes(
              refund.id,
              { notes: "Refund note" },
              matchedRefund.updatedAt,
            );
            assert.equal(
              (await services.transactions.getTransaction(refund.id)).notes,
              "Refund note",
            );
            // Identical purchases must remain individually selectable, but one record cannot cover two rows.
            const duplicateText =
              "date,ref #,description,amount\n2026-11-07,x1,Same price,-12.3456\n2026-11-08,x2,Same price again,-12.3456\n";
            const duplicateBytes = Buffer.from(duplicateText),
              duplicateParsed = services.csv.parseStatement(duplicateBytes, {
                delimiter: "AUTO",
                encoding: "AUTO",
                headerRow: 1,
              });
            const duplicate = (
              await services.statements.createStatement(
                bank.id,
                duplicateParsed,
                {
                  ...file,
                  buffer: duplicateBytes,
                  contentHash: createHash("sha256").update(duplicateBytes).digest("hex"),
                },
                period,
              )
            ).batch;
            await assert.rejects(
              services.statements.updateStatement(duplicate.id, {
                expectedRevision: duplicate.revision,
                rows: duplicate.rows.map((row) => ({
                  id: row.id,
                  action: "MATCH",
                  review: { ...row.review, matchId: identical.id },
                })),
              }),
              /same financial record/i,
            );
            assert.equal((await services.statements.getStatement(duplicate.id)).status, "DRAFT");
            assert.equal(await tx.financialTransaction.count(), count);
            throw rollback;
          },
          { timeout: 120000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      if (previous === undefined) delete process.env.FINANCE_UPLOAD_DIR;
      else process.env.FINANCE_UPLOAD_DIR = previous;
      await db.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  },
);
