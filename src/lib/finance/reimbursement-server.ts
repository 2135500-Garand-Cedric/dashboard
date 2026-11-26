import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { FINANCE_USER_ID } from "./server";
import { FinanceValidationError } from "./validation";
import {
  reimbursementInput,
  reimbursementStatus,
  type ReimbursementDetails,
} from "./reimbursements";

type DB = Prisma.TransactionClient;
const owner = FINANCE_USER_ID;
const sum = (rows: { amount: Prisma.Decimal }[]) =>
  rows.reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
const include = {
  reimbursementPlans: true,
  reimbursementsReceived: { where: { userId: owner } },
  reimbursementsPaid: { where: { userId: owner } },
} satisfies Prisma.FinancialTransactionInclude;

async function transaction(db: DB, id: number) {
  const row = await db.financialTransaction.findFirst({
    where: { id, userId: owner, account: { userId: owner } },
    include,
  });
  if (!row) throw new FinanceValidationError("Financial record not found.", 404);
  if (!["EXPENSE", "REFUND"].includes(row.type) || !row.excludedAmount.isZero())
    throw new FinanceValidationError(
      "Reimbursements require an expense or refund without duplicate exclusions.",
      409,
    );
  return row;
}

function checkVersion(saved: Date | undefined, expected: string | null) {
  if ((saved?.getTime() ?? null) !== (expected ? Date.parse(expected) : null))
    throw new FinanceValidationError("This reimbursement changed. Reload before saving.", 409);
}

async function write<T>(action: (db: DB) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (db) => {
          // Serializes allocations across different payments toward the same expense.
          await db.$executeRaw`SELECT pg_advisory_xact_lock(94727, ${owner}::integer)`;
          return action(db);
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      );
    } catch (error) {
      if (
        attempt < 2 &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2034"
      )
        continue;
      throw error;
    }
  }
  throw new FinanceValidationError("Unable to save reimbursement. Please retry.", 503);
}

export async function saveReimbursementPlan(id: number, value: unknown) {
  const input = reimbursementInput(value, "plan");
  return write(async (db) => {
    const row = await transaction(db, id);
    if (row.type !== "EXPENSE")
      throw new FinanceValidationError("Only expenses can expect reimbursement.");
    const plan = input.planId
      ? row.reimbursementPlans.find((item) => item.id === input.planId)
      : (row.reimbursementPlans.find((item) => item.contactId === input.contactId) ??
        (input.remove && row.reimbursementPlans.length === 1
          ? row.reimbursementPlans[0]
          : undefined));
    if (input.planId && !plan)
      throw new FinanceValidationError("Reimbursement person not found.", 404);
    checkVersion(plan?.updatedAt, input.expectedUpdatedAt);
    const received = sum(row.reimbursementsReceived.filter((link) => link.planId === plan?.id));
    if (input.remove) {
      if (!plan) throw new FinanceValidationError("Choose the reimbursement person to remove.");
      if (row.reimbursementsReceived.some((link) => link.planId === plan.id))
        throw new FinanceValidationError(
          "Unlink this person's reimbursements before removing tracking.",
          409,
        );
      await db.financialReimbursementPlan.delete({ where: { id: plan.id, userId: owner } });
    } else {
      const expected = new Prisma.Decimal(input.amount!);
      const total = row.reimbursementPlans
        .filter((item) => item.id !== plan?.id)
        .reduce((total, item) => total.plus(item.expectedAmount), expected);
      if (total.greaterThan(row.amount.abs()))
        throw new FinanceValidationError(
          "Expected reimbursements across all people cannot exceed the expense amount.",
        );
      if (expected.lessThan(received))
        throw new FinanceValidationError(
          "Expected reimbursement cannot be less than the amount already received from this person.",
        );
      const contact = await db.workContact.findFirst({
        where: { id: input.contactId, userId: owner },
      });
      if (!contact || (!contact.active && contact.id !== plan?.contactId))
        throw new FinanceValidationError("Choose an active person from Settings → People.");
      if (
        row.reimbursementPlans.some((item) => item.id !== plan?.id && item.contactId === contact.id)
      )
        throw new FinanceValidationError(
          "This person already has reimbursement tracking. Edit their existing amount.",
          409,
        );
      const person = plan?.contactId === contact.id ? plan.person : contact.name;
      if (plan)
        await db.financialReimbursementPlan.update({
          where: { id: plan.id },
          data: { person, contactId: contact.id, expectedAmount: expected, updatedAt: new Date() },
        });
      else
        await db.financialReimbursementPlan.create({
          data: {
            expenseId: id,
            userId: owner,
            person,
            contactId: contact.id,
            expectedAmount: expected,
          },
        });
    }
    return { success: true };
  });
}

