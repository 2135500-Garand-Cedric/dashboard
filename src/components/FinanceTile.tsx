"use client";

import Link from "next/link";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { useSettings } from "@/context/SettingsContext";
import { localToday } from "@/lib/work-management/date-format";
import { displayAmount } from "@/lib/finance/transactions";
import type { FinanceOverviewReport } from "@/lib/finance/overview";
import { useFinanceData } from "@/components/finance/shared";

export default function FinanceTile() {
  const { timeZone } = useSettings();
  const month = localToday(new Date(), timeZone).slice(0, 7);
  const result = useFinanceData<FinanceOverviewReport>(
    `/api/finance/reports?${new URLSearchParams({ mode: "month", month, currency: "CAD", dataset: "all" })}`,
  );
  const report = result.data;
  const money = (amount: string) => displayAmount(amount, "CAD").replace(/^\+/, "");
  return (
    <section className="card space-y-4" aria-label="Finance summary">
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BanknotesIcon className="h-5 w-5 text-emerald-400" />
          Finance
        </h2>
        <Link href="/finance" className="text-sm text-blue-400 hover:underline">
          View overview
        </Link>
      </header>
      <p className="text-xs text-gray-400">This month · CAD · recorded activity</p>
      {result.loading ? (
        <p role="status">Loading finances…</p>
      ) : result.error ? (
        <div>
          <p role="alert" className="text-sm text-rose-400">
            Could not load finances.
          </p>
          <button type="button" onClick={result.retry} className="mt-2 text-sm text-blue-400">
            Retry
          </button>
        </div>
      ) : (
        report && (
          <>
            <div className="rounded-xl border border-card-border p-3">
              <p className="text-xs text-gray-400">Net cash flow</p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${report.totals.net.startsWith("-") ? "text-rose-400" : "text-emerald-400"}`}
              >
                {money(report.totals.net)}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-400">Income</dt>
                <dd className="mt-1 font-semibold text-emerald-400">
                  {money(report.totals.income)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Expenses</dt>
                <dd className="mt-1 font-semibold text-rose-400">
                  {money(report.totals.expenses)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-gray-400">
              {report.overview.matching.unmatched + report.overview.matching.partial} activities
              awaiting statement matching
            </p>
          </>
        )
      )}
    </section>
  );
}
