import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
test(
  "live APIs reject anonymous and forged sessions, isolate members and retain owner access",
  { skip: process.env.RUN_AUTH_HTTP_TEST !== "1", timeout: 600000 },
  async () => {
    assert.notEqual(process.env.NODE_ENV, "production", "Run this test only in local development.");
    const { PrismaClient } = await import("../src/generated/prisma/index.js");
    const db = new PrismaClient();
    const hashes = [];
    let member;
    const cookie = async (userId) => {
      const token = randomBytes(32).toString("base64url"),
        tokenHash = createHash("sha256").update(token).digest("hex");
      hashes.push(tokenHash);
      await db.authSession.create({
        data: { userId, tokenHash, expires: new Date(Date.now() + 900000) },
      });
      return `next-auth.session-token=${token}`;
    };
    const base = "http://localhost:3000",
      apiRoot = fileURLToPath(new URL("../src/app/api", import.meta.url));
    try {
      member = await db.user.create({
        data: {
          name: "Temporary authorization fixture",
          timeZone: "UTC",
          initialization: { create: { choice: "EMPTY" } },
          permissions: {
            create: [
              "japanese.vocabulary.read",
              "japanese.practice",
              "japanese.statistics.read",
              "japanese.history.read",
            ].map((capability) => ({ capability })),
          },
        },
      });
      const memberCookie = await cookie(member.id),
        ownerCookie = await cookie(1);
      let checked = 0;
      for (const file of files(apiRoot).filter(
        (f) =>
          f.endsWith("/route.ts") &&
          !f.includes("/api/auth/") &&
          !f.includes("/api/registration/invite/"),
      )) {
        const endpoint = `/api/${path.relative(apiRoot, path.dirname(file)).replace(/\[[^\]]+\]/g, "1")}`;
        const source = fs.readFileSync(file, "utf8"),
          ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        for (const fn of ast.statements.filter(
          (n) =>
            ts.isFunctionDeclaration(n) &&
            ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(n.name?.text),
        )) {
          const request = { method: fn.name.text, signal: AbortSignal.timeout(30000) };
          assert.equal(
            (await fetch(base + endpoint, request)).status,
            401,
            `anonymous ${fn.name.text} ${endpoint}`,
          );
          if (
            !endpoint.startsWith("/api/japanese-practice/") &&
            !endpoint.startsWith("/api/account") &&
            !endpoint.startsWith("/api/onboarding") &&
            !endpoint.startsWith("/api/email/process")
          )
            assert.equal(
              (await fetch(base + endpoint, { ...request, headers: { cookie: memberCookie } }))
                .status,
              403,
              `member ${fn.name.text} ${endpoint}`,
            );
          checked++;
          if (checked % 25 === 0) console.log(`Checked ${checked} handlers so far.`);
        }
      }
      assert.ok(checked > 150);
      assert.equal(
        (
          await fetch(base + "/api/events", {
            headers: { cookie: "next-auth.session-token=forged-owner-claims" },
          })
        ).status,
        401,
      );
      for (const endpoint of [
        "/api/japanese-practice/vocabulary",
        "/api/finance/accounts",
        "/api/admin/users",
      ])
        assert.equal(
          (await fetch(base + endpoint, { headers: { cookie: ownerCookie } })).status,
          200,
          endpoint,
        );
      const words = await (
        await fetch(base + "/api/japanese-practice/vocabulary", {
          headers: { cookie: memberCookie },
        })
      ).json();
      assert.deepEqual(words, []);
      const today = await (
        await fetch(base + "/api/japanese-practice/practices", {
          headers: { cookie: memberCookie },
        })
      ).json();
      assert.deepEqual(today.practices, []);
      await db.user.update({ where: { id: member.id }, data: { active: false } });
      assert.equal(
        (
          await fetch(base + "/api/japanese-practice/vocabulary", {
            headers: { cookie: memberCookie },
          })
        ).status,
        401,
      );
      console.log(`Checked ${checked} live API handlers; member and forged-cookie probes passed.`);
    } finally {
      await db.authSession.deleteMany({ where: { tokenHash: { in: hashes } } });
      if (member) {
        await db.auditEvent.deleteMany({ where: { userId: member.id } });
        await db.user.delete({ where: { id: member.id } });
      }
      await db.$disconnect();
    }
  },
);
