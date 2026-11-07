"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { FinanceAccount, FinanceCategory } from "@/lib/finance/validation";
import { TRANSACTION_TYPES, type TransactionType, type FinanceTransaction } from "@/lib/finance/transactions";
import { useSnackbar } from "@/context/SnackbarContext";
import { fieldClass, primaryButton, secondaryButton, FinanceLoadError, FinanceRequestError, financeRequest, useFinanceData } from "./shared";

export default function TransactionEntry({ id, initialDate }: { id?: string; initialDate?: string }) {
  return id ? <ExistingEntry id={id} /> : <EntryForm initialDate={initialDate!} />;
}

function ExistingEntry({ id }: { id: string }) {
  const { data, loading, error, retry } = useFinanceData<{ transaction: FinanceTransaction }>(`/api/finance/transactions/${encodeURIComponent(id)}`);
  if (error) return <FinanceLoadError error={error} retry={retry} />;
  if (loading || !data) return <p role="status" className="card">Loading transaction…</p>;
  return <EntryForm key={data.transaction.updatedAt} initialDate={data.transaction.date} existing={data.transaction} />;
}

function EntryForm({ initialDate, existing }: { initialDate: string; existing?: FinanceTransaction }) {
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const categories = useFinanceData<{ categories: FinanceCategory[] }>("/api/finance/categories");
  const router = useRouter();
  const { showMessage } = useSnackbar();
  const requestKey = useRef<string | null>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FinanceRequestError | null>(null);
  const [draft, setDraft] = useState(() => ({
    date: initialDate, description: existing?.description ?? "", type: existing?.type ?? "EXPENSE" as TransactionType,
    amount: existing?.amount.replace(/^-/, "") ?? "", accountId: existing ? String(existing.account.id) : "",
    categoryId: existing?.category ? String(existing.category.id) : "", counterparty: existing?.counterparty ?? "", notes: existing?.notes ?? "",
    destinationAccountId: existing?.transfer ? String(existing.transfer.account.id) : "", destinationAmount: existing?.transfer?.amount ?? "",
    adjustmentDirection: existing?.amount.startsWith("-") ? "OUT" : "IN",
  }));
  const account = accounts.data?.accounts.find(item => item.id === Number(draft.accountId));
  const destination = accounts.data?.accounts.find(item => item.id === Number(draft.destinationAccountId));
  const needsCategory = ["EXPENSE", "INCOME", "REFUND"].includes(draft.type);
  const crossCurrency = draft.type === "TRANSFER" && account && destination && account.currency !== destination.currency;
  const availableAccounts = accounts.data?.accounts.filter(item => item.active || item.id === existing?.account.id || item.id === existing?.transfer?.account.id) ?? [];
  const availableCategories = categories.data?.categories.filter(item => (item.active || item.id === existing?.category?.id) && item.type === (draft.type === "INCOME" ? "INCOME" : "EXPENSE")) ?? [];
  const readOnly = existing?.source === "IMPORTED" || existing?.editable === false;

  async function save(allowDuplicate = false) {
    if (saving.current || readOnly) return;
    saving.current = true; setBusy(true); setFailure(null);
    try {
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      const body = {
        date: draft.date, description: draft.description, type: draft.type,
        amount: draft.type === "ADJUSTMENT" && draft.adjustmentDirection === "OUT" ? `-${draft.amount}` : draft.amount,
        currency: account?.currency ?? existing?.currency ?? "", accountId: Number(draft.accountId),
        categoryId: needsCategory ? Number(draft.categoryId) : null, counterparty: draft.counterparty || null, notes: draft.notes || null,
        destinationAccountId: draft.type === "TRANSFER" ? Number(draft.destinationAccountId) : null,
        destinationAmount: crossCurrency ? draft.destinationAmount : null, allowDuplicate,
        ...(existing ? { expectedUpdatedAt: existing.updatedAt } : { requestKey: requestKey.current }),
      };
      await financeRequest(existing ? `/api/finance/transactions/${existing.id}` : "/api/finance/transactions", { method: existing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      showMessage(existing ? "Transaction updated successfully." : "Transaction saved successfully.");
      router.push("/finance/transactions");
    } catch (error) {
      const result = error instanceof FinanceRequestError ? error : new FinanceRequestError(error instanceof Error ? error.message : "Unable to save transaction.");
      setFailure(result); showMessage(result.message);
    } finally { saving.current = false; setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void save(); }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{existing ? readOnly ? "Transaction details" : "Edit transaction" : "New transaction"}</h2><Link href="/finance/transactions" className={secondaryButton}>← Transaction history</Link></div>
    {existing && <section className="card space-y-3"><Link href={`/finance/reconciliation?kind=${existing.type === "REFUND" ? "REFUND" : "DUPLICATE"}&source=${existing.id}`} className={secondaryButton}>Reconcile / view matches</Link>{existing.excludedAmount && existing.excludedAmount !== "0.0000" && <p className="text-sm text-amber-500">Counted amount: {existing.ledgerAmount} {existing.currency}. {existing.excludedAmount} is confirmed duplicate activity retained for audit.</p>}</section>}
    {!!existing?.receipts?.length && <section className="card max-w-5xl space-y-3"><h3 className="text-lg font-semibold">Linked receipts ({existing.receipts.length})</h3><div className="flex flex-wrap gap-2">{existing.receipts.map(receipt => <Link key={receipt.id} href={`/finance/receipts/${receipt.id}`} className={`${secondaryButton} max-w-full break-words`}>
      {existing.receipts.length === 1 ? "View receipt" : `View receipt #${receipt.id} — ${receipt.merchant || "Receipt"} · ${receipt.date}`}
    </Link>)}</div></section>}
    {!!existing?.incomeRecords?.length && <section className="card max-w-5xl space-y-3"><h3 className="text-lg font-semibold">Linked income records ({existing.incomeRecords.length})</h3><div className="flex flex-wrap gap-2">{existing.incomeRecords.map(record => <Link key={record.id} href={`/finance/income/${record.id}`} className={`${secondaryButton} max-w-full break-words`}>{existing.incomeRecords.length === 1 ? "View income / pay stub" : `${record.description} · ${record.date}`}</Link>)}</div></section>}
    {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}
    {categories.error && <FinanceLoadError error={categories.error} retry={categories.retry} />}
    {failure && <div role="alert" className="card space-y-3 border-rose-500/40"><p className="text-rose-500">{failure.message}</p>{failure.existingId && <div className="flex flex-wrap gap-3"><Link href={`/finance/transactions/${failure.existingId}`} className={secondaryButton}>Review existing transaction</Link>{failure.code === "DUPLICATE_TRANSACTION" && <button type="button" disabled={busy} className={primaryButton} onClick={() => void save(true)}>Save as a separate transaction</button>}</div>}</div>}
    {readOnly && <p role="alert" className="card">Imported entries and transactions linked to statements cannot be edited through manual transaction management.</p>}
    {!accounts.loading && accounts.data && !availableAccounts.length && <div className="card space-y-3"><p>Create an active account before entering transactions.</p><Link href="/finance/accounts" className={primaryButton}>Manage accounts</Link></div>}
    <form onSubmit={submit} className="card max-w-5xl">
      <fieldset disabled={busy || accounts.loading || categories.loading || !!accounts.error || !!categories.error || !availableAccounts.length || readOnly} className="min-w-0 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2"><span className="text-sm font-medium">Transaction type</span><select aria-label="Transaction type" className={fieldClass} value={draft.type} onChange={event => { setDraft({ ...draft, type: event.target.value as TransactionType, categoryId: "", amount: draft.amount.replace(/^-/, ""), ...(event.target.value !== "TRANSFER" ? { destinationAccountId: "", destinationAmount: "" } : {}) }); setFailure(null); }}>{Object.entries(TRANSACTION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block space-y-2"><span className="text-sm font-medium">Date</span><input aria-label="Date" type="date" required className={fieldClass} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
        </div>
        {draft.type === "TRANSFER" && <p className="rounded-lg bg-blue-500/10 p-3 text-sm">Use transfers for moves between your own accounts, including credit card bill payments and cash withdrawals into a tracked cash account.</p>}
        {draft.type === "REFUND" && <p className="rounded-lg bg-blue-500/10 p-3 text-sm">A refund returns money to your account against an expense category. It is kept separate from income.</p>}
        <label className="block space-y-2"><span className="text-sm font-medium">Description</span><input aria-label="Description" required maxLength={300} className={fieldClass} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2"><span className="text-sm font-medium">{draft.type === "TRANSFER" ? "From account" : "Account"}</span><select aria-label={draft.type === "TRANSFER" ? "From account" : "Account"} required className={fieldClass} value={draft.accountId} onChange={event => setDraft({ ...draft, accountId: event.target.value, ...(event.target.value === draft.destinationAccountId ? { destinationAccountId: "", destinationAmount: "" } : {}) })}><option value="">Choose an account</option>{availableAccounts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}{item.active ? "" : " (inactive)"}</option>)}</select></label>
          <label className="block space-y-2"><span className="text-sm font-medium">Currency</span><input aria-label="Currency" className={fieldClass} readOnly value={account?.currency ?? existing?.currency ?? ""} placeholder="Choose an account" /></label>
          <label className="block space-y-2"><span className="text-sm font-medium">{draft.type === "TRANSFER" ? "Amount sent" : "Amount"}</span><input aria-label={draft.type === "TRANSFER" ? "Amount sent" : "Amount"} required inputMode="decimal" maxLength={20} autoComplete="off" placeholder="0.00" className={fieldClass} value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></label>
          {draft.type === "ADJUSTMENT" && <label className="block space-y-2"><span className="text-sm font-medium">Adjustment direction</span><select aria-label="Adjustment direction" className={fieldClass} value={draft.adjustmentDirection} onChange={event => setDraft({ ...draft, adjustmentDirection: event.target.value })}><option value="IN">Increase / money in</option><option value="OUT">Decrease / money out</option></select></label>}
          {needsCategory && <label className="block space-y-2"><span className="text-sm font-medium">Category</span><select aria-label="Category" required className={fieldClass} value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Choose a category</option>{availableCategories.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inactive)"}</option>)}</select></label>}
          {draft.type === "TRANSFER" && <label className="block space-y-2"><span className="text-sm font-medium">To account</span><select aria-label="To account" required className={fieldClass} value={draft.destinationAccountId} onChange={event => setDraft({ ...draft, destinationAccountId: event.target.value, destinationAmount: "" })}><option value="">Choose a destination</option>{availableAccounts.filter(item => String(item.id) !== draft.accountId).map(item => <option key={item.id} value={item.id}>{item.name} · {item.currency}{item.active ? "" : " (inactive)"}</option>)}</select></label>}
          {crossCurrency && <label className="block space-y-2"><span className="text-sm font-medium">Amount received ({destination.currency})</span><input aria-label={`Amount received (${destination.currency})`} required inputMode="decimal" maxLength={20} className={fieldClass} value={draft.destinationAmount} onChange={event => setDraft({ ...draft, destinationAmount: event.target.value })} /></label>}
        </div>
        {needsCategory && !categories.loading && categories.data && !availableCategories.length && <p className="text-sm text-amber-500">Create an active {draft.type === "INCOME" ? "income" : "expense"} category first. <Link href="/finance/categories" className="underline">Manage categories</Link></p>}
        <label className="block space-y-2"><span className="text-sm font-medium">Merchant or counterparty (optional)</span><input aria-label="Merchant or counterparty (optional)" maxLength={200} autoComplete="off" className={fieldClass} value={draft.counterparty} onChange={event => setDraft({ ...draft, counterparty: event.target.value })} /></label>
        <label className="block space-y-2"><span className="text-sm font-medium">Notes (optional)</span><textarea aria-label="Notes (optional)" rows={3} maxLength={2000} className={fieldClass} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
        <div className="flex flex-wrap gap-3"><button type="submit" className={primaryButton}>{busy ? "Saving…" : existing ? "Save changes" : "Save transaction"}</button><Link href="/finance/transactions" className={secondaryButton}>Cancel</Link></div>
      </fieldset>
    </form>
  </div>;
}
