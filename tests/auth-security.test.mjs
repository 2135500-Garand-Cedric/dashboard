import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

const root = new URL("../", import.meta.url);
function load(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) => {
    assert.ok(name in dependencies, `Missing dependency ${name} for ${file}`);
    return dependencies[name];
  });
  return exports;
}
const policy = load("src/lib/owner-policy.ts", {});
const { authOptions } = load("src/lib/auth.ts", {
  "next-auth/providers/github": { default: (options) => options }, "./owner-policy": policy,
});
const json = { json: (data, options) => Response.json(data, options) };
const owner = { githubId: policy.OWNER_GITHUB_ID, ownerAccess: true };
let session;
const { requireOwner } = load("src/lib/require-owner.ts", {
  "next-auth/next": { getServerSession: async () => session },
  "next/server": { NextResponse: json }, "./auth": { authOptions }, "./owner-policy": policy,
});

test("only the pinned GitHub identity is allowed, regardless of email or username", async () => {
  const account = { provider: "github", providerAccountId: policy.OWNER_GITHUB_ID };
  const profile = { id: Number(policy.OWNER_GITHUB_ID), login: "renamed-owner" };
  assert.equal(await authOptions.callbacks.signIn({ account, profile }), true);
  for (const attempt of [
    { account: { ...account, providerAccountId: "123" }, profile: { id: 123, email: "cedricgarand@hotmail.com", login: "2135500-Garand-Cedric" } },
    { account, profile: { id: 123 } },
    { account: { ...account, provider: "credentials" }, profile },
    { account: null, profile },
  ]) assert.equal(await authOptions.callbacks.signIn(attempt), "/access-denied");
});

test("owner session requires current server-issued GitHub claims; legacy and forged update data grant no access", async () => {
  const callbacks = authOptions.callbacks;
  const token = await callbacks.jwt({ token: {}, account: { provider: "github", providerAccountId: policy.OWNER_GITHUB_ID } });
  const allowed = await callbacks.session({ session: {}, token });
  assert.equal(policy.isOwnerSession(allowed), true);
  for (const invalid of [{ email: "cedricgarand@hotmail.com" }, { ...token, githubId: "123" }, { ...token, provider: "credentials" }, { ...token, ownerAuthVersion: 0 }]) {
    const updated = await callbacks.jwt({ token: invalid, trigger: "update", session: owner });
    assert.equal(policy.isOwnerSession(await callbacks.session({ session: {}, token: updated })), false);
  }
});

test("API authorization denies anonymous/non-owner sessions and cross-site writes", async () => {
  session = null;
  assert.equal((await requireOwner()).status, 401);
  session = { githubId: "123", ownerAccess: true };
  assert.equal((await requireOwner()).status, 403);
  session = { githubId: policy.OWNER_GITHUB_ID, ownerAccess: false };
  assert.equal((await requireOwner()).status, 403);
  session = owner;
  assert.equal(await requireOwner(), null);
  const previous = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = "https://dashboard.example";
  try {
    assert.equal((await requireOwner(new Request("https://dashboard.example/api/events", { method: "POST", headers: { origin: "https://other.example" } }))).status, 403);
    assert.equal(await requireOwner(new Request("https://dashboard.example/api/events", { method: "POST", headers: { origin: "https://dashboard.example" } })), null);
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previous;
  }
});

function files(directory) {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? files(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}

test("every data API handler denies access before executing database or external-service work", async () => {
  const apiRoot = new URL("src/app/api", root);
  let handlers = 0;
  for (const file of files(apiRoot).filter((file) => file.endsWith("/route.ts") && !file.includes("/api/auth/"))) {
    const source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const methods = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(node.name?.text));
    for (const method of methods) {
      assert.match(method.body.statements[0].getText(ast), /await requireOwner\(/, `${file} ${method.name.text} must authenticate first`);
      const context = { params: Promise.resolve({ id: "1", subtaskId: "1" }) };
      for (const status of [401, 403]) {
        const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
        const exported = {};
        new Function("exports", "require", code)(exported, (name) => {
          if (name === "@/lib/require-owner") return { requireOwner: async () => Response.json({ error: "denied" }, { status }) };
          if (name === "next/server") return { NextResponse: json };
          if (name === "@/generated/prisma") return { PrismaClient: class {} };
          return {};
        });
        const response = await exported[method.name.text](new Request("http://localhost/api/test", { method: method.name.text }), context);
        assert.equal(response.status, status, `${file} ${method.name.text}`);
      }
      handlers += 1;
    }
  }
  assert.ok(handlers >= 43);
});

test("all private page branches use the protected shell; the denial page does not fetch private data", () => {
  const appRoot = new URL("src/app", root);
  for (const file of files(appRoot).filter((file) => file.endsWith("/page.tsx") && !file.endsWith("/access-denied/page.tsx"))) {
    let current = path.dirname(file);
    let protectedPage = fs.readFileSync(file, "utf8").includes("ProtectedLayout");
    while (!protectedPage && current !== path.dirname(new URL(appRoot).pathname)) {
      const layout = path.join(current, "layout.tsx");
      if (fs.existsSync(layout)) protectedPage = fs.readFileSync(layout, "utf8").includes("ProtectedLayout");
      current = path.dirname(current);
    }
    assert.equal(protectedPage, true, file);
  }
  const denied = fs.readFileSync(new URL("src/app/access-denied/page.tsx", root), "utf8");
  assert.match(denied, /You cannot use this app/);
  assert.doesNotMatch(denied, /fetch\(|prisma|MusicPlayerProvider/);
});

test("the persistent root shell is rendered only for the owner", async () => {
  function AppShell() {}
  const { default: RootLayout } = load("src/app/layout.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/font/google": { Geist: () => ({ variable: "sans" }), Geist_Mono: () => ({ variable: "mono" }) },
    "next-auth/next": { getServerSession: async () => session },
    "@/components/AppShell": { default: AppShell },
    "@/lib/auth": { authOptions },
    "@/lib/owner-policy": policy,
    "./globals.css": {},
  });
  const children = "page content";
  for (const deniedSession of [null, { githubId: "123", ownerAccess: true }]) {
    session = deniedSession;
    const layout = await RootLayout({ children });
    assert.equal(layout.props.children.props.children, children, "public pages must not mount providers that fetch private data");
  }
  session = owner;
  const layout = await RootLayout({ children });
  const shell = layout.props.children.props.children;
  assert.equal(shell.type, AppShell);
  assert.equal(shell.props.children, children);
  // Section gates still authenticate on navigation, without recreating the shell.
  const { default: ProtectedLayout } = load("src/components/ProtectedLayout.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next-auth/next": { getServerSession: async () => session },
    "next/navigation": { redirect: (path) => { throw new Error(path); } },
    "@/lib/auth": { authOptions },
    "@/lib/owner-policy": policy,
  });
  assert.equal((await ProtectedLayout({ children })).type, jsxRuntime.Fragment);
  session = null;
  await assert.rejects(ProtectedLayout({ children }), /\/api\/auth\/signin/);
  session = { githubId: "123", ownerAccess: true };
  await assert.rejects(ProtectedLayout({ children }), /\/access-denied/);
});
