import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
}
test("CSV imports are atomic, retry-safe, owner-scoped and preserve manual purchases, income and transfer links", { skip: process.env.RUN_FINANCE_STATEMENT_DB_TEST !== "1" }, async () => {
  const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient(), root = await mkdtemp(path.join(os.tmpdir(), "finance-statements-db-")), previous = process.env.FINANCE_UPLOAD_DIR;
  process.env.FINANCE_UPLOAD_DIR = root;
  const validation = load("../src/lib/finance/validation.ts");
  const transactionValidation = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const receiptValidation = load("../src/lib/finance/receipts.ts", { "./validation": validation, "./transactions": transactionValidation });
  const files = load("../src/lib/finance/receipt-files.ts", { "./validation": validation, "./receipts": receiptValidation });
  const csv = load("../src/lib/finance/statement-csv.ts", { "./validation": validation, "./transactions": transactionValidation });
  const imports = load("../src/lib/finance/statement-imports.ts", { "./validation": validation, "./transactions": transactionValidation, "./statement-csv": csv });
  const statementFiles = load("../src/lib/finance/statement-files.ts", { "./validation": validation, "./statement-csv": csv, "./statement-imports": imports, "./receipt-files": files });
  const nextServer = require("next/server"), server = load("../src/lib/finance/server.ts", { "next/server": nextServer, "./validation": validation });
  const rollback = new Error("ROLLBACK_STATEMENT_FIXTURES");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      let savepoint = 0;
      // Each service call gets a genuine database rollback boundary inside the fixture transaction.
      const db = { prisma: { ...tx, $transaction: async callback => {
        const name = `statement_test_${++savepoint}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const result = await callback(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      } } };
      const ledger = load("../src/lib/finance/reconciliation-ledger.ts", { "@/generated/prisma": { Prisma }, "./validation": validation, "./server": server });
      const transactions = load("../src/lib/finance/transaction-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "next/server": nextServer, "./validation": validation, "./server": server, "./transactions": transactionValidation });
      const statements = load("../src/lib/finance/statement-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "./validation": validation, "./server": server, "./transactions": transactionValidation, "./transaction-server": transactions, "./reconciliation-ledger": ledger, "./receipt-files": files, "./statement-csv": csv, "./statement-imports": imports });
      const deps = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": nextServer, "@/lib/finance/server": server, "@/lib/finance/validation": validation, "@/lib/finance/transaction-server": transactions, "@/lib/finance/statement-files": statementFiles, "@/lib/finance/statement-server": statements, "@/lib/finance/receipt-files": files };
      const uploadRoute = load("../src/app/api/finance/imports/route.ts", deps), detailRoute = load("../src/app/api/finance/imports/[id]/route.ts", deps), commitRoute = load("../src/app/api/finance/imports/[id]/commit/route.ts", deps), documentRoute = load("../src/app/api/finance/imports/[id]/document/route.ts", deps);
      const context = id => ({ params: Promise.resolve({ id: String(id) }) });
      const request = (method, body, headers = {}) => new Request("http://localhost/api/finance/imports", { method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
      async function response(response, status = 200) { const result = await response.json(); assert.equal(response.status, status, result.error); return result; }
      async function account(type, currency = "CAD", userId = 1) { return tx.financialAccount.create({ data: { userId, name: randomUUID(), normalizedName: randomUUID(), type, currency } }); }
      const bank = await account("CHEQUING"), card = await account("CREDIT_CARD"), cash = await account("CASH"), usd = await account("SAVINGS", "USD");
      const expense = await tx.financeCategory.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "EXPENSE" } });
      const income = await tx.financeCategory.create({ data: { userId: 1, name: randomUUID(), normalizedName: randomUUID(), type: "INCOME" } });
      const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2, debitColumn: null, creditColumn: null, currencyColumn: null, typeColumn: 3, referenceColumn: 4, counterpartyColumn: null, notesColumn: null, categoryColumn: null, amountMode: "SIGNED", signConvention: "INFLOW_POSITIVE", debitDirection: "OUTFLOW", dateFormat: "DD/MM/YYYY", decimal: ".", outflowType: "REVIEW", inflowType: "REVIEW", expenseCategoryId: expense.id, incomeCategoryId: income.id, typeRules: ["EXPENSE", "INCOME", "REFUND", "TRANSFER", "ADJUSTMENT"].map(type => ({ value: type, type })), confirmed: true };
      async function upload(text, accountId = bank.id, name = "statement.csv", status = 201, parsing = {}) {
        const form = new FormData(); form.append("details", JSON.stringify({ accountId, delimiter: "AUTO", encoding: "AUTO", headerRow: 1, ...parsing }));
        form.append("file", new File([text], name, { type: "text/csv" }));
        return response(await uploadRoute.POST(new Request("http://localhost/api/finance/imports", { method: "POST", body: form })), status);
      }
      async function map(batch, overrides = {}) { return (await response(await detailRoute.PATCH(request("PATCH", { expectedRevision: batch.revision, mapping: { ...mapping, ...overrides } }), context(batch.id)))).batch; }
      async function review(batch, patches) { return (await response(await detailRoute.PATCH(request("PATCH", { expectedRevision: batch.revision, rows: batch.rows.filter(row => patches[row.rowNumber]).map(row => ({ id: row.id, action: patches[row.rowNumber].action ?? row.action, review: { ...row.review, ...patches[row.rowNumber].review } })) }), context(batch.id)))).batch; }
      async function commit(batch, status = 200) { return response(await commitRoute.POST(request("POST", { expectedRevision: batch.revision }), context(batch.id)), status); }
      async function manual(description, amount, type = "EXPENSE", accountId = bank.id) {
        return (await transactions.saveTransaction(transactionValidation.transactionInput({ date: "2026-11-06", description, amount, currency: "CAD", type, accountId, categoryId: type === "INCOME" ? income.id : expense.id, requestKey: randomUUID() }))).transaction;
      }
      const purchase = await manual("Manual groceries", "12.50"), payroll = await manual("Payroll deposit", "1500", "INCOME");
      const receipt = await tx.financialReceipt.create({ data: { userId: 1, accountId: bank.id, categoryId: expense.id, transactionId: purchase.id, purchasedOn: new Date("2026-11-06"), merchant: "Store", subtotal: "12.5", total: "12.5", currency: "CAD" } });
      const pay = await tx.financialIncomeRecord.create({ data: { userId: 1, accountId: bank.id, categoryId: income.id, transactionId: payroll.id, paidOn: new Date("2026-11-06"), description: "November pay stub", grossAmount: "2000", netAmount: "1500", currency: "CAD" } });
      const initial = await tx.financialTransaction.count();
      const text = "Date,Description,Amount,Type,Reference\n06/11/2026,Manual groceries,-12.50,EXPENSE,manual-grocery\n06/11/2026,Payroll deposit,1500,INCOME,payroll-1\n06/11/2026,Card payment,-75,TRANSFER,card-pay-1\n06/11/2026,Returned item,8.50,REFUND,refund-1\n06/11/2026,Account correction,-0.0012,ADJUSTMENT,adjust-1\n06/11/2026,Cash withdrawal,-20,TRANSFER,cash-1\nBAD,Wrong amount,broken,EXPENSE,bad-1\n06/11/2026,Manual groceries,-12.50,EXPENSE,manual-grocery\n";
      let batch = (await upload(text)).batch;
      assert.equal(batch.status, "DRAFT"); assert.equal(await tx.financialTransaction.count(), initial);
      const original = await documentRoute.GET(request("GET"), context(batch.id));
      assert.equal(original.status, 200); assert.match(original.headers.get("content-type"), /octet-stream/); assert.match(original.headers.get("content-disposition"), /attachment/); assert.match(original.headers.get("content-security-policy"), /sandbox/); assert.equal(await original.text(), text);
      assert.equal((await upload(text, bank.id, "renamed.csv", 200)).batch.id, batch.id);
      batch = await map(batch);
      assert.equal(batch.rows[0].action, "MATCH"); assert.equal(batch.rows[0].review.matchId, purchase.id);
      assert.equal(batch.rows[1].action, "MATCH"); assert.equal(batch.rows[1].review.matchId, payroll.id);
      assert.equal(batch.rows[7].action, "SKIP"); assert.ok(batch.rows[6].errors.length);
      assert.ok(batch.rows[2].errors.some(error => /account/.test(error)));
      await response(await detailRoute.PATCH(request("PATCH", { expectedRevision: 1, mapping }), context(batch.id)), 409);
      batch = await review(batch, { 3: { action: "CREATE", review: { otherAccountId: card.id } }, 6: { action: "CREATE", review: { otherAccountId: cash.id } }, 7: { action: "CREATE", review: { date: "2026-11-06", amount: "-3.2500", description: "Corrected expense" } } });
      assert.deepEqual(batch.rows.filter(row => row.action !== "SKIP").flatMap(row => row.errors), []);
      const done = await commit(batch); assert.equal(done.batch.status, "COMPLETED"); assert.equal(done.replayed, false);
      assert.equal(await tx.financialTransaction.count(), initial + 7); // Two two-leg transfers + refund + adjustment + corrected expense.
      assert.equal((await tx.financialReceipt.findUnique({ where: { id: receipt.id } })).transactionId, purchase.id);
      assert.equal((await tx.financialIncomeRecord.findUnique({ where: { id: pay.id } })).transactionId, payroll.id);
      assert.equal((await transactions.getTransaction(purchase.id)).editable, false);
      const entry = await tx.financialImportEntry.findUnique({ where: { id: done.batch.rows[6].id } });
      assert.equal(entry.originalData.cells[0], "BAD"); assert.equal(entry.originalData.cells[2], "broken"); assert.equal(entry.normalized.description, "Corrected expense"); assert.equal(entry.sourceIdentifier, "bad-1"); assert.equal(entry.transactionId, done.batch.rows[6].transactionId);
      const payment = await transactions.getTransaction(done.batch.rows[2].transactionId);
      assert.equal(payment.type, "TRANSFER"); assert.equal(payment.amount, "-75.0000"); assert.equal(payment.transfer.account.id, card.id); assert.equal(payment.transfer.amount, "75.0000"); assert.equal(payment.source, "IMPORTED");
      const totalAfter = await tx.financialTransaction.count();
      assert.equal((await commit(batch)).replayed, true); assert.equal((await upload(text, bank.id, "same.csv", 200)).batch.status, "COMPLETED"); assert.equal(await tx.financialTransaction.count(), totalAfter);
      await response(await detailRoute.PATCH(request("PATCH", { expectedRevision: done.batch.revision, mapping }), context(batch.id)), 409);
      // Import the other account's positive payment leg; link the existing transfer, don't create two more legs.
      let cardBatch = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,Card payment received,-75,TRANSFER,card-side-payment", card.id)).batch, { signConvention: "OUTFLOW_POSITIVE" });
      assert.equal(cardBatch.rows[0].action, "REVIEW"); assert.ok(cardBatch.rows[0].candidates.some(item => item.id === payment.transfer.transactionId));
      cardBatch = await review(cardBatch, { 1: { action: "MATCH", review: { matchId: payment.transfer.transactionId } } });
      await commit(cardBatch); assert.equal(await tx.financialTransaction.count(), totalAfter);
      // Another file with changed wording/date still resolves by its stable bank reference.
      let overlap = await map((await upload("Date,Description,Amount,Type,Reference\n07/11/2026,New bank wording,8.50,REFUND,refund-1")).batch);
      assert.equal(overlap.rows[0].action, "MATCH"); assert.equal(overlap.rows[0].review.matchId, done.batch.rows[3].transactionId);
      await commit(overlap); assert.equal(await tx.financialTransaction.count(), totalAfter);
      let changed = await map((await upload("Date,Description,Amount,Type,Reference\n07/11/2026,New bank wording,9,REFUND,refund-1")).batch);
      changed = await review(changed, { 1: { action: "CREATE", review: { allowDuplicate: true } } });
      assert.ok(changed.rows[0].errors.some(error => /identifier was already/.test(error))); await commit(changed, 409);
      // An ambiguous manual overlap needs a deliberate choice; it can be linked even when descriptions differ.
      const manualOverlap = await manual("Coffee shop receipt", "4.25");
      let possible = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,POS CAFE 123,-4.25,EXPENSE,cafe-1")).batch);
      assert.equal(possible.rows[0].action, "REVIEW"); assert.ok(possible.rows[0].candidates.some(item => item.id === manualOverlap.id && item.confidence === "POSSIBLE"));
      possible = await review(possible, { 1: { action: "CREATE" } }); await commit(possible, 409);
      possible = await review(possible, { 1: { action: "MATCH", review: { matchId: manualOverlap.id } } }); await commit(possible);
      assert.equal(await tx.financialTransaction.count(), totalAfter + 1);
      // Preview is advisory: a manual transaction entered afterwards must also be caught at commit.
      let race = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,First atomic row,-1.11,EXPENSE,atomic-1\n06/11/2026,Second atomic row,-2.22,EXPENSE,atomic-2")).batch);
      assert.ok(race.rows.every(row => row.action === "CREATE"));
      const late = await manual("Second atomic row", "2.22"), beforeFailed = await tx.financialTransaction.count();
      await commit(race, 409); assert.equal(await tx.financialTransaction.count(), beforeFailed, "the first insert must roll back if a later row fails");
      assert.equal((await statements.getStatement(race.id)).status, "DRAFT");
      race = await review(race, { 2: { action: "MATCH", review: { matchId: late.id } } }); await commit(race); assert.equal(await tx.financialTransaction.count(), beforeFailed + 1);
      // A known older ID must not be hidden by the suggestion limit on busy accounts.
      const busyAccount = await account("CHEQUING");
      const old = await tx.financialTransaction.create({ data: { userId: 1, accountId: busyAccount.id, categoryId: expense.id, occurredOn: new Date("2026-09-01"), description: "Older purchase", amount: "-9.99", currency: "CAD", type: "EXPENSE", source: "MANUAL" } });
      await tx.financialTransaction.createMany({ data: Array.from({ length: 24 }, (_, index) => ({ userId: 1, accountId: busyAccount.id, categoryId: expense.id, occurredOn: new Date("2026-11-06"), description: `Other purchase ${index}`, amount: "-9.99", currency: "CAD", type: "EXPENSE", source: "MANUAL" })) });
      let oldMatch = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,Posted later,-9.99,EXPENSE,old-1", busyAccount.id)).batch);
      oldMatch = await review(oldMatch, { 1: { action: "MATCH", review: { matchId: old.id } } });
      assert.ok(oldMatch.rows[0].candidates.some(item => item.id === old.id)); assert.deepEqual(oldMatch.rows[0].errors, []);
      const beforeOldMatch = await tx.financialTransaction.count(); await commit(oldMatch); assert.equal(await tx.financialTransaction.count(), beforeOldMatch);
      // Distinct identical purchases can be explicitly kept, but the same bank ID cannot be reused.
      let identical = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,Bus,-3.75,EXPENSE,bus-1\n06/11/2026,Bus,-3.75,EXPENSE,bus-2")).batch);
      assert.equal(identical.rows[1].action, "SKIP"); identical = await review(identical, { 2: { action: "CREATE", review: { allowDuplicate: true } } });
      const beforeBus = await tx.financialTransaction.count(); await commit(identical); assert.equal(await tx.financialTransaction.count(), beforeBus + 2);
      let badId = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,Unique first,-6.01,EXPENSE,repeated-id\n06/11/2026,Unique second,-6.02,EXPENSE,repeated-id")).batch);
      badId = await review(badId, { 2: { action: "CREATE", review: { allowDuplicate: true } } }); const beforeBadId = await tx.financialTransaction.count();
      await commit(badId, 409); assert.equal(await tx.financialTransaction.count(), beforeBadId);
      // Cross-currency transfers keep two explicit amounts, never floating point conversion.
      let fx = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,USD savings,-100,TRANSFER,fx-1")).batch);
      fx = await review(fx, { 1: { action: "CREATE", review: { otherAccountId: usd.id, otherAmount: "72.1234" } } }); const fxDone = await commit(fx);
      const fxMovement = await transactions.getTransaction(fxDone.batch.rows[0].transactionId); assert.equal(fxMovement.amount, "-100.0000"); assert.equal(fxMovement.transfer.amount, "72.1234"); assert.equal(fxMovement.transfer.currency, "USD");
      // Semicolon/comma-decimal debit/credit statement, including income, refund and adjustment.
      let separate = await map((await upload("Date;Description;Debit;Credit;Type;Reference\n06/11/2026;Debit purchase;6,25;;EXPENSE;debit-1\n06/11/2026;Interest;;0,1234;INCOME;interest-1\n06/11/2026;Debit refund;;1,15;REFUND;debit-refund-1\n06/11/2026;Rounding;0,0001;;ADJUSTMENT;rounding-1", cash.id)).batch, { amountMode: "DEBIT_CREDIT", amountColumn: null, debitColumn: 2, creditColumn: 3, typeColumn: 4, referenceColumn: 5, decimal: "," });
      assert.deepEqual(separate.rows.map(row => row.review.amount), ["-6.2500", "0.1234", "1.1500", "-0.0001"]); await commit(separate);
      // Foreign records must never be selectable, matched or listed.
      const maxUser = await tx.user.aggregate({ _max: { id: true } }); const foreignUser = await tx.user.create({ data: { id: maxUser._max.id + 1, email: `${randomUUID()}@test.invalid` } });
      const foreign = await account("CHEQUING", "CAD", foreignUser.id);
      await upload("Date,Description,Amount\n2026-11-06,Private,-1", foreign.id, "foreign.csv", 400);
      const hidden = await tx.financialImport.create({ data: { userId: foreignUser.id, accountId: foreign.id, fingerprint: randomUUID() } });
      await response(await detailRoute.GET(request("GET"), context(hidden.id)), 404);
      await response(await documentRoute.GET(request("GET"), context(hidden.id)), 404);
      const history = await response(await uploadRoute.GET(new Request("http://localhost/api/finance/imports"))); assert.ok(!history.batches.some(item => item.id === hidden.id));
      let forbidden = await map((await upload("Date,Description,Amount,Type,Reference\n06/11/2026,Forbidden transfer,-17,TRANSFER,forbidden-1")).batch);
      forbidden = await review(forbidden, { 1: { action: "CREATE", review: { otherAccountId: foreign.id } } }); assert.ok(forbidden.rows[0].errors.length); await commit(forbidden, 409);
      // File validation reports actionable errors and never stores unsupported documents.
      await upload("%PDF-1.4\nFake", bank.id, "statement.pdf", 400);
      await upload('Date,Description,Amount\n2026-11-06,"Unclosed,1', bank.id, "broken.csv", 400);
      await response(await detailRoute.PATCH(new Request("http://localhost/api/finance/imports", { method: "PATCH", body: "{" }), context(forbidden.id)), 400);
      const ledgerBeforeDelete = await tx.financialTransaction.count();
      await response(await detailRoute.DELETE(request("DELETE", null, { "If-Match": String(done.batch.revision) }), context(batch.id)), 409);
      await response(await documentRoute.DELETE(request("DELETE", null, { "If-Match": String(done.batch.revision) }), context(batch.id)));
      assert.equal((await statements.getStatement(batch.id)).documentAvailable, false); assert.equal(await tx.financialTransaction.count(), ledgerBeforeDelete);
      assert.equal((await upload(text, bank.id, "again.csv", 200)).batch.id, batch.id, "deleting source files must not remove duplicate protection");
      await response(await detailRoute.DELETE(request("DELETE", null, { "If-Match": String(forbidden.revision) }), context(forbidden.id)));
      await response(await detailRoute.GET(request("GET"), context(forbidden.id)), 404);
      assert.ok((await readdir(root)).every(name => /\.csv$/.test(name)));
      assert.equal(await tx.financialTransaction.count(), ledgerBeforeDelete);
      throw rollback;
    }, { timeout: 120000, isolationLevel: "Serializable" }), error => error === rollback);
  } finally {
    await prisma.$disconnect(); if (previous === undefined) delete process.env.FINANCE_UPLOAD_DIR; else process.env.FINANCE_UPLOAD_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
