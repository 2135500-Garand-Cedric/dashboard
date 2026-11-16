import { Prisma } from "@/generated/prisma";
import { FINANCE_USER_ID } from "./server";
import { FinanceValidationError } from "./validation";
import { transactionInput } from "./transactions";
import { saveTransactionInDb } from "./transaction-server";
import { unlinkSupportingMatches } from "./reconciliation-ledger";

// A unified record may update its own manual movement, never bank history or shared payments.
export async function syncActivityMovement(
  db: Prisma.TransactionClient,
  kind: "INCOME" | "RECEIPT",
  recordId: number | null,
  transactionId: number,
  next: {
    amount: string;
    allowDuplicate?: boolean;
    accountId: number;
    currency: string;
    date: string;
    description: string;
    categoryId: number | null;
    counterparty: string | null;
    notes: string | null;
  },
) {
  const row = await db.financialTransaction.findFirst({
    where: { id: transactionId, userId: FINANCE_USER_ID },
    include: { importEntries: true, receipts: true, incomeRecords: true },
  });
  if (!row || row.type !== (kind === "INCOME" ? "INCOME" : "EXPENSE"))
    throw new FinanceValidationError("Choose the corresponding income or expense.");
  const sameMoney =
    row.accountId === next.accountId &&
    row.currency === next.currency &&
    row.amount.abs().equals(next.amount);
  if (row.source !== "MANUAL" || row.importEntries.length || !row.excludedAmount.isZero()) {
    if (!sameMoney)
      throw new FinanceValidationError(
        "A statement-linked amount, currency or account cannot be changed here. Correct its matching decision instead.",
        409,
      );
    if (kind === "RECEIPT" && row.categoryId !== next.categoryId) {
      await db.financialTransaction.update({
        where: { id: row.id, userId: FINANCE_USER_ID },
        data: { categoryId: next.categoryId },
      });
    }
    return;
  }
  const unchanged =
    sameMoney &&
    row.occurredOn.toISOString().slice(0, 10) === next.date &&
    row.description === next.description &&
    row.notes === next.notes &&
    row.counterparty === next.counterparty &&
    row.categoryId === next.categoryId;
  if (unchanged) return;
  const shared =
    kind === "INCOME"
      ? row.incomeRecords.some((item) => item.id !== recordId) || row.receipts.length > 0
      : row.receipts.some((item) => item.id !== recordId) || row.incomeRecords.length > 0;
  const links = await db.financialMatch.findMany({
    where: {
      userId: FINANCE_USER_ID,
      status: "CONFIRMED",
      OR: [{ transactionId }, { sourceTransactionId: transactionId }],
    },
  });
  if (
    shared ||
    links.some(
      (link) =>
        link.kind !== kind ||
        (kind === "INCOME" ? link.incomeRecordId !== recordId : link.receiptId !== recordId),
    )
  ) {
    if (!sameMoney)
      throw new FinanceValidationError(
        "This record has shared payments. Correct its matches before changing the amount, account or currency.",
        409,
      );
    return;
  }
  if (recordId) await unlinkSupportingMatches(db, kind, recordId);
  await saveTransactionInDb(
    db,
    transactionInput(
      {
        ...next,
        type: row.type,
        allowDuplicate:
          next.allowDuplicate ||
          (sameMoney &&
            row.occurredOn.toISOString().slice(0, 10) === next.date &&
            row.description === next.description &&
            row.counterparty === next.counterparty),
        expectedUpdatedAt: row.updatedAt.toISOString(),
      },
      true,
    ),
    row.id,
  );
}
