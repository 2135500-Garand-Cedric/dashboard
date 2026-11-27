import { auditRecordChange } from "@/lib/audit/server";
import { prisma } from "@/lib/prisma";
import { FINANCE_USER_ID, accountSelect } from "./server";
import { FinanceValidationError } from "./validation";
import { accountBalance, balanceInput, type AccountBalance } from "./balances";
import { reportingToday } from "./reporting";

export async function listBalances(): Promise<{ balances: AccountBalance[] }> {
  const today = reportingToday();
  return prisma.$transaction(
    async (db) => {
      const accounts = await db.financialAccount.findMany({
        where: { userId: FINANCE_USER_ID },
        select: {
          ...accountSelect,
          balanceRevision: true,
          balances: {
            where: { userId: FINANCE_USER_ID, date: { lte: new Date(today) } },
            orderBy: { date: "desc" },
            take: 1,
          },
        },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      });
      const movements = await db.financialTransaction.findMany({
        where: {
          userId: FINANCE_USER_ID,
          account: { userId: FINANCE_USER_ID },
          occurredOn: { lte: new Date(today) },
        },
        select: {
          accountId: true,
          occurredOn: true,
          amount: true,
          excludedAmount: true,
          currency: true,
        },
      });
      return {
        balances: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          currency: account.currency,
          active: account.active,
          revision: account.balanceRevision,
          asOf: today,
          ...accountBalance(
            movements
              .filter((row) => row.accountId === account.id && row.currency === account.currency)
              .map((row) => ({
                date: row.occurredOn.toISOString().slice(0, 10),
                amount: row.amount.toFixed(4),
                excludedAmount: row.excludedAmount.toFixed(4),
              })),
            account.balances.map((row) => ({
              date: row.date.toISOString().slice(0, 10),
              amount: row.amount.toFixed(4),
              ledgerAmount: row.ledgerAmount.toFixed(4),
            })),
            today,
          ),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function setAccountBalance(id: number, value: unknown) {
  const input = balanceInput(value, reportingToday());
  return prisma.$transaction(
    async (db) => {
      const account = await db.financialAccount.findFirst({
        where: { id, userId: FINANCE_USER_ID },
      });
      if (!account) throw new FinanceValidationError("Account not found.", 404);
      const result = await db.financialAccount.updateMany({
        where: { id, userId: FINANCE_USER_ID, balanceRevision: input.expectedRevision },
        data: { balanceRevision: { increment: 1 } },
      });
      if (!result.count)
        throw new FinanceValidationError("The balance changed. Reload and try again.", 409);
      const date = new Date(input.date);
      const latest = await db.financialAccountBalance.findFirst({
        where: { accountId: id, userId: FINANCE_USER_ID },
        orderBy: { date: "desc" },
      });
      if (latest && latest.date > date)
        throw new FinanceValidationError(
          "Choose a date on or after the latest balance correction.",
        );
      const movements = await db.financialTransaction.findMany({
        where: {
          accountId: id,
          userId: FINANCE_USER_ID,
          currency: account.currency,
          occurredOn: { lte: date },
        },
      });
      const ledgerAmount = accountBalance(
        movements.map((row) => ({
          date: input.date,
          amount: row.amount.toFixed(4),
          excludedAmount: row.excludedAmount.toFixed(4),
        })),
        [],
        input.date,
      ).amount;
      const previousBalance = accountBalance(
        movements.map((row) => ({
          date: row.occurredOn.toISOString().slice(0, 10),
          amount: row.amount.toFixed(4),
          excludedAmount: row.excludedAmount.toFixed(4),
        })),
        latest
          ? [
              {
                date: latest.date.toISOString().slice(0, 10),
                amount: latest.amount.toFixed(4),
                ledgerAmount: latest.ledgerAmount.toFixed(4),
              },
            ]
          : [],
        input.date,
      ).amount;
      const checkpoint = await db.financialAccountBalance.upsert({
        where: { accountId_date: { accountId: id, date } },
        create: {
          userId: FINANCE_USER_ID,
          accountId: id,
          date,
          amount: input.amount,
          ledgerAmount,
        },
        update: { amount: input.amount, ledgerAmount },
      });
      await auditRecordChange(
        db,
        {
          category: "FINANCE",
          entityType: "balance",
          entityId: checkpoint.id,
          action: "balance.corrected",
          entityReference: `Account #${id}`,
          summary: "Account balance corrected",
          eventKey: `balance:${id}:${input.expectedRevision + 1}`,
          related: [{ type: "account", id }],
        },
        {
          currentBalance: previousBalance,
          closingBalance: latest?.amount ?? null,
          previousClosingDate: latest?.date?.toISOString().slice(0, 10) ?? null,
          date: input.date,
          currency: account.currency,
        },
        {
          currentBalance: checkpoint.amount,
          closingBalance: checkpoint.amount,
          previousClosingDate: latest?.date?.toISOString().slice(0, 10) ?? null,
          date: input.date,
          currency: account.currency,
          balanceRevision: input.expectedRevision + 1,
        },
      );
      return { checkpoint: { date: input.date, amount: checkpoint.amount.toFixed(4) } };
    },
    { isolationLevel: "Serializable" },
  );
}
