import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { timeZoneTestDependency } from "./helpers/time-zone.mjs";
const require = createRequire(import.meta.url);
function load(name, deps) {
  const out = {};
  const code = ts.transpileModule(readFileSync(`src/lib/finance/${name}.ts`, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("exports", "require", code)(
    out,
    (key) => deps[key] ?? timeZoneTestDependency(key) ?? require(key),
  );
  return out;
}
test(
  "unified activities retain movement IDs, update money atomically, preserve import matches and delete one complete record",
  { skip: process.env.RUN_FINANCE_ACTIVITY_DB_TEST !== "1" },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js"),
      db = new PrismaClient();
    const root = await mkdtemp(join(tmpdir(), "finance-activities-")),
      oldRoot = process.env.FINANCE_UPLOAD_DIR;
    process.env.FINANCE_UPLOAD_DIR = root;
    const rollback = new Error("ROLLBACK_ACTIVITIES");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const deps = {
              "@/generated/prisma": { Prisma },
              "@/lib/prisma": { prisma: { ...tx, $transaction: (callback) => callback(tx) } },
              "next/server": require("next/server"),
            };
            for (const name of [
              "validation",
              "transactions",
              "receipts",
              "income",
              "server",
              "receipt-files",
              "reconciliation-ledger",
              "transaction-server",
              "activity-movement",
              "receipt-server",
              "income-server",
              "activity-server",
              "expenses",
              "statement-csv",
              "statement-imports",
              "fixed-statement",
              "statement-server",
            ])
              deps[`./${name}`] = load(name, deps);
            const tag = `Activity ${randomUUID()}`;
            const account = async (type, currency = "CAD") =>
              tx.financialAccount.create({
                data: {
                  userId: 1,
                  name: `${tag} ${type} ${currency}`,
                  normalizedName: randomUUID(),
                  type,
                  currency,
                },
              });
            const bank = await account("CHEQUING"),
              savings = await account("SAVINGS"),
              card = await account("CREDIT_CARD");
            const category = await tx.financeCategory.create({
              data: { userId: 1, name: tag, normalizedName: randomUUID(), type: "EXPENSE" },
            });
            const source = await tx.financialIncomeSource.create({
              data: { userId: 1, name: tag, normalizedName: randomUUID(), kind: "GIFT" },
            });
            const expenseBody = {
              merchant: tag,
              accountId: bank.id,
              categoryId: category.id,
              date: "2026-11-06",
              currency: "CAD",
              subtotal: "40",
              tax: "0",
              tip: "0",
              total: "40",
              transactionAction: "CREATE",
              requestKey: randomUUID(),
              syncMovement: true,
            };
            const expense = await deps["./receipt-server"].saveReceipt(
              deps["./expenses"].expenseInput(expenseBody),
              null,
            );
            const expenseId = expense.receipt.transaction.id;
            assert.equal(
              (
                await deps["./receipt-server"].saveReceipt(
                  deps["./expenses"].expenseInput(expenseBody),
                  null,
                )
              ).receipt.id,
              expense.receipt.id,
            );
            const { requestKey: expenseKey, ...expenseEdit } = expenseBody;
            assert.ok(expenseKey);
            const editedExpense = await deps["./receipt-server"].saveReceipt(
              deps["./expenses"].expenseInput(
                {
                  ...expenseEdit,
                  subtotal: "60",
                  total: "60",
                  transactionAction: "LINK",
                  transactionId: expenseId,
                  expectedUpdatedAt: expense.receipt.updatedAt,
                },
                true,
              ),
              null,
              expense.receipt.id,
            );
            assert.equal(editedExpense.receipt.transaction.id, expenseId);
            assert.equal(
              (
                await tx.financialTransaction.findUnique({ where: { id: expenseId } })
              ).amount.toFixed(4),
              "-60.0000",
            );
            const incomeBody = {
              sourceId: source.id,
              description: `${tag} gift`,
              accountId: bank.id,
              currency: "CAD",
              date: "2026-11-06",
              grossAmount: null,
              netAmount: "100",
              deductions: [],
              requestKey: randomUUID(),
              syncMovement: true,
            };
            const income = await deps["./income-server"].saveIncome(
              deps["./income"].incomeInput(incomeBody),
              null,
            );
            const incomeId = income.record.transaction.id;
            const { requestKey: incomeKey, ...incomeEdit } = incomeBody;
            assert.ok(incomeKey);
            const editedIncome = await deps["./income-server"].saveIncome(
              deps["./income"].incomeInput(
                {
                  ...incomeEdit,
                  netAmount: "110",
                  transactionAction: "LINK",
                  transactionId: incomeId,
                  expectedUpdatedAt: income.record.updatedAt,
                },
                true,
              ),
              null,
              income.record.id,
            );
            assert.equal(editedIncome.record.transaction.id, incomeId);
            assert.equal(editedIncome.record.transaction.amount, "110.0000");
            for (const destination of [savings, card])
              await deps["./transaction-server"].saveTransaction(
                deps["./transactions"].transactionInput({
                  type: "TRANSFER",
                  date: "2026-11-06",
                  description: `${tag} transfer ${destination.id}`,
                  accountId: bank.id,
                  destinationAccountId: destination.id,
                  amount: "200",
                  currency: "CAD",
                  requestKey: randomUUID(),
                }),
              );
            const list = (activity) =>
              deps["./transaction-server"].listTransactions(
                new URLSearchParams({ activity, account: String(bank.id) }),
              );
            assert.equal((await list("expenses")).total, 1);
            assert.equal((await list("income")).total, 1);
            assert.equal((await list("transfers")).total, 2);
            // Link bank rows to these exact activity IDs; no second income or expense is inserted.
            const csv = `Date,Description,Amount,Type\n2026-11-06,${tag},-60,EXPENSE\n2026-11-06,${tag} gift,110,INCOME\n`;
            const parsing = deps["./statement-csv"].parseStatement(Buffer.from(csv), {
              delimiter: "AUTO",
              encoding: "AUTO",
              headerRow: 1,
            });
            // Use the real upload/parser route in the browser test; exercise matching here through the import service.
            const prepared = {
              buffer: Buffer.from(csv),
              mimeType: "text/csv",
              extension: "csv",
              originalName: "activities.csv",
              contentHash: createHash("sha256").update(csv).digest("hex"),
            };
            const uploaded = await deps["./statement-server"].createStatement(
              bank.id,
              parsing,
              prepared,
            );
            let batch = await deps["./statement-server"].updateStatement(uploaded.batch.id, {
              expectedRevision: uploaded.batch.revision,
              mapping: {
                dateColumn: 0,
                descriptionColumn: 1,
                amountColumn: 2,
                typeColumn: 3,
                amountMode: "SIGNED",
                signConvention: "INFLOW_POSITIVE",
                debitDirection: "OUTFLOW",
                dateFormat: "YYYY-MM-DD",
                decimal: ".",
                outflowType: "REVIEW",
                inflowType: "REVIEW",
                expenseCategoryId: category.id,
                incomeCategoryId: null,
                typeRules: [
                  { value: "EXPENSE", type: "EXPENSE" },
                  { value: "INCOME", type: "INCOME" },
                ],
                confirmed: true,
              },
            });
            assert.equal(batch.rows[0].review.matchId, expenseId);
            assert.equal(batch.rows[1].review.matchId, incomeId);
            const countBeforeImport = await tx.financialTransaction.count({
              where: { accountId: bank.id },
            });
            await deps["./statement-server"].commitStatement(batch.id, {
              expectedRevision: batch.revision,
            });
            await deps["./statement-server"].commitStatement(batch.id, {
              expectedRevision: batch.revision,
            });
            assert.equal(
              await tx.financialTransaction.count({ where: { accountId: bank.id } }),
              countBeforeImport,
            );
            assert.equal((await list("expenses")).total, 1);
            assert.equal((await list("income")).total, 1);
            await assert.rejects(
              deps["./activity-server"].deleteActivity(
                incomeId,
                (await deps["./transaction-server"].getTransaction(incomeId)).updatedAt,
              ),
              /recorded in a statement/,
            );
            const revisedCategory = await tx.financeCategory.create({
              data: {
                userId: 1,
                name: `${tag} revised`,
                normalizedName: randomUUID(),
                type: "EXPENSE",
              },
            });
            await assert.rejects(
              deps["./receipt-server"].saveReceipt(
                deps["./expenses"].expenseInput(
                  {
                    ...expenseEdit,
                    categoryId: revisedCategory.id,
                    subtotal: "60",
                    total: "60",
                    transactionAction: "LINK",
                    transactionId: expenseId,
                    expectedUpdatedAt: editedExpense.receipt.updatedAt,
                  },
                  true,
                ),
                null,
                expense.receipt.id,
              ),
              /Only its notes/i,
            );
            const categorized = await tx.financialTransaction.findUnique({
              where: { id: expenseId },
            });
            assert.equal(categorized.categoryId, category.id);
            assert.equal(categorized.amount.toFixed(4), "-60.0000");
            // Unmatched manual activities can be removed as a whole; matched bank history is protected.
            const disposableExpense = await deps["./receipt-server"].saveReceipt(
              deps["./expenses"].expenseInput({
                ...expenseBody,
                requestKey: randomUUID(),
                date: "2026-11-07",
              }),
              null,
            );
            const disposableIncome = await deps["./income-server"].saveIncome(
              deps["./income"].incomeInput({
                ...incomeBody,
                requestKey: randomUUID(),
                date: "2026-11-07",
              }),
              null,
            );

            // Whole-record deletion removes supporting metadata and its movement together.
            const transaction = await deps["./transaction-server"].getTransaction(
              disposableIncome.record.transaction.id,
            );
            await deps["./activity-server"].deleteActivity(
              disposableIncome.record.transaction.id,
              transaction.updatedAt,
            );
            assert.equal(
              await tx.financialIncomeRecord.count({ where: { id: disposableIncome.record.id } }),
              0,
            );
            assert.equal(
              await tx.financialTransaction.count({
                where: { id: disposableIncome.record.transaction.id },
              }),
              0,
            );
            const expenseTransaction = await deps["./transaction-server"].getTransaction(
              disposableExpense.receipt.transaction.id,
            );
            await deps["./activity-server"].deleteActivity(
              disposableExpense.receipt.transaction.id,
              expenseTransaction.updatedAt,
            );
            assert.equal(
              await tx.financialReceipt.count({ where: { id: disposableExpense.receipt.id } }),
              0,
            );
            assert.equal(
              await tx.financialTransaction.count({
                where: { id: disposableExpense.receipt.transaction.id },
              }),
              0,
            );
            const repeated = { ...expenseBody, date: "2026-11-08", requestKey: randomUUID() };
            const purchaseOne = await deps["./receipt-server"].saveReceipt(
              deps["./expenses"].expenseInput(repeated),
              null,
            );
            await assert.rejects(
              deps["./receipt-server"].saveReceipt(
                deps["./expenses"].expenseInput({ ...repeated, requestKey: randomUUID() }),
                null,
              ),
              /already exists/,
            );
            const purchaseTwo = await deps["./receipt-server"].saveReceipt(
              deps["./expenses"].expenseInput({
                ...repeated,
                requestKey: randomUUID(),
                allowDuplicate: true,
              }),
              null,
            );
            assert.notEqual(purchaseOne.receipt.transaction.id, purchaseTwo.receipt.transaction.id);
            const { requestKey: repeatedKey, ...repeatEdit } = repeated;
            assert.ok(repeatedKey);
            const noted = await deps["./receipt-server"].saveReceipt(
              deps["./expenses"].expenseInput(
                {
                  ...repeatEdit,
                  notes: "Two separate real purchases",
                  transactionAction: "LINK",
                  transactionId: purchaseTwo.receipt.transaction.id,
                  expectedUpdatedAt: purchaseTwo.receipt.updatedAt,
                },
                true,
              ),
              null,
              purchaseTwo.receipt.id,
            );
            assert.equal(noted.receipt.transaction.id, purchaseTwo.receipt.transaction.id);
            throw rollback;
          },
          { timeout: 60000, isolationLevel: "Serializable" },
        ),
        (error) => error === rollback,
      );
    } finally {
      await db.$disconnect();
      if (oldRoot === undefined) delete process.env.FINANCE_UPLOAD_DIR;
      else process.env.FINANCE_UPLOAD_DIR = oldRoot;
      await rm(root, { recursive: true, force: true });
    }
  },
);