export async function saveReimbursementAllocation(paymentId: number, value: unknown) {
  const input = reimbursementInput(value, "allocation");
  return write(async (db) => {
    const payment = await transaction(db, paymentId);
    const expense = await transaction(db, input.expenseId);
    if (
      payment.type !== "REFUND" ||
      expense.type !== "EXPENSE" ||
      !expense.reimbursementPlans.length
    )
      throw new FinanceValidationError(
        "Choose a refund payment and an expense expecting reimbursement.",
      );
    if (payment.currency !== expense.currency)
      throw new FinanceValidationError("The reimbursement and expense must use the same currency.");
    const plan = input.planId
      ? expense.reimbursementPlans.find((item) => item.id === input.planId)
      : expense.reimbursementPlans.length === 1
        ? expense.reimbursementPlans[0]
        : undefined;
    if (!plan)
      throw new FinanceValidationError("Choose which person's reimbursement this payment covers.");
    const prior = payment.reimbursementsPaid.find((item) => item.planId === plan.id);
    checkVersion(prior?.updatedAt, input.expectedUpdatedAt);
    const amount = new Prisma.Decimal(input.amount!);
    const previously = prior?.amount ?? new Prisma.Decimal(0);
    if (sum(payment.reimbursementsPaid).minus(previously).plus(amount).greaterThan(payment.amount))
      throw new FinanceValidationError(
        "Allocated reimbursements cannot exceed the incoming payment amount.",
      );
    if (
      sum(expense.reimbursementsReceived.filter((link) => link.planId === plan.id))
        .minus(previously)
        .plus(amount)
        .greaterThan(plan.expectedAmount)
    )
      throw new FinanceValidationError(
        "This allocation exceeds the expense's remaining reimbursement.",
      );
    await db.financialReimbursement.upsert({
      where: { planId_paymentId: { planId: plan.id, paymentId } },
      create: { userId: owner, expenseId: expense.id, planId: plan.id, paymentId, amount },
      update: { amount, updatedAt: new Date() },
    });
    return { success: true };
  });
}

export async function removeReimbursementAllocation(
  transactionId: number,
  linkId: number,
  version: string | null,
) {
  return write(async (db) => {
    await transaction(db, transactionId);
    const link = await db.financialReimbursement.findFirst({
      where: {
        id: linkId,
        userId: owner,
        OR: [{ expenseId: transactionId }, { paymentId: transactionId }],
      },
    });
    if (!link) throw new FinanceValidationError("Reimbursement link not found.", 404);
    checkVersion(link.updatedAt, version);
    await db.financialReimbursement.delete({ where: { id: link.id, userId: owner } });
    return { success: true };
  });
}

