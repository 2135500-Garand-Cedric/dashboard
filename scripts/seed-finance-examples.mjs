import "dotenv/config";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { seedFinanceExamples } from "./finance-example-data.mjs";

if (process.env.NODE_ENV !== "development") throw new Error("Finance examples may only be loaded in development. Run this command inside the development dashboard container.");
const prisma = new PrismaClient();
try {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const result = await seedFinanceExamples(prisma, { today, root: process.env.FINANCE_UPLOAD_DIR || path.join(process.cwd(), "private/finance") });
  console.log(result.reused ? "Finance example dataset already exists; no records changed." : `Created clearly labelled finance examples: ${result.manifest.accountIds.length} accounts, ${result.manifest.transactionIds.length} transactions, ${result.manifest.receiptIds.length} receipts, ${result.manifest.incomeIds.length} income records, ${result.manifest.importIds.length} imports and ${result.manifest.documentIds.length} private documents.`);
} finally { await prisma.$disconnect(); }
