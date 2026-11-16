import { PrismaClient } from "../src/generated/prisma/index.js";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadFinanceServices } from "./helpers/finance-services.mjs";

export async function normalizeFinanceData(prisma, { apply = false } = {}) {
  const report = {
    incomeLinked: 0,
    expensesLinked: 0,
    incomeDetailsAdded: 0,
    expenseDetailsAdded: 0,
    exampleAdjustmentsConverted: 0,
    statementsConverted: 0,
    exampleFilesUpdated: 0,
    skipped: [],
  };
  const plans = [],
    changed = [],
    rollback = new Error("FINANCE_NORMALIZATION_PREVIEW");
  try {
    await prisma.$transaction(
      async (db) => {
        const beforeMovements = await db.financialTransaction.findMany({
          where: { userId: 1 },
          select: { id: true, accountId: true, currency: true, amount: true },
        });
        const services = loadFinanceServices({ ...db, $transaction: (callback) => callback(db) });
        const dataset = await db.financialExampleDataset.findUnique({ where: { userId: 1 } });
        const manifest = dataset?.manifest ?? {};
        const exampleAccounts = new Set(manifest.accountIds ?? []),
          exampleIncome = new Set(manifest.incomeIds ?? []),
          exampleReceipts = new Set(manifest.receiptIds ?? []),
          exampleImports = new Set(manifest.importIds ?? []);
        const accountRows = await db.financialAccount.findMany({
          where: { userId: 1 },
          orderBy: { id: "asc" },
        });
        const categories = await db.financeCategory.findMany({ where: { userId: 1 } });
        let sources = await db.financialIncomeSource.findMany({
          where: { userId: 1 },
          orderBy: { id: "asc" },
        });
        async function expenseCategory(existingId, demo) {
          const existing = categories.find(
            (item) => item.id === existingId && item.type === "EXPENSE" && item.active,
          );
          if (existing) return existing;
          const name = demo ? "[Example] Other expenses" : "Other expenses";
          let category = categories.find(
            (item) => item.normalizedName === name.toLowerCase() && item.type === "EXPENSE",
          );
          if (!category) {
            category = await db.financeCategory.create({
              data: { userId: 1, name, normalizedName: name.toLowerCase(), type: "EXPENSE" },
            });
            categories.push(category);
            if (demo) manifest.categoryIds.push(category.id);
          }
          if (!category.active)
            throw new Error(
              "The fallback expense category is inactive; choose a category before normalizing.",
            );
          return category;
        }
        function inferredKind(categoryName) {
          const text = (categoryName ?? "").toLowerCase();
          return /salary|employment/.test(text)
            ? "EMPLOYMENT"
            : /freelance/.test(text)
              ? "FREELANCE"
              : /interest/.test(text)
                ? "INTEREST"
                : /gift/.test(text)
                  ? "GIFT"
                  : /reimburse/.test(text)
                    ? "REIMBURSEMENT"
                    : "OTHER";
        }
        async function incomeSource(transaction) {
          const name = transaction.counterparty?.trim().toLowerCase();
          const exact = sources.find(
            (source) => source.active && source.name.toLowerCase() === name,
          );
          if (exact) return exact;
          const kind = inferredKind(
            categories.find((category) => category.id === transaction.categoryId)?.name,
          );
          const demo = exampleAccounts.has(transaction.accountId);
          let source = sources.find(
            (source) =>
              source.active &&
              source.kind === kind &&
              (manifest.sourceIds ?? []).includes(source.id) === demo,
          );
          if (!source) {
            const fallback = demo ? "[Example] Other income" : "Other income";
            source = sources.find((source) => source.active && source.name === fallback);
            if (!source) {
              const name = sources.some((source) => source.name === fallback)
                ? `${fallback} (converted)`
                : fallback;
              source = await db.financialIncomeSource.create({
                data: { userId: 1, name, normalizedName: name.toLowerCase(), kind: "OTHER" },
              });
              sources.push(source);
              if (demo) manifest.sourceIds.push(source.id);
            }
          }
          return source;
        }
        // Old unmatched examples now create their missing movement. Real records without an account are never guessed.
        const unlinkedIncome = await db.financialIncomeRecord.findMany({
          where: { userId: 1, transactionId: null, matches: { none: { status: "CONFIRMED" } } },
          include: { deductions: true },
        });
        for (const record of unlinkedIncome) {
          const account =
            accountRows.find((account) => account.id === record.accountId) ??
            (exampleIncome.has(record.id)
              ? accountRows.find(
                  (account) =>
                    exampleAccounts.has(account.id) &&
                    account.active &&
                    account.type === "CHEQUING" &&
                    account.currency === record.currency,
                )
              : null);
          if (!account || record.netAmount.isZero() || !record.sourceId) {
            report.skipped.push({
              kind: "income",
              id: record.id,
              reason: "Account, source or positive net amount needs review",
            });
            continue;
          }
          const target = await db.financialTransaction.findMany({
            where: {
              userId: 1,
              accountId: account.id,
              type: "INCOME",
              currency: record.currency,
              amount: record.netAmount,
              occurredOn: record.paidOn,
              incomeRecords: { none: {} },
              matchTargets: { none: { kind: "INCOME", status: "CONFIRMED" } },
            },
          });
          if (target.length > 1) {
            report.skipped.push({
              kind: "income",
              id: record.id,
              reason: "Several possible deposits",
            });
            continue;
          }
          const saved = await services.income.saveIncome(
            services.incomeInput(
              {
                sourceId: record.sourceId,
                description: record.description,
                date: record.paidOn.toISOString().slice(0, 10),
                periodStart: record.periodStart?.toISOString().slice(0, 10) ?? null,
                periodEnd: record.periodEnd?.toISOString().slice(0, 10) ?? null,
                accountId: account.id,
                currency: record.currency,
                grossAmount: record.grossAmount?.toFixed(4) ?? null,
                netAmount: record.netAmount.toFixed(4),
                deductions: record.deductions.map((line) => ({
                  typeId: line.typeId,
                  amount: line.amount.toFixed(4),
                })),
                notes: record.notes,
                transactionAction: target[0] ? "LINK" : "CREATE",
                transactionId: target[0]?.id ?? null,
                acknowledgeMismatch: true,
                expectedUpdatedAt: record.updatedAt.toISOString(),
              },
              true,
            ),
            null,
            record.id,
          );
          if (exampleIncome.has(record.id) && !target[0])
            manifest.transactionIds.push(saved.record.transaction.id);
          report.incomeLinked++;
        }
        const unlinkedReceipts = await db.financialReceipt.findMany({
          where: { userId: 1, transactionId: null, matches: { none: { status: "CONFIRMED" } } },
        });
        for (const record of unlinkedReceipts) {
          if (!record.accountId || !record.categoryId || record.total.isZero()) {
            report.skipped.push({
              kind: "expense",
              id: record.id,
              reason: "Account, category or positive total needs review",
            });
            continue;
          }
          const target = await db.financialTransaction.findMany({
            where: {
              userId: 1,
              accountId: record.accountId,
              type: "EXPENSE",
              currency: record.currency,
              amount: record.total.negated(),
              occurredOn: record.purchasedOn,
              receipts: { none: {} },
              matchTargets: { none: { kind: "RECEIPT", status: "CONFIRMED" } },
            },
          });
          if (target.length > 1) {
            report.skipped.push({
              kind: "expense",
              id: record.id,
              reason: "Several possible payments",
            });
            continue;
          }
          const saved = await services.receipts.saveReceipt(
            services.receiptInput(
              {
                merchant: record.merchant || "Expense",
                date: record.purchasedOn.toISOString().slice(0, 10),
                accountId: record.accountId,
                categoryId: record.categoryId,
                currency: record.currency,
                subtotal: record.subtotal.toFixed(4),
                tax: record.tax.toFixed(4),
                tip: record.tip.toFixed(4),
                total: record.total.toFixed(4),
                notes: record.notes,
                transactionAction: target[0] ? "LINK" : "CREATE",
                transactionId: target[0]?.id ?? null,
                acknowledgeMismatch: true,
                expectedUpdatedAt: record.updatedAt.toISOString(),
              },
              true,
            ),
            null,
            record.id,
          );
          if (exampleReceipts.has(record.id) && !target[0])
            manifest.transactionIds.push(saved.receipt.transaction.id);
          report.expensesLinked++;
        }
        // Simplify only tracked example adjustments, without changing their signed account amounts.
        const adjustments = await db.financialTransaction.findMany({
          where: {
            userId: 1,
            id: { in: manifest.transactionIds ?? [] },
            type: "ADJUSTMENT",
            importEntries: { none: {} },
            matchSources: { none: { status: "CONFIRMED" } },
            matchTargets: { none: { status: "CONFIRMED" } },
          },
        });
        for (const row of adjustments) {
          const expense = row.amount.isNegative(),
            category = expense ? await expenseCategory(null, true) : null;
          await db.financialTransaction.update({
            where: { id: row.id },
            data: {
              type: expense ? "EXPENSE" : "INCOME",
              categoryId: category?.id ?? null,
              description: expense
                ? "[Example] Miscellaneous expense"
                : "[Example] Miscellaneous income",
              contentFingerprint: null,
            },
          });
          report.exampleAdjustmentsConverted++;
        }
        // Attach missing details to existing movements; never create a second movement for these rows.
        const movements = await db.financialTransaction.findMany({
          where: { userId: 1, type: { in: ["INCOME", "EXPENSE"] }, excludedAmount: 0 },
          orderBy: { id: "asc" },
        });
        for (const row of movements) {
          const activity = await services.transactions.getTransaction(row.id),
            demo = exampleAccounts.has(row.accountId);
          if (row.type === "INCOME" && !activity.incomeRecords.length) {
            const source = await incomeSource(row);
            const result = await services.income.saveIncome(
              services.incomeInput({
                sourceId: source.id,
                description: row.description,
                date: row.occurredOn.toISOString().slice(0, 10),
                accountId: row.accountId,
                currency: row.currency,
                grossAmount: null,
                netAmount: row.amount.toFixed(4),
                deductions: [],
                notes: row.notes,
                transactionAction: "LINK",
                transactionId: row.id,
                requestKey: randomUUID(),
              }),
              null,
            );
            if (demo) manifest.incomeIds.push(result.record.id);
            report.incomeDetailsAdded++;
          }
          if (row.type === "EXPENSE" && !activity.receipts.length) {
            const category = await expenseCategory(row.categoryId, demo);
            if (row.categoryId !== category.id)
              await db.financialTransaction.update({
                where: { id: row.id },
                data: { categoryId: category.id },
              });
            const result = await services.receipts.saveReceipt(
              services.receiptInput({
                merchant: (row.counterparty || row.description).slice(0, 200),
                date: row.occurredOn.toISOString().slice(0, 10),
                accountId: row.accountId,
                categoryId: category.id,
                currency: row.currency,
                subtotal: row.amount.abs().toFixed(4),
                tax: "0",
                tip: "0",
                total: row.amount.abs().toFixed(4),
                notes: row.notes,
                transactionAction: "LINK",
                transactionId: row.id,
                requestKey: randomUUID(),
              }),
              null,
            );
            if (demo) manifest.receiptIds.push(result.receipt.id);
            report.expenseDetailsAdded++;
          }
        }
        await db.financialTransaction.updateMany({
          where: { userId: 1, type: "INCOME", categoryId: { not: null } },
          data: { categoryId: null },
        });
        await db.financialIncomeRecord.updateMany({
          where: { userId: 1, categoryId: { not: null } },
          data: { categoryId: null },
        });
        const batches = await db.financialImport.findMany({
          where: { userId: 1 },
          include: { account: true, entries: { orderBy: { rowNumber: "asc" } }, documents: true },
        });
        for (const batch of batches) {
          if (batch.periodStart && batch.periodEnd && batch.matchingOnly) continue;
          const demo = exampleImports.has(batch.id);
          let mapping = batch.mapping;
          if (!mapping) {
            const names = batch.headers.map((name) => String(name).trim().toLowerCase());
            const index = (values) => names.findIndex((name) => values.includes(name));
            const dateColumn = index(["date"]),
              descriptionColumn = index(["description"]),
              amountColumn = index(["amount"]),
              referenceColumn = index(["ref #", "reference", "ref#"]);
            if ([dateColumn, descriptionColumn, amountColumn].some((value) => value < 0)) {
              report.skipped.push({
                kind: "statement",
                id: batch.id,
                reason: "Unknown original columns",
              });
              continue;
            }
            mapping = {
              ...services.fixed.FIXED_STATEMENT_MAPPING,
              dateColumn,
              descriptionColumn,
              amountColumn,
              referenceColumn: referenceColumn < 0 ? null : referenceColumn,
            };
          }
          let projected = batch.entries.map((entry) => ({
            entry,
            review:
              entry.normalized ??
              services.imports.mappedReview(
                entry.originalData.cells,
                mapping,
                batch.account.currency,
              ),
          }));
          if (demo && batch.status === "DRAFT") {
            const choices = await db.financialTransaction.findMany({
              where: {
                userId: 1,
                accountId: batch.accountId,
                excludedAmount: 0,
                type: { in: ["EXPENSE", "INCOME", "TRANSFER"] },
              },
              orderBy: [{ occurredOn: "desc" }, { id: "asc" }],
              take: batch.entries.length,
            });
            if (choices.length !== batch.entries.length)
              throw new Error("Not enough example movements to refresh the draft statement.");
            projected = projected.map(({ entry }, i) => ({
              entry,
              review: {
                ...services.fixed.fixedReview(
                  [
                    choices[i].occurredOn.toISOString().slice(0, 10),
                    `example-${choices[i].id}`,
                    choices[i].description,
                    choices[i].amount.toFixed(4),
                  ],
                  batch.account.currency,
                ),
                type: choices[i].type,
              },
            }));
          }
          const dates = projected
            .map(({ review }) => review.date)
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
            .sort();
          if (dates.length !== projected.length || !dates.length) {
            report.skipped.push({
              kind: "statement",
              id: batch.id,
              reason: "Dates require review",
            });
            continue;
          }
          const from = dates[0],
            to = dates.at(-1);
          if (demo && batch.status === "COMPLETED") {
            for (const item of projected) {
              if (item.entry.transactionId) continue;
              const referenceId = /^example-(\d+)$/.exec(item.review.reference ?? "")?.[1];
              const candidates = await db.financialTransaction.findMany({
                where: {
                  userId: 1,
                  accountId: batch.accountId,
                  currency: batch.account.currency,
                  amount: item.review.amount,
                  occurredOn: new Date(`${item.review.date}T00:00:00Z`),
                  ...(referenceId
                    ? { id: Number(referenceId) }
                    : { description: item.review.description }),
                },
              });
              if (candidates.length !== 1)
                throw new Error("A completed example statement has an ambiguous missing match.");
              item.entry.transactionId = candidates[0].id;
            }
          }
          for (const { entry, review } of projected) {
            const cells = [review.date, review.reference || "", review.description, review.amount];
            const normalized = {
              ...services.fixed.fixedReview(cells, batch.account.currency),
              type:
                review.type === "TRANSFER"
                  ? "TRANSFER"
                  : review.amount.startsWith("-")
                    ? "EXPENSE"
                    : "INCOME",
              matchId: batch.status === "COMPLETED" ? entry.transactionId : null,
            };
            await db.financialImportEntry.update({
              where: { id: entry.id },
              data: {
                ...(demo ? { originalData: { line: (entry.rowNumber ?? 1) + 1, cells } } : {}),
                normalized,
                action: "MATCH",
              },
            });
            if (batch.status === "COMPLETED" && entry.transactionId)
              await services.ledger.writeMatch(db, {
                kind: "STATEMENT",
                sourceId: entry.id,
                transactionId: entry.transactionId,
                amount: review.amount.replace(/^-/, ""),
                currency: batch.account.currency,
                status: "CONFIRMED",
                snapshot: {
                  label: review.description,
                  date: review.date,
                  accountId: batch.accountId,
                  signedAmount: review.amount,
                  amount: review.amount.replace(/^-/, ""),
                  currency: batch.account.currency,
                  origin: "redesign-normalization",
                },
                action: "CONFIRM",
                note: "Existing statement association retained in the matching-only workflow",
              });
          }
          let fileData = demo
            ? {
                headers: ["date", "ref #", "description", "amount"],
                mapping: services.fixed.FIXED_STATEMENT_MAPPING,
              }
            : {};
          if (demo && batch.documents.length) {
            const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
            const buffer = Buffer.from(
              [
                ["date", "ref #", "description", "amount"],
                ...projected.map(({ review }) => [
                  review.date,
                  review.reference || "",
                  review.description,
                  review.amount,
                ]),
              ]
                .map((cells) => cells.map(quote).join(","))
                .join("\r\n") + "\r\n",
            );
            const hash = createHash("sha256").update(buffer).digest("hex");
            for (const document of batch.documents) {
              const filename = services.files.receiptStoragePath(document.storageKey);
              plans.push({ filename, before: await readFile(filename), after: buffer });
              await db.financialDocument.update({
                where: { id: document.id },
                data: { byteSize: buffer.length, contentHash: hash },
              });
            }
            fileData = {
              fingerprint: hash,
              byteSize: buffer.length,
              headers: ["date", "ref #", "description", "amount"],
              mapping: services.fixed.FIXED_STATEMENT_MAPPING,
            };
            report.exampleFilesUpdated++;
          }
          await db.financialImport.update({
            where: { id: batch.id },
            data: {
              ...fileData,
              mapping: fileData.mapping ?? mapping,
              periodStart: new Date(`${from}T00:00:00Z`),
              periodEnd: new Date(`${to}T00:00:00Z`),
              matchingOnly: true,
              revision: { increment: 1 },
            },
          });
          report.statementsConverted++;
        }
        if (dataset)
          await db.financialExampleDataset.update({ where: { userId: 1 }, data: { manifest } });
        const afterMovements = new Map(
          (
            await db.financialTransaction.findMany({
              where: { userId: 1 },
              select: { id: true, accountId: true, currency: true, amount: true },
            })
          ).map((row) => [row.id, row]),
        );
        for (const original of beforeMovements) {
          const current = afterMovements.get(original.id);
          if (
            !current ||
            current.accountId !== original.accountId ||
            current.currency !== original.currency ||
            !current.amount.equals(original.amount)
          )
            throw new Error("Conversion would change an existing account movement; rolled back.");
        }
        if (apply && report.skipped.length)
          throw new Error(
            "Some records require review. Run without --apply to inspect the rollback preview.",
          );
        if (!apply) throw rollback;
        for (const plan of plans) {
          const temp = `${plan.filename}.${randomUUID()}.tmp`;
          await writeFile(temp, plan.after, { mode: 0o600 });
          await rename(temp, plan.filename);
          changed.push(plan);
        }
      },
      { isolationLevel: "Serializable", timeout: 120000 },
    );
  } catch (error) {
    for (const plan of changed) await writeFile(plan.filename, plan.before, { mode: 0o600 });
    if (error !== rollback) throw error;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV !== "development")
    throw new Error("Run this conversion only in the development app container.");
  const apply = process.argv.includes("--apply"),
    backup = process.argv.find((arg) => arg.startsWith("--backup="))?.slice(9);
  if (apply && (!backup || !(await stat(backup)).size))
    throw new Error(
      "Create a complete database backup and pass --backup=/path/to/database.dump before applying.",
    );
  const prisma = new PrismaClient();
  try {
    console.log(
      JSON.stringify(
        { applied: apply, ...(await normalizeFinanceData(prisma, { apply })) },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      error instanceof Error && !error.name.startsWith("Prisma")
        ? error.message
        : "Database conversion failed; no records were committed.",
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
