import Link from "next/link";
import { CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import type { FinanceTransaction } from "@/lib/finance/transactions";

export default function StatementBadge({ transaction }: { transaction: FinanceTransaction }) {
  const matches = transaction.statementMatches ?? [];
  if (!matches.length)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 px-2.5 py-1 text-xs text-amber-500">
        <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Not matched to statement
      </span>
    );
  const accountCount = new Set(matches.map((match) => match.accountId)).size;
  const label =
    transaction.type === "TRANSFER"
      ? accountCount > 1
        ? "Both accounts matched"
        : "Statement matched on one account"
      : matches.length > 1
        ? `Matched to ${matches.length} statements`
        : "Matched to statement";
  return (
    <Link
      href={`/finance/imports/${matches[0].id}`}
      title={matches
        .map(
          (match) =>
            `${match.name ?? `Statement #${match.id}`}${match.from && match.to ? ` · ${match.from} – ${match.to}` : ""}`,
        )
        .join("\n")}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${transaction.type === "TRANSFER" && accountCount < 2 ? "border-amber-500/30 text-amber-500 hover:bg-amber-500/10" : "border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"}`}
    >
      <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
