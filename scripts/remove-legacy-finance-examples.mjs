import { PrismaClient, Prisma } from "../src/generated/prisma/index.js";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadFinanceServices } from "./helpers/finance-services.mjs";

export async function removeLegacyFinanceExamples(prisma, { apply = false } = {}) {
  let report;
  const rollback = new Error("PREVIEW_LEGACY_FINANCE_CLEANUP");
  const fileKeys = [];
  try {
    await prisma.$transaction(
      async (db) => {
        const dataset = await db.financialExampleDataset.findUnique({ where: { userId: 1 } });
        if (!dataset) throw new Error("No tracked development finance examples found.");
        const manifest = dataset.manifest;
        const rows = await db.financialTransaction.findMany({
          where: { userId: 1, source: "IMPORTED", id: { in: manifest.transactionIds ?? [] } },
        });
        const ids = rows.map((row) => row.id),
          removed = new Set(ids);
        if (rows.some((row) => row.transferId))
          throw new Error("Transfer examples require separate pair review.");
        const before = await db.financialTransaction.findMany({
          where: { userId: 1, id: { notIn: ids } },
          select: { id: true, accountId: true, amount: true, currency: true },
        });
        const { ledger } = loadFinanceServices({ ...db, $transaction: (callback) => callback(db) });
        const links = await db.financialMatch.findMany({
          where: {
            userId: 1,
            status: "CONFIRMED",
            OR: [{ transactionId: { in: ids } }, { sourceTransactionId: { in: ids } }],
          },
        });
        for (const link of links) {
          const sourceId =
            link.receiptId ?? link.incomeRecordId ?? link.sourceTransactionId ?? link.importEntryId;
          if (!sourceId || !link.transactionId)
            throw new Error("An incomplete matching decision requires review.");
          await ledger.writeMatch(db, {
            kind: link.kind,
            sourceId,
            transactionId: link.transactionId,
            amount: link.amount.toFixed(4),
            currency: link.currency,
            status: "UNLINKED",
            snapshot: link.sourceSnapshot,
            action: "UNLINK",
            note: "Removed obsolete imported development example; original facts retained in backup and audit.",
          });
        }
        const entries = await db.financialImportEntry.findMany({
          where: { import: { userId: 1 } },
        });
        let clearedRows = 0;
        for (const entry of entries) {
          const review = entry.normalized;
          if (!removed.has(entry.transactionId) && !removed.has(review?.matchId)) continue;
          await db.financialImportEntry.update({
            where: { id: entry.id },
            data: {
              transactionId: null,
              ...(review ? { normalized: { ...review, matchId: null } } : {}),
            },
          });
          await db.financialImport.update({
            where: { id: entry.importId },
            data: { revision: { increment: 1 } },
          });
          clearedRows++;
        }
        const receipts = await db.financialReceipt.findMany({
          where: { userId: 1, transactionId: { in: ids }, id: { in: manifest.receiptIds ?? [] } },
          include: { matches: { where: { status: "CONFIRMED" } } },
        });
        const income = await db.financialIncomeRecord.findMany({
          where: { userId: 1, transactionId: { in: ids }, id: { in: manifest.incomeIds ?? [] } },
          include: { matches: { where: { status: "CONFIRMED" } } },
        });
        const receiptIds = receipts.filter((row) => !row.matches.length).map((row) => row.id),
          incomeIds = income.filter((row) => !row.matches.length).map((row) => row.id);
        const documents = await db.financialDocument.findMany({
          where: {
            userId: 1,
            OR: [{ receiptId: { in: receiptIds } }, { incomeRecordId: { in: incomeIds } }],
          },
        });
        if (documents.some((doc) => !(manifest.documentIds ?? []).includes(doc.id)))
          throw new Error(
            "An untracked document is attached to an old example. Review before deletion.",
          );
        await db.financialDocument.deleteMany({
          where: { userId: 1, id: { in: documents.map((doc) => doc.id) } },
        });
        fileKeys.push(...documents.map((doc) => doc.storageKey));
        await db.financialReceipt.deleteMany({ where: { userId: 1, id: { in: receiptIds } } });
        await db.financialIncomeRecord.deleteMany({ where: { userId: 1, id: { in: incomeIds } } });
        await db.financialTransaction.deleteMany({ where: { userId: 1, id: { in: ids } } });
        // Release exclusions whose imported target was deleted; money on every retained record stays intact.
        const remaining = await db.financialTransaction.findMany({ where: { userId: 1 } });
        const duplicateLinks = await db.financialMatch.findMany({
          where: { userId: 1, kind: "DUPLICATE", status: "CONFIRMED" },
        });
        for (const row of remaining) {
          const source =
            row.transferId && row.amount.isPositive()
              ? remaining.find(
                  (peer) => peer.transferId === row.transferId && peer.amount.isNegative(),
                )
              : row;
          const excluded = duplicateLinks
            .filter((link) => link.sourceTransactionId === source?.id)
            .reduce((sum, link) => sum.plus(link.amount), new Prisma.Decimal(0));
          if (!row.excludedAmount.equals(excluded))
            await db.financialTransaction.update({
              where: { id: row.id },
              data: { excludedAmount: excluded },
            });
        }
        for (const original of before) {
          const current = remaining.find((row) => row.id === original.id);
          if (
            !current ||
            current.accountId !== original.accountId ||
            current.currency !== original.currency ||
            !current.amount.equals(original.amount)
          )
            throw new Error("A retained record changed; cleanup rolled back.");
        }
        manifest.transactionIds = manifest.transactionIds.filter((id) => !removed.has(id));
        manifest.receiptIds = manifest.receiptIds.filter((id) => !receiptIds.includes(id));
        manifest.incomeIds = manifest.incomeIds.filter((id) => !incomeIds.includes(id));
        manifest.documentIds = manifest.documentIds.filter(
          (id) => !documents.some((doc) => doc.id === id),
        );
        manifest.storageKeys = manifest.storageKeys.filter((key) => !fileKeys.includes(key));
        await db.financialExampleDataset.update({ where: { userId: 1 }, data: { manifest } });
        report = {
          removed: rows.length,
          byType: rows.reduce(
            (counts, row) => ({ ...counts, [row.type]: (counts[row.type] ?? 0) + 1 }),
            {},
          ),
          receiptsRemoved: receiptIds.length,
          incomeDetailsRemoved: incomeIds.length,
          documentsRemoved: documents.length,
          statementRowsUnmatched: clearedRows,
          decisionsUnlinked: links.length,
        };
        if (!apply) throw rollback;
      },
      { isolationLevel: "Serializable", timeout: 120000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (apply) {
    const { files } = loadFinanceServices(prisma);
    for (const key of fileKeys) await files.removeReceiptFile(key);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV !== "development") throw new Error("Run only in the development app.");
  const apply = process.argv.includes("--apply"),
    backup = process.argv.find((arg) => arg.startsWith("--backup="))?.slice(9);
  if (apply && (!backup || !(await stat(backup)).size))
    throw new Error("Pass the existing whole-database backup with --backup= before applying.");
  const db = new PrismaClient();
  try {
    console.log(
      JSON.stringify(
        { applied: apply, ...(await removeLegacyFinanceExamples(db, { apply })) },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      error.name?.startsWith("Prisma")
        ? "Cleanup failed and rolled back. No data was committed."
        : error.message,
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
