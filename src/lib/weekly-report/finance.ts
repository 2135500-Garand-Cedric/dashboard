import { financeReport } from "@/lib/finance/reporting-server";
import { reportFilters } from "@/lib/finance/reporting";
import { activityHref } from "@/lib/finance/activity-links";
import { reportList, type WeeklyPeriod } from "./period";

export async function weeklyFinance(p: WeeklyPeriod, offset = 0, limit = 3) {
  const params = new URLSearchParams({
    mode: "custom",
    from: p.week,
    to: p.financeTo,
    currency: p.currency,
    dataset: p.dataset,
  });
  // Reuse canonical counting and cross-period matching information. The existing
  // reader loads once; only this week's compact movement rows leave this service.
  const report = await financeReport(reportFilters(params, p.today), Number.MAX_SAFE_INTEGER);
  const unmatched = report.overview.recent.filter(
    (row) => ["INCOME", "EXPENSE", "REFUND"].includes(row.type) && row.status === "UNMATCHED",
  );
  return {
    totals: report.totals,
    accountCount: report.overview.accountCount,
    overviewHref: `/finance?${params}`,
    unmatched: reportList(
      unmatched.length,
      unmatched
        .slice(offset, offset + limit)
        .map((row) => ({
          id: `finance:${row.id}`,
          title: row.description,
          subtitle: `${row.type === "INCOME" ? "Income" : row.type === "REFUND" ? "Refund" : "Expense"} · ${row.account}`,
          when: row.date,
          href: activityHref(row.id, row.type),
          badges: ["Not matched to a statement"],
        })),
      offset,
      "unmatched",
      p,
    ),
  };
}
