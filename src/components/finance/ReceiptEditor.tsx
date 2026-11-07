"use client";

import Link from "next/link";
import FinanceDocumentPanel from "./FinanceDocumentPanel";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useSnackbar } from "@/context/SnackbarContext";
import { receiptDifference, receiptMoney, type FinanceReceipt } from "@/lib/finance/receipts";
import type { FinanceAccount, FinanceCategory } from "@/lib/finance/validation";
import { displayAmount, type TransactionPage } from "@/lib/finance/transactions";
import { fieldClass, financeRequest, FinanceLoadError, FinanceRequestError, primaryButton, secondaryButton, useFinanceData } from "./shared";

export default function ReceiptEditor({ id, initialDate, currencies }: { id?: string; initialDate?: string; currencies: string[] }) {
  return id ? <ExistingReceipt id={id} currencies={currencies} /> : <ReceiptForm initialDate={initialDate!} currencies={currencies} />;
}
function ExistingReceipt({ id, currencies }: { id: string; currencies: string[] }) {
  const result = useFinanceData<{ receipt: FinanceReceipt }>(`/api/finance/receipts/${id}`);
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (result.loading || !result.data) return <p role="status">Loading receipt…</p>;
  return <ReceiptForm key={result.data.receipt.updatedAt} existing={result.data.receipt} initialDate={result.data.receipt.date} currencies={currencies} refresh={result.retry} />;
}
function ReceiptForm({ existing, initialDate, currencies, refresh }: { existing?: FinanceReceipt; initialDate: string; currencies: string[]; refresh?: () => void }) {
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const categories = useFinanceData<{ categories: FinanceCategory[] }>("/api/finance/categories");
  const [draft, setDraft] = useState(() => ({ merchant: existing?.merchant ?? "", date: initialDate, accountId: String(existing?.account?.id ?? ""), categoryId: String(existing?.category?.id ?? ""), currency: existing?.currency ?? "CAD", subtotal: existing?.subtotal ?? "", tax: existing?.tax ?? "0", tip: existing?.tip ?? "0", total: existing?.total ?? "", notes: existing?.notes ?? "", transactionAction: existing?.transaction ? "LINK" : "UNMATCHED", transactionId: String(existing?.transaction?.id ?? "") }));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FinanceRequestError | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);
  const [confirmation, setConfirmation] = useState<"receipt" | "document" | null>(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const requestKey = useRef<string | null>(null), saving = useRef(false);
  const router = useRouter(), { showMessage } = useSnackbar();
  const patch = (key: keyof typeof draft, value: string) => { setDraft(previous => ({ ...previous, [key]: value })); setAcknowledge(false); };
  let difference: string | null = null;
  try { difference = receiptDifference(draft.subtotal, draft.tax, draft.tip || "0", draft.total); } catch { /* Show the warning only once all amounts are valid. */ }
  const mismatch = difference !== null && difference !== "0.0000";
  const transactionParams = new URLSearchParams({ type: "EXPENSE", account: draft.accountId, currency: draft.currency, search: transactionSearch });
  if (transactionDate) { transactionParams.set("from", transactionDate); transactionParams.set("to", transactionDate); }
  const transactions = useFinanceData<TransactionPage>(`/api/finance/transactions?${transactionParams}`);
  const eligible = transactions.data?.transactions.filter(transaction => {
    try { return transaction.type === "EXPENSE" && transaction.currency === draft.currency && transaction.account.id === Number(draft.accountId) && receiptMoney(transaction.amount.replace(/^-/, "")) === receiptMoney(draft.total); }
    catch { return false; }
  }) ?? [];
  const accountOptions = accounts.data?.accounts.filter(account => account.active || account.id === existing?.account?.id) ?? [];
  const categoryOptions = categories.data?.categories.filter(category => category.type === "EXPENSE" && (category.active || category.id === existing?.category?.id)) ?? [];
  const selectedTransaction = eligible.find(item => String(item.id) === draft.transactionId);
  async function save(event: FormEvent) {
    event.preventDefault(); if (saving.current) return;
    saving.current = true; setBusy(true); setFailure(null);
    try {
      requestKey.current ??= crypto.randomUUID();
      const details = { ...draft, accountId: Number(draft.accountId), categoryId: Number(draft.categoryId), tip: draft.tip || "0", transactionId: draft.transactionAction === "LINK" ? Number(draft.transactionId) : null, acknowledgeMismatch: acknowledge, ...(existing ? { expectedUpdatedAt: existing.updatedAt } : { requestKey: requestKey.current }) };
      const body = new FormData(); body.append("details", JSON.stringify(details)); if (file) body.append("file", file);
      const result = await financeRequest<{ receipt: FinanceReceipt }>(existing ? `/api/finance/receipts/${existing.id}` : "/api/finance/receipts", { method: existing ? "PATCH" : "POST", body });
      showMessage("Receipt saved successfully.");
      if (existing) refresh?.(); else router.push(`/finance/receipts/${result.receipt.id}`);
    } catch (error) { const failure = error instanceof FinanceRequestError ? error : new FinanceRequestError(error instanceof Error ? error.message : "Could not save the receipt."); setFailure(failure); showMessage(failure.message); }
    finally { saving.current = false; setBusy(false); }
  }
  async function remove() {
    if (!existing || !confirmation || saving.current) return;
    saving.current = true; setBusy(true); setFailure(null);
    try {
      await financeRequest(`/api/finance/receipts/${existing.id}${confirmation === "document" ? "/document" : ""}`, { method: "DELETE", headers: { "If-Match": existing.updatedAt } });
      showMessage(confirmation === "document" ? "Document deleted. Receipt details were kept." : "Receipt deleted. Its transaction was kept.");
      if (confirmation === "document") refresh?.(); else router.push("/finance/receipts");
    } catch (error) { setFailure(new FinanceRequestError(error instanceof Error ? error.message : "Could not delete the receipt.")); }
    finally { saving.current = false; setBusy(false); setConfirmation(null); }
  }
  return <div className="space-y-5">
    {existing && <section className="card space-y-3"><Link href={`/finance/reconciliation?kind=RECEIPT&source=${existing.id}`} className={secondaryButton}>Reconcile receipt payments</Link>{!!existing.allocations?.length && <div className="flex flex-wrap gap-3">{existing.allocations.map(allocation => <span key={allocation.id} className="text-sm">Confirmed {allocation.amount} {existing.currency}{allocation.transactionId && <Link className="ml-2 text-blue-400 underline" href={`/finance/transactions/${allocation.transactionId}`}>Transaction #{allocation.transactionId}</Link>}</span>)}</div>}</section>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{existing ? "Receipt details" : "New receipt"}</h2><Link href="/finance/receipts" className={secondaryButton}>← Receipt history</Link></div>
    {failure && <div className="card space-y-3" role="alert"><p className="text-rose-500">{failure.message}</p>{failure.existingId && <div className="flex flex-wrap gap-2"><Link className={secondaryButton} href={failure.code?.startsWith("DUPLICATE_RECEIPT") || failure.code === "RECEIPT_REQUEST_USED" ? `/finance/receipts/${failure.existingId}` : `/finance/transactions/${failure.existingId}`}>Review existing {failure.code === "DUPLICATE_RECEIPT" || failure.code === "RECEIPT_REQUEST_USED" ? "receipt" : "expense"}</Link>{failure.code === "EXISTING_EXPENSE" && <button type="button" className={primaryButton} onClick={() => setDraft({ ...draft, transactionAction: "LINK", transactionId: String(failure.existingId) })}>Link this expense instead</button>}</div>}</div>}
    {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}{categories.error && <FinanceLoadError error={categories.error} retry={categories.retry} />}
    {existing?.linkWarning && <p role="alert" className="card text-amber-500">{existing.linkWarning}</p>}
    {confirmation && <div className="card space-y-3" role="alert"><p>{confirmation === "document" ? "Delete the uploaded document? Your receipt details and linked transaction will remain." : "Delete this receipt and its uploaded document? The linked transaction will remain; this does not reverse the expense."}</p><div className="flex gap-2"><button disabled={busy} type="button" onClick={remove} className={`${primaryButton} bg-rose-600`}>Confirm deletion</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)} className={secondaryButton}>Cancel</button></div></div>}
    {(accounts.loading || categories.loading) && <p role="status">Loading accounts and categories…</p>}
    <form aria-busy={busy} onSubmit={save}>
      <fieldset disabled={busy || accounts.loading || categories.loading || !!accounts.error || !!categories.error} className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
        <section className="card min-w-0 space-y-4">
          <h3 className="text-lg font-semibold">Receipt information</h3>
          <label className="block space-y-1">Merchant / store<input aria-label="Merchant / store" required maxLength={200} className={fieldClass} value={draft.merchant} onChange={event => patch("merchant", event.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">Purchase date<input aria-label="Purchase date" type="date" required className={fieldClass} value={draft.date} onChange={event => patch("date", event.target.value)} /></label>
            <label className="block space-y-1">Payment account<select aria-label="Payment account" required className={fieldClass} value={draft.accountId} onChange={event => patch("accountId", event.target.value)}><option value="">Choose an account</option>{accountOptions.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}{account.active ? "" : " (inactive)"}</option>)}</select></label>
            <label className="block space-y-1">Currency<select aria-label="Receipt currency" className={fieldClass} value={draft.currency} onChange={event => patch("currency", event.target.value)}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>
            <label className="block space-y-1">Expense category<select aria-label="Expense category" required className={fieldClass} value={draft.categoryId} onChange={event => patch("categoryId", event.target.value)}><option value="">Choose a category</option>{categoryOptions.map(category => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}</select></label>
          </div>
          {!accounts.loading && !accountOptions.length && <Link href="/finance/accounts" className={secondaryButton}>Create a payment account</Link>}{!categories.loading && !categoryOptions.length && <Link href="/finance/categories" className={secondaryButton}>Create an expense category</Link>}
          <div className="grid gap-4 sm:grid-cols-2">{([['subtotal', 'Subtotal'], ['tax', 'Tax'], ['tip', 'Tip (optional)'], ['total', 'Total']] as const).map(([key, label]) => <label key={key} className="block space-y-1">{label}<input aria-label={label} inputMode="decimal" autoComplete="off" required={key !== "tip"} maxLength={20} className={fieldClass} value={draft[key]} onChange={event => patch(key, event.target.value)} /></label>)}</div>
          {mismatch && <div role="alert" className="space-y-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500"><p>Subtotal + tax + tip does not equal total. Difference: {difference} {draft.currency}.</p><label className="flex items-start gap-2"><input type="checkbox" checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)} required />Keep these amounts despite the difference</label></div>}
          <label className="block space-y-1">Notes (optional)<textarea aria-label="Receipt notes" maxLength={2000} rows={3} className={fieldClass} value={draft.notes} onChange={event => patch("notes", event.target.value)} /></label>
          <section className="space-y-3 border-t border-card-border pt-4"><h3 className="font-semibold">Associated transaction</h3><select aria-label="Associated transaction" className={fieldClass} value={draft.transactionAction} onChange={event => patch("transactionAction", event.target.value)}><option value="UNMATCHED">Keep unmatched — no expense created</option><option value="LINK">Link an existing expense</option><option value="CREATE" disabled={!!existing?.transaction}>Create an expense with this receipt</option></select>
            {draft.transactionAction === "CREATE" && <p className="text-sm text-gray-400">Creates one expense for the receipt total in the selected account. Existing expenses are checked before saving. The account must use the receipt currency.</p>}
            {draft.transactionAction === "LINK" && <>
              <label className="block space-y-1 text-sm">Find an expense<input aria-label="Find an expense" className={fieldClass} maxLength={200} placeholder="Search transaction descriptions or merchants" value={transactionSearch} onChange={event => setTransactionSearch(event.target.value)} /></label>
              <label className="block space-y-1 text-sm">Transaction date (optional)<input aria-label="Find expense date" type="date" className={fieldClass} value={transactionDate} onChange={event => setTransactionDate(event.target.value)} /></label>
              {transactions.error && <FinanceLoadError error={transactions.error} retry={transactions.retry} />}
              <label className="block space-y-1 text-sm">Existing expense<select aria-label="Existing expense" required className={fieldClass} value={draft.transactionId} onChange={event => patch("transactionId", event.target.value)}><option value="">Choose an expense with the same account, currency and total</option>{draft.transactionId && !selectedTransaction && <option value={draft.transactionId}>{existing?.transaction?.id === Number(draft.transactionId) ? `${existing.transaction.date} · ${existing.transaction.description}` : `Selected expense #${draft.transactionId}`}</option>}{eligible.map(transaction => <option key={transaction.id} value={transaction.id}>{transaction.date} · {transaction.description} · {displayAmount(transaction.amount, transaction.currency)}</option>)}</select></label>
              {transactions.loading ? <p role="status" className="text-sm">Finding expenses…</p> : <p className="text-sm text-gray-400">Matching amounts among the most recent 25 search results. Search or filter by date to find older expenses. Linking adds no financial movement.</p>}
              {existing?.transaction && <Link href={`/finance/transactions/${existing.transaction.id}`} className={secondaryButton}>View linked transaction</Link>}
            </>}
          </section>
          <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:flex-wrap"><button className={primaryButton} type="submit">{busy ? "Saving…" : "Save receipt"}</button><Link href="/finance/receipts" className={secondaryButton}>Cancel</Link>{existing && <button type="button" className={`${secondaryButton} text-rose-500`} onClick={() => { setConfirmation("receipt"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Delete receipt</button>}</div>
        </section>
        <FinanceDocumentPanel document={existing?.document ?? null} baseUrl={`/api/finance/receipts/${existing?.id}/document`} title="Receipt" file={file} onFile={setFile} onDelete={() => { setConfirmation("document"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </fieldset>
    </form>
  </div>;
}
