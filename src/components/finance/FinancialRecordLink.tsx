"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { activityHref } from "@/lib/finance/activity-links";
import type { FinanceTransaction } from "@/lib/finance/transactions";
import { financeRequest, secondaryButton } from "./shared";

// Conflict responses identify either supporting details or a ledger movement.
// Resolve that identifier before navigating, so the destination always uses the current activity URL.
export default function FinancialRecordLink({
  kind,
  id,
  children,
}: {
  kind: "INCOME" | "EXPENSE" | "TRANSACTION";
  id: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "TRANSACTION") {
        const { transaction } = await financeRequest<{ transaction: FinanceTransaction }>(
          `/api/finance/transactions/${id}`,
        );
        router.push(activityHref(transaction.id, transaction.type));
      } else {
        type Details = {
          transaction: { id: number } | null;
          allocations?: { transactionId: number | null }[];
        };
        const result = await financeRequest<{ record?: Details; receipt?: Details }>(
          `/api/finance/${kind === "INCOME" ? "income" : "expenses"}/${id}`,
        );
        const details = result.record ?? result.receipt;
        const target =
          details?.transaction?.id ??
          details?.allocations?.find((link) => link.transactionId)?.transactionId;
        if (!target) throw new Error("This record has no associated income or expense to open.");
        router.push(activityHref(target, kind));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to open this record.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button type="button" disabled={busy} className={secondaryButton} onClick={open}>
        {busy ? "Opening…" : children}
      </button>
      {error && (
        <span role="alert" className="text-sm text-rose-500">
          {error}
        </span>
      )}
    </span>
  );
}
