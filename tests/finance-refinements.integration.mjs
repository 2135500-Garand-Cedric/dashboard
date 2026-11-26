import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { financeRefinements } from "./helpers/finance-refinements.mjs";

test(
  "balances, custom income types and split reimbursements preserve the ledger and ownership",
  {
    skip: process.env.RUN_FINANCE_REFINEMENTS_DB_TEST !== "1",
    timeout: 60000,
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient(),
      rollback = new Error("ROLLBACK_FINANCE_REFINEMENTS");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const modules = financeRefinements(
                { ...tx, $transaction: (action) => action(tx) },
                Prisma,
              ),
              tag = randomUUID();
            const balanceAPI = modules["./balance-server"],
              reimbursementAPI = modules["./reimbursement-server"],
              sourceAPI = modules["./income-settings-server"];
            await tx.user.upsert({
              where: { id: 1 },
              update: {},
              create: { id: 1, email: "owner@invalid.test" },
            });
            const foreign = await tx.user.create({ data: { email: `${tag}@invalid.test` } });
            const account = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: tag,
                normalizedName: tag,
                type: "CHEQUING",
                currency: "CAD",
              },
            });
            const cash = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: `${tag}cash`,
                normalizedName: `${tag}cash`,
                type: "CASH",
                currency: "CAD",
              },
            });
            const foreignAccount = await tx.financialAccount.create({
              data: {
                userId: foreign.id,
                name: tag,
                normalizedName: tag,
                type: "CASH",
                currency: "CAD",
              },
            });
            const date = modules["./reporting"].reportingToday();
            const categories = await Promise.all(
              ["Rent", "School"].map((name) =>
                tx.financeCategory.create({
                  data: {
                    userId: 1,
                    name: `${name}${tag}`,
                    normalizedName: `${name}${tag}`,
                    type: "EXPENSE",
                  },
                }),
              ),
            );
            const person = await tx.workContact.create({ data: { userId: 1, name: `Dad${tag}` } });
            const expense = async (category, description) =>
              tx.financialTransaction.create({
                data: {
                  userId: 1,
                  accountId: account.id,
                  type: "EXPENSE",
                  amount: "-1000",
                  categoryId: category.id,
                  currency: "CAD",
                  occurredOn: new Date(date),
                  description,
                },
              });
            const rent = await expense(categories[0], "Rent"),
              school = await expense(categories[1], "School");
            const payment = await tx.financialTransaction.create({
              data: {
                userId: 1,
                accountId: account.id,
                type: "REFUND",
                amount: "2000",
                currency: "CAD",
                occurredOn: new Date(date),
                description: "Combined Dad repayment",
              },
            });
            for (const record of [rent, school]) {
              await reimbursementAPI.saveReimbursementPlan(record.id, {
                contactId: person.id,
                amount: "1000",
                expectedUpdatedAt: null,
              });
              const detail = await reimbursementAPI.getReimbursements(record.id);
              await reimbursementAPI.saveReimbursementAllocation(payment.id, {
                expenseId: record.id,
                planId: detail.plans[0].id,
                amount: "1000",
                expectedUpdatedAt: null,
              });
            }
            const filters = modules["./reporting"].reportFilters(
              new URLSearchParams({
                mode: "month",
                month: date.slice(0, 7),
                account: String(account.id),
              }),
              date,
            );
            let report = await modules["./reporting-server"].financeReport(filters);
            assert.equal(report.totals.refunds, "2000.0000");
            assert.equal(report.totals.count, 3);
            assert.equal(report.spendingByCategory.length, 2);
            assert.ok(
              report.spendingByCategory.every(
                (row) => row.refunds === "1000.0000" && row.net === "0.0000",
              ),
            );
            assert.equal(report.overview.awaitingReimbursements.total, "0.0000");
            for (const [index, category] of categories.entries()) {
              const listing = await modules["./transaction-server"].listTransactions(
                new URLSearchParams({
                  activity: "expenses",
                  account: String(account.id),
                  category: String(category.id),
                }),
              );
              assert.deepEqual(
                new Set(listing.transactions.map((row) => row.id)),
                new Set([index === 0 ? rent.id : school.id, payment.id]),
              );
              assert.equal(
                listing.transactions.find((row) => row.id === payment.id).reimbursementCategories
                  .length,
                2,
              );
            }
            const links = await reimbursementAPI.getReimbursements(payment.id);
            assert.deepEqual(
              new Set(links.links.map((row) => row.category)),
              new Set(categories.map((row) => row.name)),
            );
            await reimbursementAPI.removeReimbursementAllocation(
              payment.id,
              links.links[1].id,
              links.links[1].updatedAt,
            );
            report = await modules["./reporting-server"].financeReport(filters);
            assert.equal(report.overview.awaitingReimbursements.total, "1000.0000");
            const count = await tx.financialTransaction.count();
            await balanceAPI.setAccountBalance(account.id, {
              date,
              amount: "500.25",
              expectedRevision: 0,
            });
            assert.equal(
              await tx.financialTransaction.count(),
              count,
              "balance correction is not a ledger transaction",
            );
            let balances = await balanceAPI.listBalances();
            assert.equal(balances.balances.find((row) => row.id === account.id).amount, "500.2500");
            assert.ok(!balances.balances.some((row) => row.id === foreignAccount.id));
            await assert.rejects(
              balanceAPI.setAccountBalance(foreignAccount.id, {
                date,
                amount: "1",
                expectedRevision: 0,
              }),
              /not found/,
            );
            await assert.rejects(
              balanceAPI.setAccountBalance(account.id, { date, amount: "1", expectedRevision: 0 }),
              /changed/,
            );
            const transfer = await tx.financialTransfer.create({ data: { userId: 1 } });
            await tx.financialTransaction.createMany({
              data: [
                {
                  userId: 1,
                  accountId: account.id,
                  type: "TRANSFER",
                  amount: "-25.10",
                  currency: "CAD",
                  occurredOn: new Date(date),
                  description: "Cash withdrawal",
                  transferId: transfer.id,
                },
                {
                  userId: 1,
                  accountId: cash.id,
                  type: "TRANSFER",
                  amount: "25.10",
                  currency: "CAD",
                  occurredOn: new Date(date),
                  description: "Cash withdrawal",
                  transferId: transfer.id,
                },
              ],
            });
            balances = await balanceAPI.listBalances();
            assert.equal(balances.balances.find((row) => row.id === account.id).amount, "475.1500");
            assert.equal(balances.balances.find((row) => row.id === cash.id).amount, "25.1000");
            assert.equal(
              (await modules["./reporting-server"].financeReport(filters)).totals.adjustments,
              "0.0000",
            );
            const type = await tx.financialIncomeSourceType.create({
              data: { userId: 1, name: `Pension${tag}`, normalizedName: `pension${tag}` },
            });
            const foreignType = await tx.financialIncomeSourceType.create({
              data: { userId: foreign.id, name: tag, normalizedName: tag },
            });
            const parser = modules["./income"].incomeConfigInput;
            let { source } = await sourceAPI.saveIncomeConfig(
              true,
              parser({ name: `Dad${tag}`, typeId: type.id }, true),
            );
            assert.equal(source.type.name, type.name);
            const deposit = await tx.financialTransaction.create({
              data: {
                userId: 1,
                accountId: account.id,
                type: "INCOME",
                amount: "100",
                currency: "CAD",
                occurredOn: new Date(date),
                description: "Income",
              },
            });
            await tx.financialIncomeRecord.create({
              data: {
                userId: 1,
                sourceId: source.id,
                accountId: account.id,
                transactionId: deposit.id,
                paidOn: new Date(date),
                netAmount: "100",
                currency: "CAD",
                description: "Income",
              },
            });
            const secondType = await tx.financialIncomeSourceType.create({
              data: { userId: 1, name: `Other${tag}`, normalizedName: `other${tag}` },
            });
            ({ source } = await sourceAPI.saveIncomeConfig(
              true,
              parser({ typeId: secondType.id }, true, true),
              source.id,
            ));
            assert.equal(
              source.type.name,
              secondType.name,
              "used source can change classification without rewriting its deposits",
            );
            await tx.financialIncomeSourceType.update({
              where: { id: secondType.id },
              data: { name: "Updated type" },
            });
            assert.equal(
              (await sourceAPI.getIncomeConfig(true, source.id)).source.type.name,
              "Updated type",
            );
            await assert.rejects(
              sourceAPI.saveIncomeConfig(
                true,
                parser({ typeId: foreignType.id }, true, true),
                source.id,
              ),
              /belonging to you/,
            );
            await tx.financialIncomeSourceType.update({
              where: { id: type.id },
              data: { active: false },
            });
            await assert.rejects(
              sourceAPI.saveIncomeConfig(true, parser({ typeId: type.id }, true, true), source.id),
              /active/,
            );
            assert.equal(
              (
                await tx.financialTransaction.findUnique({ where: { id: deposit.id } })
              ).amount.toFixed(4),
              "100.0000",
            );
            assert.equal(
              (await balanceAPI.listBalances()).balances.find((row) => row.id === account.id)
                .amount,
              "575.1500",
            );
            throw rollback;
          },
          { timeout: 60000 },
        ),
        (error) => error === rollback,
      );
    } finally {
      await db.$disconnect();
    }
  },
);
