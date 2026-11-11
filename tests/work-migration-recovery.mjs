import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  assertRehearsalEnvironment,
  assertOriginalRows,
} from "../scripts/rehearse-work-migrations.mjs";
import { captureInventory, compareInventories } from "../scripts/work-management-inventory.mjs";

test(
  "interrupted real transactional migration rolls back and resumes only after explicit resolution",
  {
    skip: process.env.RUN_WORK_RECOVERY_TEST !== "1",
  },
  async () => {
    assertRehearsalEnvironment("work_recovery");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "work-recovery-"));
    const output = "private/work-management/phase10-recovery";
    fs.mkdirSync(output, { mode: 0o700 });
    const save = (name, value) =>
      fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
    fs.mkdirSync(path.join(root, "migrations"));
    fs.copyFileSync("prisma/schema.prisma", path.join(root, "schema.prisma"));
    const finalName = "20261113120000_work_focus";
    const source = path.resolve("prisma/migrations");
    for (const name of fs.readdirSync(source)) {
      if (name === finalName) continue;
      fs.cpSync(path.join(source, name), path.join(root, "migrations", name), {
        recursive: true,
      });
    }
    const args = (command) => [
      "prisma",
      "migrate",
      ...command,
      "--schema",
      path.join(root, "schema.prisma"),
    ];
    const run = (label, command, success) => {
      const result = spawnSync("npx", args(command), { encoding: "utf8" });
      fs.writeFileSync(
        path.join(output, `${label}.log`),
        `${result.stdout || ""}\n${result.stderr || ""}`,
        { flag: "wx", mode: 0o600 },
      );
      assert.equal(
        result.status === 0,
        success,
        `Unexpected ${label} outcome; inspect private logs.`,
      );
    };
    try {
      const initial = await captureInventory(db);
      assert.ok(!initial.tables.WorkMutationReceipt, "Restore a fresh pre-redesign copy first.");
      run("through-phase08", ["deploy"], true);
      const before = await captureInventory(db);
      assert.ok(!before.tables.WorkFocus);
      save("before.json", before);
      fs.cpSync(path.join(source, finalName), path.join(root, "migrations", finalName), {
        recursive: true,
      });
      let release;
      let locked;
      const acquired = new Promise((resolve) => {
        locked = resolve;
      });
      const waiting = new Promise((resolve) => {
        release = resolve;
      });
      const blocker = db.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('LOCK TABLE "Todo" IN ACCESS EXCLUSIVE MODE');
          locked();
          await waiting;
        },
        { timeout: 30000 },
      );
      await acquired;
      const log = fs.openSync(path.join(output, "interrupted-deploy.log"), "wx", 0o600);
      const child = spawn("npx", args(["deploy"]), {
        stdio: ["ignore", log, log],
      });
      const exited = new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", resolve);
      });
      let interrupted = false;
      try {
        for (let attempt = 0; attempt < 80; attempt++) {
          const rows = await db.$queryRawUnsafe(`SELECT pid FROM pg_stat_activity
          WHERE datname=current_database() AND pid<>pg_backend_pid()
          AND wait_event_type='Lock' AND query LIKE '%Todo_id_userId_key%'`);
          if (rows.length === 1) {
            const [result] =
              await db.$queryRaw`SELECT pg_terminate_backend(${rows[0].pid}::integer) AS terminated`;
            assert.equal(result.terminated, true);
            interrupted = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } finally {
        release();
        await blocker;
        fs.closeSync(log);
      }
      const code = await exited;
      assert.ok(interrupted, "The real migration must actually have been interrupted.");
      assert.notEqual(code, 0);
      const interruptedState = await captureInventory(db);
      save("interrupted.json", interruptedState);
      assert.ok(!interruptedState.tables.WorkFocus, "Transactional DDL must roll back.");
      assertOriginalRows(before, interruptedState);
      assert.deepEqual(interruptedState.indexes, before.indexes);
      assert.ok(interruptedState.issues.includes("An unfinished migration requires review."));
      run("blocked-retry", ["deploy"], false);
      run("resolve-rolled-back", ["resolve", "--rolled-back", finalName], true);
      run("resumed-deploy", ["deploy"], true);
      const after = await captureInventory(db);
      save("after.json", after);
      assert.deepEqual(compareInventories(before, after, "09"), []);
      assert.deepEqual(after.issues, []);
      assertOriginalRows(initial, after);
      run("repeat-deploy", ["deploy"], true);
      assertOriginalRows(after, await captureInventory(db));
      // This proves why the real status-value migration must commit before its default is used.
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("ALTER TYPE \"TodoStatus\" ADD VALUE 'PHASE10_UNCOMMITTED'");
          await tx.$queryRawUnsafe("SELECT 'PHASE10_UNCOMMITTED'::\"TodoStatus\"");
        }),
        (error) => error.meta?.code === "55P04",
      );
      assert.deepEqual((await captureInventory(db)).enums, after.enums);
      console.log(
        "Actual backend interruption, DDL rollback, blocked retry, explicit resolution, resume, repeat and enum commit boundary passed.",
      );
    } finally {
      await db.$disconnect();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "legacy client can read preserved columns but cannot interpret new task statuses",
  {
    skip: process.env.RUN_WORK_RECOVERY_TEST !== "1",
  },
  async () => {
    assertRehearsalEnvironment("work_recovery");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient({ log: [] });
    const directory = fs.mkdtempSync(
      path.resolve("private/work-management/phase10-legacy-client-"),
    );
    const schema = path.join(directory, "schema.prisma");
    fs.writeFileSync(
      schema,
      `generator client {
  provider = "prisma-client-js"
  output = "./client"
}
datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
}
enum TodoStatus {
  TODO
  IN_PROGRESS
  DONE
}
model Todo {
  id Int @id
  title String
  status TodoStatus
}
`,
      { mode: 0o600 },
    );
    let legacy, id;
    const before = await captureInventory(db);
    try {
      const generated = spawnSync("npx", ["prisma", "generate", "--schema", schema], {
        encoding: "utf8",
      });
      assert.equal(generated.status, 0, "Could not generate the isolated legacy-schema client.");
      const { createRequire } = await import("node:module");
      const legacyModule = createRequire(import.meta.url)(path.join(directory, "client/index.js"));
      legacy = new legacyModule.PrismaClient({ log: [] });
      const row = await db.todo.create({
        data: {
          userId: 1,
          title: "Synthetic new-status compatibility probe",
          status: "NEW",
          rewardXp: 0,
          rewardCoins: 0,
        },
      });
      id = row.id;
      assert.deepEqual(
        await legacy.todo.findUnique({ where: { id }, select: { id: true, title: true } }),
        { id, title: row.title },
      );
      await assert.rejects(
        legacy.todo.findUnique({ where: { id } }),
        (error) => /NEW/.test(error.message) && /enum/i.test(error.message),
      );
      console.log(
        "A legacy-schema client read original columns but rejected NEW. Old application rollback is not supported; keep guarded compatible writers or maintenance mode.",
      );
    } finally {
      await legacy?.$disconnect();
      if (id) await db.todo.delete({ where: { id } });
      assertOriginalRows(before, await captureInventory(db));
      await db.$disconnect();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
