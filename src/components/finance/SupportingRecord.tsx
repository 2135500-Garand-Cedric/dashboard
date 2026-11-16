"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FinanceReceipt } from "@/lib/finance/receipts";
import type { FinanceIncome } from "@/lib/finance/income";
import IncomeEditor from "./IncomeEditor";
import ReceiptEditor from "./ReceiptEditor";
import { useFinanceData, FinanceLoadError } from "./shared";

// Preserve old record IDs and unattached documents without presenting a second money entry.
export default function SupportingRecord({
  id,
  kind,
  currencies,
}: {
  id: string;
  kind: "income" | "receipt";
  currencies: string[];
}) {
  const result = useFinanceData<{ receipt?: FinanceReceipt; record?: FinanceIncome }>(
      `/api/finance/${kind === "income" ? "income" : "receipts"}/${id}`,
    ),
    router = useRouter();
  const record = result.data?.record ?? result.data?.receipt;
  const transactionId = record?.transaction?.id;
  useEffect(() => {
    if (transactionId)
      router.replace(
        kind === "income"
          ? `/finance/income/deposits/${transactionId}`
          : `/finance/expenses/${transactionId}`,
      );
  }, [transactionId, kind, router]);
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (!record || transactionId) return <p role="status">Opening financial record…</p>;
  return (
    <div className="space-y-5">
      {kind === "income" ? (
        <IncomeEditor id={id} currencies={currencies} unified onSaved={result.retry} />
      ) : (
        <ReceiptEditor id={id} currencies={currencies} expenseMode onSaved={result.retry} />
      )}
    </div>
  );
}
