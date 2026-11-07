import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { load } from "./finance-receipts.test.mjs";
const validation = load("../src/lib/finance/validation.ts"), transactions = load("../src/lib/finance/transactions.ts", { "./validation": validation }), receipts = load("../src/lib/finance/receipts.ts", { "./validation": validation, "./transactions": transactions });
const files = load("../src/lib/finance/receipt-files.ts", { "./validation": validation, "./receipts": receipts });
test("private reads reject symlinks, directories, empty files and missing originals without exposing paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-private-read-")), previous = process.env.FINANCE_UPLOAD_DIR; process.env.FINANCE_UPLOAD_DIR = root;
  try {
    const valid = `${randomUUID()}.pdf`, link = `${randomUUID()}.pdf`, folder = `${randomUUID()}.pdf`, empty = `${randomUUID()}.pdf`;
    await fs.writeFile(path.join(root, valid), "%PDF-private-original"); await fs.symlink(path.join(root, valid), path.join(root, link)); await fs.mkdir(path.join(root, folder)); await fs.writeFile(path.join(root, empty), "");
    assert.equal((await files.readReceiptFile(valid)).toString(), "%PDF-private-original");
    for (const key of [link, folder, empty, `${randomUUID()}.pdf`, "../../.env"]) await assert.rejects(files.readReceiptFile(key), error => error.status === 404 && !error.message.includes(root));
  } finally { if (previous === undefined) delete process.env.FINANCE_UPLOAD_DIR; else process.env.FINANCE_UPLOAD_DIR = previous; await fs.rm(root, { recursive: true, force: true }); }
});
test("Prisma and development access logs do not log finance data or query parameters", async () => {
  const prisma = await fs.readFile(new URL("../src/lib/prisma.ts", import.meta.url), "utf8"), config = await fs.readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.ok(prisma.includes("log: []")); assert.ok(!prisma.includes('log: ["query"]')); assert.ok(config.includes("incomingRequests"));
});
