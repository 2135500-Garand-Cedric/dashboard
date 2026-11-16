import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFinanceServices } from "../scripts/helpers/finance-services.mjs";
import { loadWorkModule, samplePng } from "./helpers/work-support.mjs";

test(
  "expense API saves one payment with optional private receipt and enforces owner-only document access",
  {
    skip: process.env.RUN_FINANCE_RECEIPT_DB_TEST !== "1",
  },
  async () => {
    assert.equal(process.env.WORK_MANAGEMENT_DISPOSABLE, "1");
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "work-db");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const directory = await mkdtemp(join(tmpdir(), "expense-receipt-test-"));
    const previous = process.env.FINANCE_UPLOAD_DIR;
    process.env.FINANCE_UPLOAD_DIR = directory;
    const rollback = new Error("ROLLBACK_RECEIPT_API_TEST");
    try {
      await assert.rejects(
        db.$transaction(
          async (tx) => {
            const services = loadFinanceServices({
              ...tx,
              $transaction: (callback) => callback(tx),
            });
            const owner = { requireOwner: async () => null };
            const deps = {
              "@/lib/require-owner": owner,
              "@/lib/finance/server": services.server,
              "@/lib/finance/validation": services.validation,
              "@/lib/finance/expenses": services.expenses,
              "@/lib/finance/receipt-files": services.files,
              "@/lib/finance/receipt-server": services.receipts,
            };
            const route = loadWorkModule("src/app/api/finance/expenses/route.ts", deps);
            const detail = loadWorkModule("src/app/api/finance/expenses/[id]/route.ts", deps);
            const documents = loadWorkModule(
              "src/app/api/finance/expenses/[id]/document/route.ts",
              deps,
            );
            const prefix = `Expense document ${randomUUID()}`;
            const account = await tx.financialAccount.create({
              data: {
                userId: 1,
                name: prefix,
                normalizedName: prefix.toLowerCase(),
                type: "CASH",
                currency: "CAD",
              },
            });
            const category = await tx.financeCategory.create({
              data: {
                userId: 1,
                name: prefix,
                normalizedName: prefix.toLowerCase(),
                type: "EXPENSE",
              },
            });
            const payload = {
              merchant: prefix,
              accountId: account.id,
              categoryId: category.id,
              date: "2026-11-06",
              currency: "CAD",
              subtotal: "10",
              tax: "0",
              tip: "0",
              total: "10",
              transactionAction: "CREATE",
              requestKey: randomUUID(),
              syncMovement: true,
            };
            const request = (body, method = "POST", image = false, headers = {}) => {
              const form = new FormData();
              form.set("details", JSON.stringify(body));
              if (image)
                form.set("file", new File([samplePng], "purchase.png", { type: "image/png" }));
              return new Request("http://localhost/api/finance/expenses", {
                method,
                body: form,
                headers,
              });
            };
            const response = await route.POST(request(payload, "POST", true));
            assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
            const { receipt } = await response.json();
            const id = String(receipt.id),
              context = { params: Promise.resolve({ id }) };
            const movementId = receipt.transaction.id;
            assert.equal(
              (
                await tx.financialTransaction.findUnique({ where: { id: movementId } })
              ).amount.toFixed(4),
              "-10.0000",
            );
            assert.equal((await route.POST(request(payload, "POST", true))).status, 200);
            assert.equal(
              await tx.financialTransaction.count({ where: { accountId: account.id } }),
              1,
            );
            assert.equal((await detail.GET(new Request("http://localhost"), context)).status, 200);
            const original = await documents.GET(
              new Request("http://localhost?download=1"),
              context,
            );
            assert.equal(original.status, 200);
            assert.match(original.headers.get("cache-control"), /no-store/);
            assert.match(original.headers.get("content-disposition"), /^attachment/);
            assert.equal(original.headers.get("x-content-type-options"), "nosniff");
            assert.deepEqual(Buffer.from(await original.arrayBuffer()), samplePng);
            assert.equal(
              (
                await route.POST(
                  request({ ...payload, requestKey: randomUUID(), transactionAction: "UNMATCHED" }),
                )
              ).status,
              400,
            );
            assert.equal(
              (
                await route.POST(
                  request({ ...payload, requestKey: randomUUID(), total: "0", subtotal: "0" }),
                )
              ).status,
              400,
            );
            owner.requireOwner = async () => Response.json({ error: "denied" }, { status: 403 });
            assert.equal(
              (await documents.GET(new Request("http://localhost"), context)).status,
              403,
            );
            assert.equal((await detail.GET(new Request("http://localhost"), context)).status, 403);
            owner.requireOwner = async () => null;
            const removed = await documents.DELETE(
              new Request("http://localhost", {
                method: "DELETE",
                headers: { "If-Match": receipt.updatedAt },
              }),
              context,
            );
            assert.equal(removed.status, 200);
            assert.equal((await services.receipts.getReceipt(receipt.id)).document, null);
            assert.equal(await tx.financialTransaction.count({ where: { id: movementId } }), 1);
            assert.equal(
              (await documents.GET(new Request("http://localhost"), context)).status,
              404,
            );
            throw rollback;
          },
          { timeout: 30000 },
        ),
        (error) => {
          if (error !== rollback) throw error;
          return true;
        },
      );
    } finally {
      if (previous === undefined) delete process.env.FINANCE_UPLOAD_DIR;
      else process.env.FINANCE_UPLOAD_DIR = previous;
      await rm(directory, { recursive: true, force: true });
      await db.$disconnect();
    }
  },
);
