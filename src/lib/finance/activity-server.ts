import { auditedCommand } from "@/lib/audit/command";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { FINANCE_USER_ID } from "./server";
import { FinanceValidationError } from "./validation";
import { unlinkSupportingMatches } from "./matching-ledger";
import { removeReceiptFile } from "./receipt-files";

// Delete the user's single activity, including its supporting metadata, in one transaction.
// Imported movements and complex allocations must be corrected, never silently erased.
export async function deleteActivity(id: number, version: string | null) {
  const keys = await prisma.$transaction(
    async (db) => {
      return auditedCommand(
        db,
        {
          model: "financialTransaction",
          category: "FINANCE",
          entityType: "transaction",
          label: "Financial activity",
          id: id,
        },
        async () => {
          const row = await db.financialTransaction.findFirst({
            where: { id, userId: FINANCE_USER_ID, account: { userId: FINANCE_USER_ID } },
            include: {
              reimbursementPlans: true,
              reimbursementsReceived: true,
              reimbursementsPaid: true,
              receipts: { where: { userId: FINANCE_USER_ID } },
              incomeRecords: { where: { userId: FINANCE_USER_ID } },
              importEntries: true,
            },
          });
          if (!row) throw new FinanceValidationError("Financial activity not found.", 404);
          if (
            row.reimbursementPlans.length ||
            row.reimbursementsReceived.length ||
            row.reimbursementsPaid.length
          )
            throw new FinanceValidationError(
              "Unlink reimbursements and remove tracking before deleting this record.",
              409,
            );
          if (!version || Date.parse(version) !== row.updatedAt.getTime())
            throw new FinanceValidationError("This record changed. Reload before deleting.", 409);
          if (row.source !== "MANUAL" || row.importEntries.length)
            throw new FinanceValidationError(
              "This activity is recorded in a statement. Correct its matches instead of deleting bank history.",
              409,
            );
          if (row.transferId) {
            const legs = await db.financialTransaction.findMany({
              where: { transferId: row.transferId, userId: FINANCE_USER_ID },
              include: { importEntries: true },
            });
            const ids = legs.map((leg) => leg.id);
            const linked = await db.financialMatch.count({
              where: {
                userId: FINANCE_USER_ID,
                status: "CONFIRMED",
                OR: [{ transactionId: { in: ids } }, { sourceTransactionId: { in: ids } }],
              },
            });
            if (linked || legs.some((leg) => leg.source !== "MANUAL" || leg.importEntries.length))
              throw new FinanceValidationError(
                "This transfer has statement matches. Correct those matches before deleting.",
                409,
              );
            await db.financialTransfer.delete({
              where: { id: row.transferId, userId: FINANCE_USER_ID },
            });
            return [];
          }
          const receiptIds = row.receipts.map((item) => item.id),
            incomeIds = row.incomeRecords.map((item) => item.id);
          const links = await db.financialMatch.findMany({
            where: {
              userId: FINANCE_USER_ID,
              status: "CONFIRMED",
              OR: [
                { transactionId: id },
                { sourceTransactionId: id },
                { receiptId: { in: receiptIds } },
                { incomeRecordId: { in: incomeIds } },
              ],
            },
          });
          if (
            links.some(
              (link) =>
                link.transactionId !== id ||
                (link.kind !== "RECEIPT" && link.kind !== "INCOME") ||
                (link.receiptId
                  ? !receiptIds.includes(link.receiptId)
                  : !incomeIds.includes(link.incomeRecordId ?? 0)),
            )
          )
            throw new FinanceValidationError(
              "This activity has shared payments or other matching decisions. Correct its matches before deleting.",
              409,
            );
          const documents = await db.financialDocument.findMany({
            where: {
              userId: FINANCE_USER_ID,
              OR: [{ receiptId: { in: receiptIds } }, { incomeRecordId: { in: incomeIds } }],
            },
            select: { id: true, storageKey: true },
          });
          for (const receipt of row.receipts)
            await unlinkSupportingMatches(db, "RECEIPT", receipt.id);
          for (const income of row.incomeRecords)
            await unlinkSupportingMatches(db, "INCOME", income.id);
          await db.financialDocument.deleteMany({
            where: { id: { in: documents.map((item) => item.id) }, userId: FINANCE_USER_ID },
          });
          await db.financialIncomeDeduction.deleteMany({
            where: { incomeRecordId: { in: incomeIds } },
          });
          await db.financialIncomeRecord.deleteMany({
            where: { id: { in: incomeIds }, userId: FINANCE_USER_ID },
          });
          await db.financialReceipt.deleteMany({
            where: { id: { in: receiptIds }, userId: FINANCE_USER_ID },
          });
          await db.financialTransaction.delete({ where: { id, userId: FINANCE_USER_ID } });
          return documents.map((item) => item.storageKey);
        },
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  for (const key of keys) await removeReceiptFile(key);
}

// Notes remain editable even when statement matching protects the financial facts.
export async function saveActivityNotes(id: number, value: unknown, version: string | null) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "notes")
  )
    throw new FinanceValidationError("Provide only the notes field.");
  const notes = (value as { notes?: unknown }).notes;
  if (notes !== null && (typeof notes !== "string" || notes.length > 2000))
    throw new FinanceValidationError("Notes must be at most 2,000 characters.");
  return prisma.$transaction(
    async (db) => {
      return auditedCommand(
        db,
        {
          model: "financialTransaction",
          category: "FINANCE",
          entityType: "transaction",
          label: "Activity notes",
          id: id,
          action: "transaction.notes_changed",
        },
        async () => {
          const row = await db.financialTransaction.findFirst({
            where: { id, userId: FINANCE_USER_ID, account: { userId: FINANCE_USER_ID } },
          });
          if (!row) throw new FinanceValidationError("Financial activity not found.", 404);
          if (!version || Date.parse(version) !== row.updatedAt.getTime())
            throw new FinanceValidationError(
              "This record changed. Reload before saving notes.",
              409,
            );
          const data = {
            notes: typeof notes === "string" ? notes.trim() || null : null,
            updatedAt: new Date(),
          };
          await db.financialTransaction.update({ where: { id, userId: FINANCE_USER_ID }, data });
          await db.financialIncomeRecord.updateMany({
            where: { transactionId: id, userId: FINANCE_USER_ID },
            data,
          });
          await db.financialReceipt.updateMany({
            where: { transactionId: id, userId: FINANCE_USER_ID },
            data,
          });
          return { success: true };
        },
      );
    },
    { isolationLevel: "Serializable" },
  );
}
