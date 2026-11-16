import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "generated") return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.[jt]sx?$/.test(file) && !file.endsWith(".d.ts")
        ? [file]
        : [];
  });
}
function resolveImport(from, value) {
  const base = value.startsWith("@/")
    ? path.join(root, "src", value.slice(2))
    : value.startsWith(".")
      ? path.resolve(path.dirname(from), value)
      : null;
  if (!base) return null;
  return [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"].map((suffix) => base + suffix),
  ].find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
}
test("all handwritten source modules are reachable from Next.js entry points", () => {
  const files = sourceFiles(path.join(root, "src")),
    graph = new Map();
  for (const file of files) {
    const dependencies = [];
    const ast = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function inspect(node) {
      const argument =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) &&
              (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === "require"))
            ? node.arguments[0]
            : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
              ? node.argument.literal
              : null;
      if (argument && ts.isStringLiteral(argument)) {
        const dependency = resolveImport(file, argument.text);
        if (dependency) dependencies.push(dependency);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(ast);
    graph.set(file, dependencies);
  }
  const entryNames = new Set([
    "page",
    "route",
    "layout",
    "error",
    "loading",
    "not-found",
    "default",
    "template",
    "global-error",
    "middleware",
    "instrumentation",
    "instrumentation-client",
  ]);
  const reached = new Set();
  function visit(file) {
    if (reached.has(file)) return;
    reached.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
  }
  for (const file of files) {
    const name = path.basename(file).split(".")[0];
    if (
      entryNames.has(name) &&
      (file.includes(`${path.sep}src${path.sep}app${path.sep}`) ||
        ["middleware", "instrumentation", "instrumentation-client"].includes(name))
    )
      visit(file);
  }
  assert.deepEqual(
    files.filter((file) => !reached.has(file)).map((file) => path.relative(root, file)),
    [],
    "Remove unused source modules or explicitly connect their intended entry point.",
  );
});
