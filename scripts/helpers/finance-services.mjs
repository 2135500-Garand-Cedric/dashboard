import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function loadFinanceServices(db) {
  const root = fileURLToPath(new URL("../../", import.meta.url)),
    cache = new Map();
  function load(filename) {
    const file = path.resolve(root, filename);
    if (cache.has(file)) return cache.get(file).exports;
    const unit = { exports: {} };
    cache.set(file, unit);
    const native = createRequire(file);
    const require = (name) => {
      if (name === "@/lib/prisma") return { prisma: db };
      if (name.startsWith("@/generated/prisma"))
        return native(path.join(root, "src/generated/prisma/index.js"));
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`));
      return native(name);
    };
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("exports", "require", code)(unit.exports, require);
    return unit.exports;
  }
  return {
    validation: load("src/lib/finance/validation.ts"),
    server: load("src/lib/finance/server.ts"),
    activities: load("src/lib/finance/activity-server.ts"),
    income: load("src/lib/finance/income-server.ts"),
    incomeInput: load("src/lib/finance/income.ts").incomeInput,
    receipts: load("src/lib/finance/receipt-server.ts"),
    receiptInput: load("src/lib/finance/receipts.ts").receiptInput,
    expenses: load("src/lib/finance/expenses.ts"),
    transactions: load("src/lib/finance/transaction-server.ts"),
    transactionInput: load("src/lib/finance/transactions.ts").transactionInput,
    ledger: load("src/lib/finance/matching-ledger.ts"),
    statements: load("src/lib/finance/statement-server.ts"),
    csv: load("src/lib/finance/statement-csv.ts"),
    fixed: load("src/lib/finance/fixed-statement.ts"),
    imports: load("src/lib/finance/statement-imports.ts"),
    files: load("src/lib/finance/receipt-files.ts"),
  };
}
