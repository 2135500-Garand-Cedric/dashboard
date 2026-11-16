"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { activityHref } from "@/lib/finance/activity-links";
import type { FinanceTransaction } from "@/lib/finance/transactions";
import TransactionEntry from "./TransactionEntry";
import { FinanceLoadError, useFinanceData } from "./shared";
export default function LegacyActivity({ id }: { id: string }) {
  const result = useFinanceData<{ transaction: FinanceTransaction }>(
      `/api/finance/transactions/${id}`,
    ),
    router = useRouter();
  const transaction = result.data?.transaction;
  useEffect(() => {
    if (transaction && transaction.type !== "ADJUSTMENT")
      router.replace(activityHref(transaction.id, transaction.type));
  }, [transaction, router]);
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  return transaction?.type === "ADJUSTMENT" ? (
    <TransactionEntry id={id} />
  ) : (
    <p role="status">Opening record…</p>
  );
}
