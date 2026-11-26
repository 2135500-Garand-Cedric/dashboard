import { loadWorkModule } from "./work-support.mjs";
export function financeRefinements(db, Prisma) {
  const deps = { "@/lib/prisma": { prisma: db }, "@/generated/prisma": { Prisma } };
  for (const name of [
    "validation",
    "transactions",
    "reporting",
    "balances",
    "overview",
    "server",
    "receipts",
    "income",
    "reimbursements",
    "reimbursement-server",
    "balance-server",
    "reporting-server",
    "transaction-server",
  ]) {
    deps[`./${name}`] = loadWorkModule(`src/lib/finance/${name}.ts`, deps);
  }
  deps["./income-server"] = {
    incomeSourceSelect: {
      id: true,
      name: true,
      kind: true,
      active: true,
      type: { select: { id: true, name: true, active: true } },
    },
    deductionTypeSelect: { id: true, name: true, active: true },
  };
  deps["./income-settings-server"] = loadWorkModule(
    "src/lib/finance/income-settings-server.ts",
    deps,
  );
  return deps;
}
