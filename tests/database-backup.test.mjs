import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("database backup keeps whole-database dumps, validates archives, and cleans failed attempts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-db-backup-unit-"));
  try {
    const bin = path.join(root, "bin"), target = path.join(root, "backup folder"); await fs.mkdir(bin);
    const docker = path.join(bin, "docker");
    await fs.writeFile(docker, `#!/bin/sh
case "$*" in
  *pg_dump*) printf 'WHOLE_DATABASE'; [ "\$BACKUP_TEST_FAIL" != dump ] ;;
  *pg_restore*) input=$(cat); [ "$input" = WHOLE_DATABASE ] && [ "\$BACKUP_TEST_FAIL" != validate ] ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
    function run(failure = "") { return spawnSync("sh", ["scripts/backup-database.sh", target], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_TEST_FAIL: failure } }); }
    const first = run(); assert.equal(first.status, 0, first.stderr); const names = await fs.readdir(target); assert.equal(names.length, 1); assert.match(names[0], /^dashboard-.*\.dump$/); assert.equal(await fs.readFile(path.join(target, names[0]), "utf8"), "WHOLE_DATABASE"); assert.equal((await fs.stat(path.join(target, names[0]))).mode & 0o777, 0o600);
    assert.equal(run().status, 0); assert.equal((await fs.readdir(target)).length, 2);
    for (const failure of ["dump", "validate"]) { assert.notEqual(run(failure).status, 0); assert.equal((await fs.readdir(target)).length, 2); }
    const script = await fs.readFile("scripts/backup-database.sh", "utf8"); assert.ok(!script.includes("--table")); assert.ok(!script.includes("--schema=")); assert.ok(!script.includes(" stop "));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
