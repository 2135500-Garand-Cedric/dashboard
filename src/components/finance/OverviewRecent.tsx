import Link from "next/link";
import {
  ArrowsRightLeftIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import type { FinanceOverviewReport } from "@/lib/finance/overview";
import { displayAmount, TRANSACTION_TYPES } from "@/lib/finance/transactions";
import { activityHref } from "@/lib/finance/activity-links";

const dateLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
export default function OverviewRecent({ report }: { report: FinanceOverviewReport }) {
  return (
    <section className="card min-w-0 space-y-4">
      <h3 className="text-lg font-semibold">Recent activity</h3>
      {report.overview.recent.length ? (
        <ul className="divide-y divide-card-border lg:max-h-[32rem] lg:overflow-y-auto lg:pr-2">
          {report.overview.recent.map((row) => {
            const transfer = row.type === "TRANSFER",
              inflow = !row.amount.startsWith("-");
            const Icon = transfer
              ? ArrowsRightLeftIcon
              : inflow
                ? ArrowDownLeftIcon
                : ArrowUpRightIcon;
            const color = transfer
              ? "text-blue-400"
              : inflow
                ? "text-emerald-400"
                : "text-rose-400";
            return (
              <li key={row.id}>
                <Link
                  href={activityHref(row.id, row.type)}
                  className="group flex items-start gap-3 rounded-lg py-4 hover:bg-foreground/[0.02] sm:items-center"
                >
                  <span className={`mt-0.5 rounded-lg bg-foreground/5 p-2.5 ${color}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block break-words text-sm font-semibold [overflow-wrap:anywhere]">
                      {row.description}
                    </span>
                    <span className="block break-words text-xs text-gray-400">
                      {dateLabel.format(new Date(`${row.date}T00:00:00Z`))} ·{" "}
                      {transfer
                        ? `${row.fromAccount ?? row.account} → ${row.toAccount ?? "Other account"}`
                        : row.account}
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${row.status === "MATCHED" ? "border-emerald-500/30 text-emerald-500" : "border-amber-500/30 text-amber-500"}`}
                    >
                      {row.status === "MATCHED"
                        ? "Statement matched"
                        : row.status === "PARTIAL"
                          ? "One account matched"
                          : "Not matched"}
                    </span>
                  </span>
                  <span className="min-w-0 max-w-[45%] text-right">
                    <span
                      className={`block break-words font-semibold tabular-nums [overflow-wrap:anywhere] ${color}`}
                    >
                      {displayAmount(row.amount, row.currency)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {TRANSACTION_TYPES[row.type as keyof typeof TRANSACTION_TYPES] ?? row.type}
                    </span>
                  </span>
                  <ArrowRightIcon
                    className="hidden h-4 w-4 shrink-0 text-gray-500 group-hover:text-blue-400 sm:block"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-gray-400">
          Add an income, expense or transfer to see your activity here.
        </p>
      )}
    </section>
  );
}
