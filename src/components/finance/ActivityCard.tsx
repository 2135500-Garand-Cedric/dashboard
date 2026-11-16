import Link from "next/link";
import {
  ArrowsRightLeftIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ChatBubbleLeftEllipsisIcon,
  EyeIcon,
  PencilSquareIcon,
  TagIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { FinanceTransaction } from "@/lib/finance/transactions";
import { displayAmount, TRANSACTION_TYPES } from "@/lib/finance/transactions";
import { INCOME_KINDS } from "@/lib/finance/income";
import { activityHref } from "@/lib/finance/activity-links";
import StatementBadge from "./StatementBadge";
import { secondaryButton } from "./shared";

const calendarDate = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export default function ActivityCard({
  transaction,
  onDelete,
}: {
  transaction: FinanceTransaction;
  onDelete?: () => void;
}) {
  const transfer = transaction.type === "TRANSFER";
  const outgoing = transaction.amount.startsWith("-");
  const matchedAccounts = new Set(transaction.statementMatches?.map((match) => match.accountId));
  const matched = transfer ? matchedAccounts.size >= 2 : matchedAccounts.size > 0;
  const editable = transaction.source === "MANUAL" && transaction.editable !== false;
  const canEditDetails =
    transaction.type === "INCOME" ||
    transaction.type === "EXPENSE" ||
    transaction.type === "REFUND";
  const canEdit = editable || canEditDetails;
  const ActionIcon = canEdit ? PencilSquareIcon : EyeIcon;
  const incomeSources = [
    ...new Map(
      transaction.incomeRecords.flatMap((record) =>
        record.source ? [[record.source.id, record.source] as const] : [],
      ),
    ).values(),
  ];
  const TypeIcon = transfer ? ArrowsRightLeftIcon : outgoing ? ArrowUpRightIcon : ArrowDownLeftIcon;
  const amountColor = transfer ? "text-blue-400" : outgoing ? "text-rose-400" : "text-emerald-400";
  const name =
    transaction.type === "INCOME"
      ? (transaction.incomeRecords[0]?.description ?? transaction.description)
      : transaction.type === "EXPENSE"
        ? (transaction.receipts[0]?.merchant ?? transaction.description)
        : transaction.description;
  // Financial activity dates are calendar dates, so formatting must not shift them across timezones.
  const writtenDate = calendarDate.format(new Date(`${transaction.date}T00:00:00Z`));

  return (
    <article
      aria-label={`${TRANSACTION_TYPES[transaction.type]}: ${name}`}
      className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card-bg shadow-sm ${matched ? "border-emerald-500/30" : "border-card-border"}`}
    >
      <div className={`h-1 ${matched ? "bg-emerald-500/70" : "bg-amber-500/40"}`} />
      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
            <TypeIcon className={`h-4 w-4 ${amountColor}`} aria-hidden="true" />
            {TRANSACTION_TYPES[transaction.type]}
          </span>
          <StatementBadge transaction={transaction} />
        </div>
        <div className="space-y-2">
          <h3 className="break-words text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
            {name}
          </h3>
          <p className="flex items-center gap-2 text-sm text-gray-400">
            <CalendarDaysIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <time dateTime={transaction.date}>{writtenDate}</time>
          </p>
          {(transaction.type === "INCOME" ||
            transaction.type === "EXPENSE" ||
            transaction.type === "REFUND") && (
            <p className="flex items-center gap-2 text-sm text-gray-400">
              <BanknotesIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                {transaction.account.name}
              </span>
            </p>
          )}
          {transaction.type !== "REFUND" &&
            transaction.type !== "INCOME" &&
            !transfer &&
            transaction.counterparty &&
            transaction.counterparty !== name && (
              <p className="break-words text-sm text-gray-400 [overflow-wrap:anywhere]">
                {transaction.counterparty}
              </p>
            )}
        </div>
        <div>
          <p
            className={`break-words text-2xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] ${amountColor}`}
          >
            {displayAmount(transaction.ledgerAmount ?? transaction.amount, transaction.currency)}
          </p>
          {transaction.transfer && (
            <p className="mt-1 break-words text-sm text-gray-400 [overflow-wrap:anywhere]">
              {displayAmount(
                transaction.transfer.ledgerAmount ?? transaction.transfer.amount,
                transaction.transfer.currency,
              )}{" "}
              received
            </p>
          )}
        </div>
        {(transfer || transaction.type === "INCOME" || transaction.category) && (
          <div className="space-y-3 rounded-lg bg-foreground/[0.03] p-3">
            {transfer ? (
              <div className="space-y-2 text-sm">
                <p className="text-xs text-gray-500">From</p>
                <p className="break-words font-medium">{transaction.account.name}</p>
                <p className="text-xs text-gray-500">To</p>
                <p className="break-words font-medium">{transaction.transfer?.account.name}</p>
              </div>
            ) : transaction.type === "INCOME" ? (
              incomeSources.map((source) => (
                <p key={source.id} className="break-words text-sm">
                  {source.name} · {INCOME_KINDS[source.kind]}
                </p>
              ))
            ) : (
              transaction.category && (
                <p className="flex items-start gap-2 text-sm">
                  <TagIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                  <span className="min-w-0 break-words">{transaction.category.name}</span>
                </p>
              )
            )}
          </div>
        )}
        {transaction.notes && (
          <section aria-label="Notes" className="space-y-2 border-t border-card-border pt-4">
            <p className="flex items-center gap-2 text-xs font-medium text-gray-400">
              <ChatBubbleLeftEllipsisIcon className="h-4 w-4" aria-hidden="true" />
              Notes
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
              {transaction.notes}
            </p>
          </section>
        )}
        {transaction.excludedAmount && transaction.excludedAmount !== "0.0000" && (
          <p className="rounded-lg bg-amber-500/5 p-3 text-sm text-amber-500">
            Original: {displayAmount(transaction.amount, transaction.currency)} ·{" "}
            {transaction.excludedAmount} {transaction.currency} matched to statement activity and
            excluded here.
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 border-t border-card-border pt-4">
          <Link
            href={activityHref(transaction.id, transaction.type)}
            className={`${secondaryButton} gap-2 !border-blue-500/30 hover:!border-blue-500/60`}
          >
            <ActionIcon className="h-4 w-4" aria-hidden="true" />
            {canEditDetails && transaction.statementMatches?.length
              ? "View / notes"
              : canEdit
                ? "View / edit"
                : "View record"}
          </Link>
          {onDelete && editable && (
            <button
              className={`${secondaryButton} gap-2 !border-rose-500/30 text-rose-400`}
              onClick={onDelete}
            >
              <TrashIcon className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
