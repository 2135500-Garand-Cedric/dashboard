import { ArrowDownLeftIcon, ClockIcon, WalletIcon } from "@heroicons/react/24/outline";
import type { ReimbursementSummary } from "@/lib/finance/reimbursements";
import { displayAmount } from "@/lib/finance/transactions";

export default function ReimbursementProgress({
  summary,
  currency,
}: {
  summary: ReimbursementSummary;
  currency: string;
}) {
  // Convert only the bounded ratio to Number; money stays exact decimal text.
  const expected = BigInt(summary.expected.replace(".", ""));
  const received = BigInt(summary.received.replace(".", ""));
  const percent =
    expected > BigInt(0) ? Math.min(100, Number((received * BigInt(10000)) / expected) / 100) : 0;
  const money = (value: string) => displayAmount(value, currency).replace(/^\+/, "");
  return (
    <div className="grid items-center gap-6 rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/5 via-transparent to-sky-500/5 p-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-6">
      <div
        className="relative mx-auto h-40 w-40"
        role="img"
        aria-label={`${percent}% of expected reimbursement received`}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            className="text-foreground/10"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap={percent ? "round" : "butt"}
            strokeDasharray={`${percent} 100`}
            className="text-emerald-400 transition-all"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{Math.round(percent)}%</span>
          <span className="text-sm text-muted">repaid</span>
        </div>
      </div>
      <div className="min-w-0 space-y-5">
        <div>
          <p className="flex items-center gap-2 text-sm text-emerald-400">
            <ArrowDownLeftIcon className="h-5 w-5" />
            Received
          </p>
          <p className="mt-1 break-words text-3xl font-semibold tabular-nums text-emerald-400">
            {money(summary.received)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Expected{" "}
            <strong className="font-medium text-foreground">{money(summary.expected)}</strong>
          </p>
        </div>
        <div className="grid min-w-0 gap-4 border-t border-card-border pt-4 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-sm text-amber-400">
              <ClockIcon className="h-4 w-4" />
              Still owed
            </p>
            <p className="mt-1 break-words text-xl font-semibold tabular-nums">
              {money(summary.remaining)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm text-sky-400">
              <WalletIcon className="h-4 w-4" />
              Your cost so far
            </p>
            <p className="mt-1 break-words text-xl font-semibold tabular-nums">
              {money(summary.personalCost)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
