import {
  moneyText,
  moneyUnits,
  categoryMovements,
  countedUnits,
  type FinanceReport,
  type ReportData,
  type ReportFilters,
  type ReportTransaction,
} from "./reporting";

export interface OverviewStatement {
  id: number;
  accountId: number;
  name: string;
  status: string;
  from: string | null;
  to: string | null;
  rows: { date: string | null; transactionId: number | null }[];
}
export type OverviewData = ReportData & {
  statements?: OverviewStatement[];
  today?: string;
  reimbursementPlans?: { expenseId: number; person: string; expected: string }[];
};
export type FinanceOverviewReport = FinanceReport & { overview: ReturnType<typeof buildOverview> };

// A statement match confirms an existing activity; documents are never extra spending.
export function buildOverview(data: OverviewData, filters: ReportFilters, recentLimit = 8) {
  const accounts = new Map(data.accounts.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row.name]));
  const sources = new Map(data.sources.map((row) => [row.id, row]));
  const examples = new Set(data.examples.accountIds);
  const includeDataset = (id: number) =>
    filters.dataset === "all" || (filters.dataset === "examples") === examples.has(id);
  const inRange = (date: string) => date >= filters.from && date <= filters.to;
  const selected = (filters.categoryId ? categoryMovements(data) : data.transactions).filter(
    (row) =>
      row.currency === filters.currency &&
      (!filters.accountId || row.accountId === filters.accountId) &&
      (!filters.categoryId || row.categoryId === filters.categoryId) &&
      includeDataset(row.accountId) &&
      inRange(row.date) &&
      countedUnits(row) !== BigInt(0),
  );
  const confirmed = data.matches.filter((row) => row.status === "CONFIRMED");
  const matchedIds = new Set(
    confirmed.filter((row) => row.kind === "STATEMENT").map((row) => row.transactionId),
  );
  const isMatched = (row: ReportTransaction) =>
    row.statementMatched === true || matchedIds.has(row.id);
  const transfers = new Map<string, ReportTransaction[]>();
  for (const row of data.transactions.filter((row) => row.type === "TRANSFER" && row.transferId)) {
    const legs = transfers.get(row.transferId!) ?? [];
    legs.push(row);
    transfers.set(row.transferId!, legs);
  }
  const seen = new Set<string>();
  const activities = selected
    .filter((row) => {
      if (row.type !== "TRANSFER") return ["INCOME", "EXPENSE", "REFUND"].includes(row.type);
      const key = row.transferId ?? `single:${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => {
      const legs = row.transferId ? (transfers.get(row.transferId) ?? [row]) : [row];
      const matchedLegs = legs.filter(isMatched).length;
      const status =
        row.type !== "TRANSFER"
          ? isMatched(row)
            ? "MATCHED"
            : "UNMATCHED"
          : legs.length === 2 && matchedLegs === 2
            ? "MATCHED"
            : matchedLegs
              ? "PARTIAL"
              : "UNMATCHED";
      const outgoing = legs.find((leg) => countedUnits(leg) < BigInt(0)) ?? row;
      const peer = legs.find((leg) => leg.id !== outgoing.id);
      const displayRow =
        row.type === "TRANSFER" && !filters.accountId && outgoing.currency === filters.currency
          ? outgoing
          : row;
      const incomeRecord =
        data.income.find((record) => record.transactionId === row.id) ??
        data.income.find((record) =>
          confirmed.some(
            (link) =>
              link.kind === "INCOME" &&
              link.incomeRecordId === record.id &&
              link.transactionId === row.id,
          ),
        );
      const source = incomeRecord?.sourceId ? sources.get(incomeRecord.sourceId) : null;
      return {
        id: row.type === "TRANSFER" ? outgoing.id : row.id,
        type: row.type,
        date: row.date,
        description: row.description,
        amount: moneyText(countedUnits(displayRow)),
        currency: row.currency,
        account: accounts.get(row.accountId)?.name ?? "Account",
        fromAccount:
          row.type === "TRANSFER" ? (accounts.get(outgoing.accountId)?.name ?? null) : null,
        toAccount: peer ? (accounts.get(peer.accountId)?.name ?? null) : null,
        category:
          row.type === "REFUND"
            ? [
                ...new Set(
                  (data.reimbursements ?? [])
                    .filter((link) => link.paymentId === row.id)
                    .flatMap((link) => {
                      const expense = data.transactions.find((item) => item.id === link.expenseId);
                      return expense?.categoryId &&
                        (!filters.categoryId || expense.categoryId === filters.categoryId)
                        ? [categories.get(expense.categoryId) ?? "Uncategorized"]
                        : [];
                    }),
                ),
              ].join(" · ") || "Unallocated refund"
            : row.categoryId
              ? (categories.get(row.categoryId) ?? null)
              : null,
        incomeSource: source ? { name: source.name, kind: source.kind } : null,
        status,
      };
    });
  const groups = [
    { key: "income", name: "Income", types: ["INCOME"] },
    { key: "expenses", name: "Expenses & refunds", types: ["EXPENSE", "REFUND"] },
    { key: "transfers", name: "Transfers", types: ["TRANSFER"] },
  ].map((group) => {
    const rows = activities.filter((row) => group.types.includes(row.type));
    return {
      key: group.key,
      name: group.name,
      total: rows.length,
      matched: rows.filter((row) => row.status === "MATCHED").length,
      partial: rows.filter((row) => row.status === "PARTIAL").length,
      unmatched: rows.filter((row) => row.status === "UNMATCHED").length,
    };
  });
  const statements = (data.statements ?? [])
    .filter((statement) => {
      const account = accounts.get(statement.accountId);
      if (
        !account ||
        account.currency !== filters.currency ||
        (filters.accountId && account.id !== filters.accountId) ||
        !includeDataset(account.id)
      )
        return false;
      if (statement.from && statement.to)
        return statement.from <= filters.to && statement.to >= filters.from;
      return statement.rows.some((row) => row.date && inRange(row.date));
    })
    .map((statement) => {
      const rows = statement.rows.filter(
        (row) =>
          row.date &&
          inRange(row.date) &&
          (!filters.categoryId || selected.some((tx) => tx.id === row.transactionId)),
      );
      const matched = rows.filter(
        (row) => row.transactionId !== null && statement.status === "COMPLETED",
      ).length;
      return {
        id: statement.id,
        name: statement.name,
        account: accounts.get(statement.accountId)!.name,
        from: statement.from,
        to: statement.to,
        total: rows.length,
        matched,
        remaining: rows.length - matched,
        saved: statement.status === "COMPLETED",
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.remaining - a.remaining || b.id - a.id);
  const asOf = data.today ?? filters.to;
  const owedExpenses = data.transactions.filter(
    (row) =>
      row.type === "EXPENSE" &&
      row.date <= asOf &&
      row.currency === filters.currency &&
      (!filters.accountId || row.accountId === filters.accountId) &&
      (!filters.categoryId || row.categoryId === filters.categoryId) &&
      includeDataset(row.accountId) &&
      countedUnits(row) < BigInt(0),
  );
  const outstanding = owedExpenses
    .map((expense) => {
      const plans = (data.reimbursementPlans ?? []).filter((plan) => plan.expenseId === expense.id);
      const expected = plans.reduce((sum, plan) => sum + moneyUnits(plan.expected), BigInt(0));
      const received = (data.reimbursements ?? [])
        .filter(
          (link) =>
            link.expenseId === expense.id &&
            data.transactions.some(
              (payment) => payment.id === link.paymentId && payment.date <= asOf,
            ),
        )
        .reduce((sum, link) => sum + moneyUnits(link.amount), BigInt(0));
      const remaining = expected > received ? expected - received : BigInt(0);
      return {
        id: expense.id,
        description: expense.description,
        people: plans.map((plan) => plan.person).join(", "),
        expected: moneyText(expected),
        received: moneyText(received),
        remaining: moneyText(remaining),
      };
    })
    .filter((row) => moneyUnits(row.remaining) > BigInt(0))
    .sort((a, b) => {
      const difference = moneyUnits(b.remaining) - moneyUnits(a.remaining);
      return difference === BigInt(0) ? a.id - b.id : difference > BigInt(0) ? 1 : -1;
    });
  return {
    awaitingReimbursements: {
      asOf,
      total: moneyText(
        outstanding.reduce((sum, row) => sum + moneyUnits(row.remaining), BigInt(0)),
      ),
      count: outstanding.length,
      expenses: outstanding.slice(0, 5),
    },
    groups,
    matching: {
      total: activities.length,
      matched: activities.filter((row) => row.status === "MATCHED").length,
      partial: activities.filter((row) => row.status === "PARTIAL").length,
      unmatched: activities.filter((row) => row.status === "UNMATCHED").length,
    },
    statements,
    pendingStatementRows: statements.reduce((sum, row) => sum + row.remaining, 0),
    recent: activities
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .slice(0, recentLimit),
    accountCount: data.accounts.filter(
      (row) =>
        row.currency === filters.currency &&
        (!filters.accountId || row.id === filters.accountId) &&
        includeDataset(row.id),
    ).length,
    sources: data.sources,
  };
}
