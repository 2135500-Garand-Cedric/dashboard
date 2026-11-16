"use client";
import Link from "next/link";
import { useState } from "react";
import type { ImportBatch, ImportRow } from "@/lib/finance/statement-imports";
import { displayAmount, TRANSACTION_TYPES } from "@/lib/finance/transactions";
import { activityHref } from "@/lib/finance/activity-links";
import { fieldClass, secondaryButton } from "./shared";

export default function StatementMatchRow({
  row,
  batch,
  disabled,
  usedIds,
  onChange,
}: {
  row: ImportRow;
  batch: ImportBatch;
  disabled: boolean;
  usedIds: number[];
  onChange: (row: ImportRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const review = row.review,
    readOnly = !batch.matchingOnly || (!!row.transactionId && !editing);
  const normalType = review?.amount.startsWith("-") ? "EXPENSE" : "INCOME";
  const candidates = (row.candidateOptions ?? row.candidates).filter(
    (candidate) => candidate.type === review?.type,
  );
  const selected = candidates.find((candidate) => candidate.id === review?.matchId);
  const newRecordPath =
    review?.type === "TRANSFER"
      ? "/finance/transfers/new"
      : review?.type === "REFUND"
        ? "/finance/expenses/refunds/new"
        : normalType === "INCOME"
          ? "/finance/income/new"
          : "/finance/expenses/new";
  const newRecordQuery = review
    ? new URLSearchParams({
        date: review.date,
        description: review.description,
        amount: review.amount.replace(/^-/, ""),
        accountId: String(batch.account.id),
        currency: review.currency,
      })
    : null;
  const newRecordHref =
    review?.type === "TRANSFER" ? newRecordPath : `${newRecordPath}?${newRecordQuery}`;

  return (
    <article
      aria-label={`Statement row ${row.rowNumber}`}
      className={`card min-w-0 space-y-4 ${review?.matchId ? "!border-emerald-500/60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            Row {row.rowNumber} · {review?.date} · Ref # {review?.reference || "—"}
          </p>
          <h3 className="break-words text-lg font-semibold">
            {review?.description || "Unparsed row"}
          </h3>
        </div>
        <span className="text-lg font-semibold tabular-nums">
          {review ? displayAmount(review.amount, review.currency) : "—"}
        </span>
      </div>
      {row.errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-rose-500">
          {row.errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
      {readOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className={row.transactionId ? "text-emerald-500" : "text-amber-500"}>
            {row.transactionId ? "Matched" : "Not matched"}
            {review?.type ? ` · ${TRANSACTION_TYPES[review.type]}` : ""}
          </span>
          {batch.matchingOnly && row.transactionId && (
            <button
              type="button"
              disabled={disabled}
              className={secondaryButton}
              onClick={() => setEditing(true)}
            >
              Change match
            </button>
          )}
          {row.transactionId && (
            <Link
              href={activityHref(row.transactionId, review?.type ?? "ADJUSTMENT")}
              className={secondaryButton}
            >
              View record
            </Link>
          )}
        </div>
      ) : (
        review && (
          <div className="grid gap-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,3fr)]">
            <label className="block space-y-1 text-sm">
              Record type
              <select
                aria-label={`Row ${row.rowNumber} type`}
                disabled={disabled}
                className={fieldClass}
                value={review.type ?? normalType}
                onChange={(event) =>
                  onChange({
                    ...row,
                    action: "MATCH",
                    review: {
                      ...review,
                      type: event.target.value as "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND",
                      categoryId: null,
                      matchId: null,
                    },
                  })
                }
              >
                <option value={normalType}>{normalType === "INCOME" ? "Income" : "Expense"}</option>
                {normalType === "INCOME" && <option value="REFUND">Refund</option>}
                <option value="TRANSFER">Transfer</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              Matching record
              <select
                aria-label={`Row ${row.rowNumber} match`}
                disabled={disabled}
                className={fieldClass}
                value={review.matchId ?? ""}
                onChange={(event) =>
                  onChange({
                    ...row,
                    action: "MATCH",
                    review: {
                      ...review,
                      matchId: event.target.value ? Number(event.target.value) : null,
                    },
                  })
                }
              >
                <option value="">Choose a matching record</option>
                {candidates.map((candidate) => (
                  <option
                    key={candidate.id}
                    value={candidate.id}
                    disabled={usedIds.includes(candidate.id) && candidate.id !== review.matchId}
                  >
                    {candidate.date} · {candidate.description} ·{" "}
                    {displayAmount(candidate.amount, candidate.currency)}
                    {candidate.otherAccount ? ` · ${candidate.otherAccount}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {!candidates.length && (
              <p className="text-sm text-gray-500 sm:col-span-2">
                No {review.type === "TRANSFER" ? "transfer" : normalType.toLowerCase()} with this
                account and amount was found. Add the record first, then refresh matches.
              </p>
            )}
            {selected && (
              <Link
                className="text-sm text-blue-400 underline sm:col-span-2"
                href={activityHref(selected.id, selected.type)}
                target="_blank"
              >
                View selected record
              </Link>
            )}
            <Link
              className={`${secondaryButton} justify-self-start`}
              href={newRecordHref}
              target="_blank"
            >
              Add{" "}
              {review.type === "TRANSFER"
                ? "transfer"
                : review.type === "REFUND"
                  ? "refund"
                  : normalType.toLowerCase()}
            </Link>
          </div>
        )
      )}
    </article>
  );
}
