import Link from "next/link";
import { CheckCircleIcon, DocumentTextIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import type { FinanceOverviewReport } from "@/lib/finance/overview";
import { secondaryButton } from "./shared";

export default function OverviewMatching({ report }: { report: FinanceOverviewReport }) {
  const { matching, groups, statements, pendingStatementRows } = report.overview;
  const percent = matching.total ? Math.round((matching.matched / matching.total) * 100) : 0;
  const needsMatching = statements.filter((row) => row.remaining > 0);
  return (
    <section className="card flex min-w-0 flex-col gap-5">
      <div className="flex items-center gap-2">
        <CheckCircleIcon className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        <h3 className="text-lg font-semibold">Statement matching</h3>
      </div>
      <div className="space-y-2">
        <p>
          <strong className="text-3xl font-semibold tabular-nums">{matching.matched}</strong>
          <span className="ml-2 text-sm text-gray-400">of {matching.total} records matched</span>
        </p>
        <div
          className="h-2 overflow-hidden rounded-full bg-foreground/5"
          role="progressbar"
          aria-label="Records matched to statements"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <dl className="space-y-3">
        {groups.map((row) => (
          <div key={row.key} className="flex flex-wrap justify-between gap-2 text-sm">
            <dt className="text-gray-400">{row.name}</dt>
            <dd className="text-right">
              <span className="font-medium">
                {row.matched} / {row.total}
              </span>
              {row.partial > 0 && (
                <span className="ml-2 text-xs text-amber-500">{row.partial} one account</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-400">
        Transfers need both accounts matched. Cash records can remain unmatched.
      </p>
      <div className="space-y-3 border-t border-card-border pt-4">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="h-4 w-4 text-blue-400" aria-hidden="true" />
          <h4 className="text-sm font-semibold">{pendingStatementRows} statement rows to match</h4>
        </div>
        {needsMatching.length ? (
          <ul className="space-y-2">
            {needsMatching.slice(0, 2).map((row) => (
              <li key={row.id}>
                <Link
                  href={`/finance/imports/${row.id}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-card-border p-3 hover:border-blue-500/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{row.name}</span>
                    <span className="block text-xs text-gray-400">
                      {row.account} · {row.matched}/{row.total} matched ·{" "}
                      {row.saved ? "Saved" : "Draft"}
                    </span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">
            {statements.length
              ? "All statement rows in this period are matched."
              : "No statements for this period yet."}
          </p>
        )}
      </div>
      {needsMatching.length > 2 && (
        <p className="text-xs text-gray-400">
          +{needsMatching.length - 2} more statements with unmatched rows
        </p>
      )}
      <Link
        href={`/finance/imports${report.filters.accountId ? `?account=${report.filters.accountId}` : ""}`}
        className={`${secondaryButton} mt-auto gap-2`}
      >
        Open statement imports
        <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