export async function getReimbursements(id: number, search = ""): Promise<ReimbursementDetails> {
  // A consistent snapshot prevents mixing totals and links during concurrent saves.
  return prisma.$transaction(
    async (db) => {
      const row = await transaction(db, id);
      const expense = row.type === "EXPENSE";
      const received = sum(row.reimbursementsReceived);
      const paid = sum(row.reimbursementsPaid);
      const plans = row.reimbursementPlans;
      const expected = plans.reduce(
        (total, plan) => total.plus(plan.expectedAmount),
        new Prisma.Decimal(0),
      );
      const links = await db.financialReimbursement.findMany({
        where: { userId: owner, ...(expense ? { expenseId: id } : { paymentId: id }) },
        include: { expense: { include: { category: true } }, payment: true, plan: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      // Limit only after excluding settled expenses, so old unpaid items remain findable.
      const candidateIds = expense
        ? []
        : await db.$queryRaw<{ id: number }[]>`
        SELECT p.id FROM "FinancialReimbursementPlan" p
        JOIN "FinancialTransaction" t ON t.id = p."expenseId"
        WHERE p."userId" = ${owner} AND t."userId" = ${owner}
          AND t.type = 'EXPENSE' AND t.currency = ${row.currency} AND t."excludedAmount" = 0
          AND p."expectedAmount" > COALESCE((SELECT SUM(r.amount) FROM "FinancialReimbursement" r
            WHERE r."planId" = p.id AND r."userId" = ${owner}), 0)
          AND NOT EXISTS (SELECT 1 FROM "FinancialReimbursement" r
            WHERE r."planId" = p.id AND r."paymentId" = ${id})
          AND POSITION(LOWER(${search.trim().slice(0, 100)}) IN LOWER(t.description || ' ' || p.person)) > 0
        ORDER BY t."occurredOn" DESC, t.id DESC, p.id ASC
      `;
      const candidates = expense
        ? []
        : await db.financialReimbursementPlan.findMany({
            where: {
              userId: owner,
              id: { in: candidateIds.map((item) => item.id) },
              expense: {
                userId: owner,
                type: "EXPENSE",
                currency: row.currency,
                excludedAmount: 0,
              },
            },
            include: {
              expense: { include: { account: true, category: true, reimbursementsReceived: true } },
            },
            orderBy: { expense: { occurredOn: "desc" } },
          });
      return {
        transactionId: id,
        type: expense ? "EXPENSE" : "REFUND",
        currency: row.currency,
        amount: row.amount.abs().toFixed(4),
        available: row.amount
          .abs()
          .minus(expense ? received : paid)
          .toFixed(4),
        summary: plans.length
          ? {
              person: plans.map((plan) => plan.person).join(", "),
              expected: expected.toFixed(4),
              received: received.toFixed(4),
              remaining: expected.minus(received).toFixed(4),
              personalCost: row.amount.abs().minus(received).toFixed(4),
              status: reimbursementStatus(expected.toFixed(4), received.toFixed(4)),
            }
          : null,
        planUpdatedAt: plans.length === 1 ? plans[0].updatedAt.toISOString() : null,
        plans: plans.map((plan) => {
          const received = sum(
            row.reimbursementsReceived.filter((link) => link.planId === plan.id),
          );
          return {
            id: plan.id,
            contactId: plan.contactId,
            person: plan.person,
            expected: plan.expectedAmount.toFixed(4),
            received: received.toFixed(4),
            remaining: plan.expectedAmount.minus(received).toFixed(4),
            updatedAt: plan.updatedAt.toISOString(),
            status: reimbursementStatus(plan.expectedAmount.toFixed(4), received.toFixed(4)),
          };
        }),
        links: links.map((link) => {
          const other = expense ? link.payment : link.expense;
          return {
            id: link.id,
            expenseId: link.expenseId,
            planId: link.planId,
            person: link.plan.person,
            paymentId: link.paymentId,
            amount: link.amount.toFixed(4),
            updatedAt: link.updatedAt.toISOString(),
            description: other.description,
            category: link.expense.category?.name ?? null,
            date: other.occurredOn.toISOString().slice(0, 10),
          };
        }),
        candidates: candidates.flatMap((item) => {
          const remaining = item.expectedAmount.minus(
            sum(item.expense.reimbursementsReceived.filter((link) => link.planId === item.id)),
          );
          if (!remaining.greaterThan(0) || links.some((link) => link.planId === item.id)) return [];
          return [
            {
              id: item.expenseId,
              planId: item.id,
              description: item.expense.description,
              person: item.person,
              date: item.expense.occurredOn.toISOString().slice(0, 10),
              remaining: remaining.toFixed(4),
              account: item.expense.account.name,
              category: item.expense.category?.name ?? null,
            },
          ];
        }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
