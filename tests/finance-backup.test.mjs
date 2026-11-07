import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { backup, verify } from "../scripts/finance-backup.mjs";
test("backup refuses an existing destination and restore verification rejects corruption before Docker access", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "finance-backup-unit-"));
  const digest = value => createHash("sha256").update(value).digest("hex");
  try {
    assert.throws(() => backup("docker-compose.dev.yml", root), /EEXIST/);
    const dump = Buffer.from("test backup"), key = `${randomUUID()}.pdf`, original = Buffer.from("private bytes");
    await fs.writeFile(path.join(root, "database.dump"), dump); await fs.mkdir(path.join(root, "documents"));
    const manifest = { version: 1, postgresMajor: 15, databaseHash: "wrong", documents: [], files: [] };
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest)); await assert.rejects(verify(root), /checksum/);
    manifest.databaseHash = digest(dump); manifest.documents = [{ key, size: original.length, hash: digest(original) }];
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest)); await assert.rejects(verify(root), /missing/);
    await fs.writeFile(path.join(root, "documents", key), Buffer.from("corrupt bytes")); await assert.rejects(verify(root), /differs/);
    await fs.unlink(path.join(root, "documents", key)); await fs.symlink(path.join(root, "database.dump"), path.join(root, "documents", key)); await assert.rejects(verify(root), /symbolic link/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
