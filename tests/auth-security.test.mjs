import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accountModules } from "./helpers/accounts.mjs";
const root = new URL("../", import.meta.url);
const modules = accountModules({});
const policy = modules.load("src/lib/owner-policy.ts");
test("owner identity is a mapped internal account, not client provider/email claims", () => {
  assert.equal(policy.isOwnerGithubId("89470930"), true);
  assert.equal(policy.isOwnerSession({ authUserId: 1, role: "OWNER", ownerAccess: true }), true);
  for (const session of [
    null,
    { githubId: "89470930", ownerAccess: true },
    { authUserId: 2, role: "OWNER", ownerAccess: true },
    { authUserId: 1, role: "MEMBER", ownerAccess: true },
  ])
    assert.equal(policy.isOwnerSession(session), false);
});
test("owner guards deny anonymous/members and cross-site writes before domain access", async () => {
  let actor = null;
  const { requireOwner } = accountModules(
    {},
    { "./accounts/access": { getActor: async () => actor } },
  ).load("src/lib/require-owner.ts");
  assert.equal((await requireOwner()).status, 401);
  actor = { id: 2, role: "MEMBER" };
  assert.equal((await requireOwner()).status, 403);
  actor = { id: 1, role: "OWNER" };
  assert.equal(await requireOwner(), null);
  assert.equal(
    (
      await requireOwner(
        new Request("http://localhost/api/test", {
          method: "POST",
          headers: { origin: "https://other.example" },
        }),
      )
    ).status,
    403,
  );
});
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
test("all private API methods deny access before input parsing or data/external calls", async () => {
  const publicPaths = ["/api/auth/", "/api/registration/invite/"];
  let checked = 0;
  for (const file of files(fileURLToPath(new URL("src/app/api", root))).filter(
    (f) => f.endsWith("/route.ts") && !publicPaths.some((p) => f.includes(p)),
  )) {
    const source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const fn of ast.statements.filter(
      (n) =>
        ts.isFunctionDeclaration(n) &&
        ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(n.name?.text),
    )) {
      if (file.endsWith("/api/email/process/route.ts")) {
        assert.match(fn.body.statements[0].getText(ast), /authorizedEmailWorker/);
        continue;
      }
      assert.match(
        fn.body.statements[0].getText(ast),
        /await (requireOwner|requirePermission|getActor)\(/,
        `${file} ${fn.name.text}`,
      );
      for (const status of [401, 403]) {
        const result = {};
        const compiled = ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.CommonJS },
        }).outputText;
        new Function("exports", "require", compiled)(result, (name) => {
          if (name === "@/lib/require-owner")
            return { requireOwner: async () => Response.json({ error: "denied" }, { status }) };
          if (name === "@/lib/accounts/access")
            return {
              getActor: async () => null,
              requirePermission: async () => Response.json({ error: "denied" }, { status }),
            };
          if (name === "@/generated/prisma") return { PrismaClient: class {} };
          if (name === "next/server")
            return { NextResponse: { json: (value, options) => Response.json(value, options) } };
          return {};
        });
        const response = await result[fn.name.text](
          new Request("http://localhost/api/test", { method: fn.name.text }),
          { params: Promise.resolve({ id: "1", subtaskId: "1" }) },
        );
        assert.equal(
          response.status,
          source.includes("await getActor(") ? 401 : status,
          `${file} ${fn.name.text}`,
        );
      }
      checked++;
    }
  }
  assert.ok(checked > 100);
});
test("member pages are guarded and owner pages do not mount a member shell with owner providers", () => {
  const layout = fs.readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /actor\?\.role === "OWNER"/);
  assert.match(layout, /<MemberShell/);
  const member = fs.readFileSync(
    new URL("../src/components/MemberShell.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(member, /InboxProvider|SearchProvider|MusicPlayerProvider|QuickAdd/);
  assert.match(
    fs.readFileSync(new URL("../src/app/japanese/layout.tsx", import.meta.url), "utf8"),
    /JapaneseAccess/,
  );
});
