import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
  const exports = {}; new Function("exports", "require", compiled)(exports, name => deps[name] ?? require(name)); return exports;
}
test("reconciliation confirms explicit allocations, resolves duplicates without deletion and preserves reversible audited decisions", { skip: process.env.RUN_FINANCE_RECONCILIATION_DB_TEST !== "1" }, async () => {
  const { PrismaClient, Prisma } = await import("../src/generated/prisma/index.js");
  const prisma = new PrismaClient(), rollback = new Error("ROLLBACK_RECONCILIATION_FIXTURES");
  const validation = load("../src/lib/finance/validation.ts"), transactionsInput = load("../src/lib/finance/transactions.ts", { "./validation": validation });
  const rules = load("../src/lib/finance/reconciliation.ts", { "./validation": validation, "./transactions": transactionsInput });
  const nextServer = require("next/server"), server = load("../src/lib/finance/server.ts", { "next/server": nextServer, "./validation": validation });
  const ledger = load("../src/lib/finance/reconciliation-ledger.ts", { "@/generated/prisma": { Prisma }, "./validation": validation, "./server": server });
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      let index = 0;
      const db = { prisma: { ...tx, $transaction: async callback => {
        const name = `reconciliation_${++index}`; await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const result = await callback(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      } } };
      const transactions = load("../src/lib/finance/transaction-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "next/server": nextServer, "./validation": validation, "./server": server, "./transactions": transactionsInput });
      const reconciliation = load("../src/lib/finance/reconciliation-server.ts", { "@/generated/prisma": { Prisma }, "@/lib/prisma": db, "./server": server, "./validation": validation, "./reconciliation": rules, "./reconciliation-ledger": ledger });
      const statementJson = async request => request.json();
      const deps = { "@/lib/require-owner": { requireOwner: async () => null }, "next/server": nextServer, "@/lib/finance/server": server, "@/lib/finance/validation": validation, "@/lib/finance/transaction-server": transactions, "@/lib/finance/reconciliation": rules, "@/lib/finance/reconciliation-server": reconciliation, "@/lib/finance/statement-files": { statementJson } };
      const route = load("../src/app/api/finance/reconciliation/route.ts", deps), detailRoute = load("../src/app/api/finance/reconciliation/[kind]/[id]/route.ts", deps);
      const request = body => new Request("http://localhost/api/finance/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const tag = randomUUID();
      const account = async (type, currency = "CAD", userId = 1) => tx.financialAccount.create({ data: { userId, name: `${tag}-${randomUUID()}`, normalizedName: randomUUID(), currency, type } });
      const bank = await account("CHEQUING"), cash = await account("CASH"), savings = await account("SAVINGS"), usd = await account("SAVINGS", "USD"), card = await account("CREDIT_CARD");
      const category = await tx.financeCategory.create({ data: { userId: 1, name: tag, normalizedName: tag, type: "EXPENSE" } });
      const transaction = async (description, amount, patch = {}) => tx.financialTransaction.create({ data: { userId: 1, accountId: bank.id, categoryId: category.id, occurredOn: new Date("2026-11-06"), amount, currency: "CAD", type: amount.startsWith("-") ? "EXPENSE" : "INCOME", source: "IMPORTED", description: `${tag} ${description}`, ...patch } });
      const receipt = async (merchant, total, accountId = bank.id) => tx.financialReceipt.create({ data: { userId: 1, accountId, categoryId: category.id, purchasedOn: new Date("2026-11-01"), merchant: `${tag} ${merchant}`, subtotal: total, total, currency: "CAD" } });
      const detail = (kind, id, target) => reconciliation.getReconciliation(kind, id, new URLSearchParams(target ? { search: String(target) } : {}));
      async function command(kind, sourceId, target, action, amount, patch = {}) {
        const source = await detail(kind, sourceId, target.id), currentTarget = await tx.financialTransaction.findUnique({ where: { id: target.id } });
        return { kind, sourceId, transactionId: target.id, action, amount, note: "Integration decision", requestKey: randomUUID(), expectedRevision: source.links.find(link => link.transactionId === target.id)?.revision ?? 0, sourceVersion: source.source.version, targetVersion: currentTarget.updatedAt.toISOString(), acknowledgeAccountDifference: false, ...patch };
      }
      async function decide(body, expected = 200) { const response = await route.POST(request(body)); const json = await response.json(); assert.equal(response.status, expected, json.error); return json; }
      // Identical purchases remain two suggestions; neither is auto-confirmed by equal amounts.
      const first = await transaction("Grocery store", "-60"), second = await transaction("Grocery store", "-60"), grocery = await receipt("Grocery store", "60");
      let suggestions = await detail("RECEIPT", grocery.id);
      assert.equal(suggestions.links.length, 0); assert.ok(suggestions.candidates.some(item => item.transaction.id === first.id)); assert.ok(suggestions.candidates.some(item => item.transaction.id === second.id));
      const countBefore = await tx.financialTransaction.count();
      await decide(await command("RECEIPT", grocery.id, first, "REJECT", "60"));
      assert.ok(!(await detail("RECEIPT", grocery.id)).candidates.some(item => item.transaction.id === first.id));
      assert.ok((await reconciliation.getReconciliation("RECEIPT", grocery.id, new URLSearchParams({ rejected: "true" }))).candidates.some(item => item.transaction.id === first.id && item.link.status === "REJECTED"));
      const save = await command("RECEIPT", grocery.id, second, "CONFIRM", "60");
      const eventsBefore = await tx.financialMatchEvent.count();
      await decide(save); assert.equal((await decide(save)).replayed, true); assert.equal(await tx.financialMatchEvent.count(), eventsBefore + 1);
      assert.equal(await tx.financialTransaction.count(), countBefore); assert.equal((await tx.financialReceipt.findUnique({ where: { id: grocery.id } })).transactionId, second.id);
      await decide({ ...save, note: "Changed retry" }, 409);
      await decide({ ...save, requestKey: randomUUID() }, 409);
      // Correcting allocations releases capacity; several receipts can cover one payment.
      await decide(await command("RECEIPT", grocery.id, second, "CONFIRM", "40"));
      assert.equal((await detail("RECEIPT", grocery.id)).source.remaining, "20.0000");
      assert.equal((await tx.financialReceipt.findUnique({ where: { id: grocery.id } })).transactionId, null);
      const extra = await receipt("Second receipt", "25");
      await decide(await command("RECEIPT", extra.id, second, "CONFIRM", "21"), 409);
      await decide(await command("RECEIPT", extra.id, second, "CONFIRM", "20"));
      await decide(await command("RECEIPT", grocery.id, first, "CONFIRM", "20"));
      assert.equal((await detail("RECEIPT", grocery.id)).source.remaining, "0.0000");
      await decide(await command("RECEIPT", grocery.id, second, "UNLINK", "40"));
      assert.equal((await detail("RECEIPT", grocery.id)).source.remaining, "40.0000");
      // One purchase split between debit and cash requires an explicit account confirmation.
      const split = await receipt("Split purchase", "100"), debitPart = await transaction("Split purchase debit", "-60"), cashPart = await transaction("Split purchase cash", "-40", { accountId: cash.id, source: "MANUAL" });
      await decide(await command("RECEIPT", split.id, debitPart, "CONFIRM", "60"));
      await decide(await command("RECEIPT", split.id, cashPart, "CONFIRM", "40"), 400);
      await decide(await command("RECEIPT", split.id, cashPart, "CONFIRM", "40", { acknowledgeAccountDifference: true }));
      assert.equal((await detail("RECEIPT", split.id)).source.remaining, "0.0000");
      assert.equal((await transactions.getTransaction(cashPart.id)).receipts[0].id, split.id);
      // Income is allocated against NET, never gross; a paycheque can have two deposits.
      const pay = await tx.financialIncomeRecord.create({ data: { userId: 1, description: `${tag} Employer`, paidOn: new Date("2026-10-15"), accountId: bank.id, grossAmount: "2000", netAmount: "1500", currency: "CAD" } });
      const deposit = await transaction("Employer deposit", "1000", { occurredOn: new Date("2026-11-01") }), deposit2 = await transaction("Employer savings", "500", { accountId: savings.id });
      assert.ok((await detail("INCOME", pay.id)).candidates.some(item => item.transaction.id === deposit.id), "delayed posting dates are suggested");
      await decide(await command("INCOME", pay.id, deposit, "CONFIRM", "1000"));
      await decide(await command("INCOME", pay.id, deposit2, "CONFIRM", "500", { acknowledgeAccountDifference: true }));
      assert.equal((await detail("INCOME", pay.id)).source.remaining, "0.0000"); assert.equal((await tx.financialIncomeRecord.findUnique({ where: { id: pay.id } })).grossAmount.toFixed(4), "2000.0000");
      // Manual/imported duplicates retain documents and original records, while counted activity changes reversibly.
      const manual = await transaction("Cafe manual", "-18.75", { source: "MANUAL", occurredOn: new Date("2026-10-20") }), imported = await transaction("Cafe card posting", "-18.75");
      const evidence = await receipt("Cafe", "18.75");
      await tx.financialReceipt.update({ where: { id: evidence.id }, data: { transactionId: manual.id } });
      await ledger.syncSupportingMatch(tx, "RECEIPT", { ...evidence, transactionId: manual.id });
      const duplicateBefore = await tx.financialTransaction.count();
      await decide(await command("DUPLICATE", manual.id, imported, "CONFIRM", "18.75"));
      assert.equal((await transactions.getTransaction(manual.id)).ledgerAmount, "0.0000"); assert.equal((await transactions.getTransaction(imported.id)).ledgerAmount, "-18.7500");
      assert.equal((await tx.financialReceipt.findUnique({ where: { id: evidence.id } })).transactionId, manual.id); assert.equal(await tx.financialTransaction.count(), duplicateBefore);
      assert.ok((await transactions.getTransaction(imported.id)).receipts.some(item => item.id === evidence.id));
      assert.deepEqual((await detail("RECEIPT", evidence.id)).warnings, [], "retained proof on a duplicate alias is not an overallocated receipt");
      assert.equal((await detail("DUPLICATE", imported.id)).source.allocated, "18.7500");
      await assert.rejects(transactions.deleteTransaction(manual.id), /Unlink/);
      const unmatched = await reconciliation.listReconciliation(new URLSearchParams({ view: "TRANSACTIONS", search: tag }));
      assert.ok(!unmatched.records.some(item => item.id === imported.id), "confirmed duplicate activity inherits its manual receipt coverage");
      await decide(await command("DUPLICATE", manual.id, imported, "UNLINK", "18.75"));
      assert.equal((await transactions.getTransaction(manual.id)).ledgerAmount, "-18.7500");
      // One manual amount can cover several statement entries, and vice versa.
      const group = await transaction("Combined manual purchase", "-100", { source: "MANUAL" }), part1 = await transaction("Separate posting A", "-40"), part2 = await transaction("Separate posting B", "-60");
      await decide(await command("DUPLICATE", group.id, part1, "CONFIRM", "40")); assert.equal((await transactions.getTransaction(group.id)).ledgerAmount, "-60.0000");
      await decide(await command("DUPLICATE", group.id, part2, "CONFIRM", "60")); assert.equal((await transactions.getTransaction(group.id)).ledgerAmount, "0.0000");
      const groupTarget = await transaction("Combined bank posting", "-100"), manual1 = await transaction("Manual A", "-40", { source: "MANUAL" }), manual2 = await transaction("Manual B", "-60", { source: "MANUAL" });
      await decide(await command("DUPLICATE", manual1.id, groupTarget, "CONFIRM", "40")); await decide(await command("DUPLICATE", manual2.id, groupTarget, "CONFIRM", "60"));
      assert.equal((await transactions.getTransaction(manual1.id)).ledgerAmount, "0.0000"); assert.equal((await transactions.getTransaction(manual2.id)).ledgerAmount, "0.0000");
      // Partial refunds are separate positive ledger activity; link without changing either amount.
      const purchase = await transaction("Original purchase", "-100"), refund = await transaction("Partial return", "30", { type: "REFUND" }), refund2 = await transaction("Second return", "80", { type: "REFUND" });
      await decide(await command("REFUND", refund.id, purchase, "CONFIRM", "30"));
      await decide(await command("REFUND", refund2.id, purchase, "CONFIRM", "71"), 409);
      await decide(await command("REFUND", refund2.id, purchase, "CONFIRM", "70"));
      assert.equal((await transactions.getTransaction(purchase.id)).ledgerAmount, "-100.0000"); assert.equal((await transactions.getTransaction(refund.id)).ledgerAmount, "30.0000");
      // Transfer duplicates must cover both legs atomically, including a credit card bill payment.
      async function transfer(source) {
        const group = await tx.financialTransfer.create({ data: { userId: 1 } });
        const outgoing = await transaction("Card payment", "-75", { source, type: "TRANSFER", categoryId: null, transferId: group.id });
        const incoming = await transaction("Card payment", "75", { source, type: "TRANSFER", categoryId: null, transferId: group.id, accountId: card.id }); return { outgoing, incoming };
      }
      const manualTransfer = await transfer("MANUAL"), bankTransfer = await transfer("IMPORTED");
      await decide(await command("DUPLICATE", manualTransfer.outgoing.id, bankTransfer.outgoing, "CONFIRM", "10"), 400);
      await decide(await command("DUPLICATE", manualTransfer.outgoing.id, bankTransfer.outgoing, "CONFIRM", "75"));
      assert.equal((await tx.financialTransaction.findUnique({ where: { id: manualTransfer.incoming.id } })).excludedAmount.toFixed(4), "75.0000");
      await decide(await command("DUPLICATE", manualTransfer.outgoing.id, bankTransfer.outgoing, "UNLINK", "75"));
      assert.equal((await tx.financialTransaction.findUnique({ where: { id: manualTransfer.incoming.id } })).excludedAmount.toFixed(4), "0.0000");
      // Completed statement links can be unlinked/corrected without inserting or deleting ledger records.
      const original = await transaction("Manual later in statement", "-24", { source: "MANUAL" }), alternative = await transaction("Correct actual purchase", "-24", { source: "MANUAL" });
      const batch = await tx.financialImport.create({ data: { userId: 1, accountId: bank.id, status: "COMPLETED", fingerprint: randomUUID() } });
      const entry = await tx.financialImportEntry.create({ data: { importId: batch.id, rowKey: "1", action: "MATCH", transactionId: original.id, originalData: { cells: ["2026-11-06", "Bank original", "-24"] }, normalized: { date: "2026-11-06", description: "Bank original", amount: "-24.0000", type: "EXPENSE" } } });
      await ledger.writeMatch(tx, { kind: "STATEMENT", sourceId: entry.id, transactionId: original.id, amount: "24", currency: "CAD", status: "CONFIRMED", snapshot: { label: "Bank original", date: "2026-11-06", signedAmount: "-24", type: "EXPENSE" }, action: "CONFIRM" });
      const statementBefore = await tx.financialTransaction.count();
      await decide(await command("STATEMENT", entry.id, original, "UNLINK", "24"));
      assert.equal((await tx.financialImportEntry.findUnique({ where: { id: entry.id } })).transactionId, null);
      await decide(await command("STATEMENT", entry.id, alternative, "CONFIRM", "24"));
      assert.equal((await tx.financialImportEntry.findUnique({ where: { id: entry.id } })).transactionId, alternative.id); assert.equal(await tx.financialTransaction.count(), statementBefore);
      assert.equal((await tx.financialImportEntry.findUnique({ where: { id: entry.id } })).originalData.cells[1], "Bank original");
      // Wrong currencies, accounts, versions and identities cannot bypass allocation checks.
      const wrongCurrency = await transaction("USD", "-100", { currency: "USD", accountId: usd.id });
      await decide(await command("RECEIPT", split.id, wrongCurrency, "CONFIRM", "1"), 400);
      const maxUser = await tx.user.aggregate({ _max: { id: true } }); const foreignUser = await tx.user.create({ data: { id: maxUser._max.id + 1, email: `${randomUUID()}@test.invalid` } });
      const foreignAccount = await account("CHEQUING", "CAD", foreignUser.id);
      const foreignTransaction = await transaction("Private", "-60", { userId: foreignUser.id, accountId: foreignAccount.id });
      await decide(await command("RECEIPT", grocery.id, foreignTransaction, "CONFIRM", "1"), 404);
      const foreignReceipt = await tx.financialReceipt.create({ data: { userId: foreignUser.id, accountId: foreignAccount.id, purchasedOn: new Date("2026-11-06"), total: "60", currency: "CAD" } });
      assert.equal((await detailRoute.GET(new Request("http://localhost/api/finance/reconciliation"), { params: Promise.resolve({ kind: "RECEIPT", id: String(foreignReceipt.id) }) })).status, 404);
      const events = await reconciliation.listReconciliation(new URLSearchParams({ view: "AUDIT" }));
      assert.ok(events.events.some(event => event.action === "UNLINK")); assert.ok(await tx.financialMatchEvent.findFirst({ where: { action: "CORRECT" } }));
      assert.ok((await tx.financialMatchEvent.count()) > 20);
      // A cash purchase and an independent receipt can simply stay unmatched.
      const noReceipt = await transaction("No receipt cash purchase", "-7.23", { accountId: cash.id, source: "MANUAL" });
      const noTransaction = await receipt("Unmatched receipt", "9.87");
      assert.equal((await detail("RECEIPT", noTransaction.id)).source.remaining, "9.8700");
      const oldPosting = await transaction("Older posting", "-9.87", { occurredOn: new Date("2026-06-01") });
      assert.ok(!(await detail("RECEIPT", noTransaction.id)).candidates.some(item => item.transaction.id === oldPosting.id));
      assert.ok((await detail("RECEIPT", noTransaction.id, oldPosting.id)).candidates.some(item => item.transaction.id === oldPosting.id));
      const cashView = await reconciliation.listReconciliation(new URLSearchParams({ view: "TRANSACTIONS", account: String(cash.id) })); assert.ok(cashView.records.some(item => item.id === noReceipt.id));
      // Legacy/simple supporting associations are preserved, but overlapping proof is explicitly flagged.
      const proofTarget = await transaction("Overlapping proof", "-7.50"), proof1 = await receipt("Proof copy A", "7.50"), proof2 = await receipt("Proof copy B", "7.50");
      for (const proof of [proof1, proof2]) {
        await tx.financialReceipt.update({ where: { id: proof.id }, data: { transactionId: proofTarget.id } });
        await ledger.syncSupportingMatch(tx, "RECEIPT", { ...proof, transactionId: proofTarget.id });
      }
      assert.ok((await detail("RECEIPT", proof1.id)).warnings.some(warning => /overlapping/.test(warning)));
      await decide(await command("RECEIPT", proof1.id, proofTarget, "UNLINK", "7.50"));
      assert.deepEqual((await detail("RECEIPT", proof2.id)).warnings, []);
      await decide(await command("RECEIPT", proof1.id, proofTarget, "REJECT", "0"));
      const retainedMatch = await tx.financialMatch.findFirst({ where: { receiptId: proof2.id, status: "CONFIRMED" } });
      const beforeDeletion = await tx.financialTransaction.count();
      await ledger.unlinkSupportingMatches(tx, "RECEIPT", proof2.id);
      await tx.financialReceipt.delete({ where: { id: proof2.id } });
      const retained = await tx.financialMatch.findUnique({ where: { id: retainedMatch.id }, include: { events: true } });
      assert.equal(retained.receiptId, null); assert.equal(retained.status, "UNLINKED");
      assert.ok(retained.events.some(event => event.details.sourceId === proof2.id && event.action === "UNLINK"));
      assert.equal(await tx.financialTransaction.count(), beforeDeletion);
      throw rollback;
    }, { isolationLevel: "Serializable", timeout: 120000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
