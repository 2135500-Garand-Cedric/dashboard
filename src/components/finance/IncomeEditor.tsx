"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useSnackbar } from "@/context/SnackbarContext";
import { INCOME_KINDS, incomeAmounts, type IncomeSource, type DeductionType, type FinanceIncome } from "@/lib/finance/income";
import { MAX_RECEIPT_BYTES, receiptMoney } from "@/lib/finance/receipts";
import type { FinanceAccount, FinanceCategory } from "@/lib/finance/validation";
import { displayAmount, type TransactionPage } from "@/lib/finance/transactions";
import FinanceDocumentPanel from "./FinanceDocumentPanel";
import { fieldClass, financeRequest, FinanceLoadError, FinanceRequestError, primaryButton, secondaryButton, useFinanceData } from "./shared";

export default function IncomeEditor({ id, initialDate, currencies }: { id?: string; initialDate?: string; currencies: string[] }) {
  return id ? <ExistingIncome id={id} currencies={currencies} /> : <IncomeForm initialDate={initialDate!} currencies={currencies} />;
}
function ExistingIncome({ id, currencies }: { id: string; currencies: string[] }) {
  const result = useFinanceData<{ record: FinanceIncome }>(`/api/finance/income/${id}`);
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (result.loading || !result.data) return <p role="status">Loading income record…</p>;
  return <IncomeForm key={result.data.record.updatedAt} existing={result.data.record} initialDate={result.data.record.date} currencies={currencies} refresh={result.retry} />;
}
function IncomeForm({ existing, initialDate, currencies, refresh }: { existing?: FinanceIncome; initialDate: string; currencies: string[]; refresh?: () => void }) {
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const categories = useFinanceData<{ categories: FinanceCategory[] }>("/api/finance/categories");
  const sources = useFinanceData<{ sources: IncomeSource[] }>("/api/finance/income-sources");
  const types = useFinanceData<{ types: DeductionType[] }>("/api/finance/deduction-types");
  const [draft, setDraft] = useState(() => ({ sourceId: String(existing?.source?.id ?? ""), description: existing?.description ?? "", date: initialDate, periodStart: existing?.periodStart ?? "", periodEnd: existing?.periodEnd ?? "", accountId: String(existing?.account?.id ?? ""), categoryId: String(existing?.category?.id ?? ""), currency: existing?.currency ?? "CAD", grossAmount: existing?.grossAmount ?? "", netAmount: existing?.netAmount ?? "", notes: existing?.notes ?? "", transactionAction: existing?.transaction ? "LINK" : "UNMATCHED", transactionId: String(existing?.transaction?.id ?? "") }));
  const [deductions, setDeductions] = useState(() => existing?.deductions.map(line => ({ typeId: String(line.typeId), amount: line.amount })) ?? []);
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState<FinanceRequestError | null>(null);
  const [acknowledge, setAcknowledge] = useState(false), [confirmation, setConfirmation] = useState<"record" | "document" | null>(null);
  const [depositSearch, setDepositSearch] = useState(""), [depositDate, setDepositDate] = useState("");
  const requestKey = useRef<string | null>(null), guard = useRef(false), router = useRouter(), { showMessage } = useSnackbar();
  const patch = (key: keyof typeof draft, value: string) => { setDraft(previous => ({ ...previous, [key]: value })); setAcknowledge(false); };
  const sourceOptions = sources.data?.sources.filter(item => item.active || item.id === existing?.source?.id) ?? [];
  const accountOptions = accounts.data?.accounts.filter(item => item.active || item.id === existing?.account?.id) ?? [];
  const categoryOptions = categories.data?.categories.filter(item => item.type === "INCOME" && (item.active || item.id === existing?.category?.id)) ?? [];
  const typeOptions = types.data?.types.filter(item => item.active || existing?.deductions.some(line => line.typeId === item.id)) ?? [];
  let amounts: ReturnType<typeof incomeAmounts> | null = null;
  try { amounts = incomeAmounts(draft.grossAmount || null, deductions, draft.netAmount); } catch { /* Wait for valid decimal fields. */ }
  const mismatch = amounts?.difference != null && amounts.difference !== "0.0000";
  const params = new URLSearchParams({ type: "INCOME", account: draft.accountId, currency: draft.currency, search: depositSearch });
  if (depositDate) { params.set("from", depositDate); params.set("to", depositDate); }
  const deposits = useFinanceData<TransactionPage>(`/api/finance/transactions?${params}`);
  const eligible = deposits.data?.transactions.filter(transaction => {
    try { return transaction.type === "INCOME" && transaction.account.id === Number(draft.accountId) && transaction.currency === draft.currency && receiptMoney(transaction.amount) === receiptMoney(draft.netAmount); }
    catch { return false; }
  }) ?? [];
  const selectedDeposit = eligible.find(item => String(item.id) === draft.transactionId);
  const loads = [accounts, categories, sources, types];
  const disabled = busy || loads.some(result => result.loading || !!result.error);
  const showFailure = (error: unknown) => { const failure = error instanceof FinanceRequestError ? error : new FinanceRequestError(error instanceof Error ? error.message : "Could not save income."); setFailure(failure); showMessage(failure.message); };
  async function save(event: FormEvent) {
    event.preventDefault(); if (guard.current) return;
    guard.current = true; setBusy(true); setFailure(null);
    try {
      requestKey.current ??= crypto.randomUUID();
      const details = { ...draft, sourceId: Number(draft.sourceId), accountId: draft.accountId ? Number(draft.accountId) : null, categoryId: Number(draft.categoryId), periodStart: draft.periodStart || null, periodEnd: draft.periodEnd || null, grossAmount: draft.grossAmount || null, deductions: deductions.map(line => ({ typeId: Number(line.typeId), amount: line.amount })), transactionId: draft.transactionAction === "LINK" ? Number(draft.transactionId) : null, acknowledgeMismatch: acknowledge, ...(existing ? { expectedUpdatedAt: existing.updatedAt } : { requestKey: requestKey.current }) };
      const body = new FormData(); body.append("details", JSON.stringify(details)); if (file) body.append("file", file);
      const result = await financeRequest<{ record: FinanceIncome }>(existing ? `/api/finance/income/${existing.id}` : "/api/finance/income", { method: existing ? "PATCH" : "POST", body });
      showMessage("Income record saved successfully.");
      if (existing) refresh?.(); else router.push(`/finance/income/${result.record.id}`);
    } catch (error) { showFailure(error); }
    finally { guard.current = false; setBusy(false); }
  }
  async function remove() {
    if (!existing || !confirmation || guard.current) return;
    guard.current = true; setBusy(true); setFailure(null);
    try {
      await financeRequest(`/api/finance/income/${existing.id}${confirmation === "document" ? "/document" : ""}`, { method: "DELETE", headers: { "If-Match": existing.updatedAt } });
      showMessage(confirmation === "document" ? "Pay stub deleted. Income details were kept." : "Income record deleted. Its bank transaction was kept.");
      if (confirmation === "document") refresh?.(); else router.push("/finance/income");
    } catch (error) { showFailure(error); }
    finally { guard.current = false; setBusy(false); setConfirmation(null); }
  }
  const confirm = (kind: "record" | "document") => { setConfirmation(kind); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{existing ? "Income details" : "New income record"}</h2><div className="flex flex-wrap gap-2"><Link href="/finance/income/settings" className={secondaryButton}>Sources & deductions</Link><Link href="/finance/income" className={secondaryButton}>← Income history</Link></div></div>
    {failure && <div role="alert" className="card space-y-3"><p className="text-rose-500">{failure.message}</p>{failure.existingId && <div className="flex flex-wrap gap-2"><Link className={secondaryButton} href={failure.code === "EXISTING_DEPOSIT" ? `/finance/transactions/${failure.existingId}` : failure.code === "DUPLICATE_RECEIPT" ? `/finance/receipts/${failure.existingId}` : `/finance/income/${failure.existingId}`}>Review existing {failure.code === "EXISTING_DEPOSIT" ? "deposit" : failure.code === "DUPLICATE_RECEIPT" ? "receipt" : "income record"}</Link>{failure.code === "EXISTING_DEPOSIT" && <button type="button" className={primaryButton} onClick={() => setDraft({ ...draft, transactionAction: "LINK", transactionId: String(failure.existingId) })}>Link this deposit instead</button>}</div>}</div>}
    {loads.map((result, index) => result.error && <FinanceLoadError key={index} error={result.error} retry={result.retry} />)}
    {existing?.linkWarning && <p role="alert" className="card text-amber-500">{existing.linkWarning}</p>}
    {confirmation && <div role="alert" className="card space-y-3"><p>{confirmation === "document" ? "Delete the pay stub? Income details and the linked bank deposit will remain." : "Delete this income record and its pay stub? The bank transaction will remain; this does not reverse money received."}</p><div className="flex gap-2"><button type="button" disabled={busy} onClick={remove} className={`${primaryButton} bg-rose-600`}>Confirm deletion</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)} className={secondaryButton}>Cancel</button></div></div>}
    <form onSubmit={save}><fieldset disabled={disabled} className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
      <section className="card min-w-0 space-y-4"><h3 className="text-lg font-semibold">Income information</h3>
        <label className="block space-y-1">Employer / income source<select aria-label="Employer / income source" required value={draft.sourceId} className={fieldClass} onChange={event => patch("sourceId", event.target.value)}><option value="">Choose a source</option>{sourceOptions.map(source => <option key={source.id} value={source.id}>{source.name} · {INCOME_KINDS[source.kind]}{source.active ? "" : " (inactive)"}</option>)}</select></label>
        {!sources.loading && !sourceOptions.length && <Link href="/finance/income/settings" className={secondaryButton}>Add an income source</Link>}
        <label className="block space-y-1">Description<input aria-label="Income description" required maxLength={300} value={draft.description} className={fieldClass} placeholder="Paycheque, gift, interest, reimbursement…" onChange={event => patch("description", event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1">Pay date<input aria-label="Pay date" type="date" required value={draft.date} className={fieldClass} onChange={event => patch("date", event.target.value)} /></label><label className="block space-y-1">Currency<select aria-label="Income currency" className={fieldClass} value={draft.currency} onChange={event => patch("currency", event.target.value)}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>
          <label className="block space-y-1">Pay period start (optional)<input aria-label="Pay period start" type="date" required={!!draft.periodEnd} value={draft.periodStart} className={fieldClass} onChange={event => patch("periodStart", event.target.value)} /></label><label className="block space-y-1">Pay period end (optional)<input aria-label="Pay period end" type="date" required={!!draft.periodStart} min={draft.periodStart || undefined} value={draft.periodEnd} className={fieldClass} onChange={event => patch("periodEnd", event.target.value)} /></label>
          <label className="block space-y-1">Gross income (optional)<input aria-label="Gross income" inputMode="decimal" maxLength={20} autoComplete="off" value={draft.grossAmount} className={fieldClass} onChange={event => patch("grossAmount", event.target.value)} /></label><label className="block space-y-1">Net income<input aria-label="Net income" inputMode="decimal" required maxLength={20} autoComplete="off" value={draft.netAmount} className={fieldClass} onChange={event => patch("netAmount", event.target.value)} /></label>
        </div>
        <section className="space-y-3 border-t border-card-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Deductions</h3><button type="button" className={secondaryButton} disabled={deductions.length >= 30 || !typeOptions.some(type => type.active && !deductions.some(line => Number(line.typeId) === type.id))} onClick={() => { const type = typeOptions.find(type => type.active && !deductions.some(line => Number(line.typeId) === type.id)); setDeductions([...deductions, { typeId: String(type?.id ?? ""), amount: "0" }]); setAcknowledge(false); }}>Add deduction</button></div>
          {deductions.map((line, index) => <div key={index} className="grid min-w-0 gap-2 rounded-lg border border-card-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><label className="block space-y-1 text-sm">Type<select aria-label={`Deduction ${index + 1} type`} required className={fieldClass} value={line.typeId} onChange={event => { setDeductions(deductions.map((item, i) => i === index ? { ...item, typeId: event.target.value } : item)); setAcknowledge(false); }}><option value="">Choose a type</option>{typeOptions.filter(type => String(type.id) === line.typeId || !deductions.some(item => Number(item.typeId) === type.id)).map(type => <option key={type.id} value={type.id}>{type.name}{type.active ? "" : " (inactive)"}</option>)}</select></label><label className="block space-y-1 text-sm">Amount<input aria-label={`Deduction ${index + 1} amount`} required inputMode="decimal" maxLength={20} autoComplete="off" className={fieldClass} value={line.amount} onChange={event => { setDeductions(deductions.map((item, i) => i === index ? { ...item, amount: event.target.value } : item)); setAcknowledge(false); }} /></label><button type="button" className={`${secondaryButton} self-end`} aria-label={`Remove deduction ${index + 1}`} onClick={() => { setDeductions(deductions.filter((_, i) => i !== index)); setAcknowledge(false); }}>Remove</button></div>)}
          {!deductions.length && <p className="text-sm text-gray-400">No deductions. Add lines when applicable.</p>}<Link href="/finance/income/settings" className={secondaryButton}>Manage deduction types</Link>
          {amounts && <p className="text-sm">Total deductions: {displayAmount(amounts.deductionsTotal, draft.currency).replace(/^\+/, "")}</p>}
          {mismatch && <div role="alert" className="space-y-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500"><p>Gross minus deductions does not equal net. Difference: {amounts?.difference} {draft.currency}.</p><label className="flex items-start gap-2"><input type="checkbox" required checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)} />Keep these amounts despite the difference</label></div>}
        </section>
        <label className="block space-y-1">Income category<select aria-label="Income category" required className={fieldClass} value={draft.categoryId} onChange={event => patch("categoryId", event.target.value)}><option value="">Choose a category</option>{categoryOptions.map(category => <option key={category.id} value={category.id}>{category.name}{category.active ? "" : " (inactive)"}</option>)}</select></label>
        {!categories.loading && !categoryOptions.length && <Link href="/finance/categories" className={secondaryButton}>Add an income category</Link>}
        <label className="block space-y-1">Notes (optional)<textarea aria-label="Income notes" rows={3} maxLength={2000} className={fieldClass} value={draft.notes} onChange={event => patch("notes", event.target.value)} /></label>
        <section className="space-y-3 border-t border-card-border pt-4"><h3 className="font-semibold">Bank deposit</h3><p className="text-sm text-gray-400">Gross and deductions describe earnings. Only a transaction records money received. Linking a deposit does not add income again.</p>
          <label className="block space-y-1">Deposit account (optional while unmatched)<select aria-label="Deposit account" required={draft.transactionAction !== "UNMATCHED"} className={fieldClass} value={draft.accountId} onChange={event => patch("accountId", event.target.value)}><option value="">No deposit account selected</option>{accountOptions.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}{account.active ? "" : " (inactive)"}</option>)}</select></label>
          <select aria-label="Associated deposit" className={fieldClass} value={draft.transactionAction} onChange={event => patch("transactionAction", event.target.value)}><option value="UNMATCHED">Keep unmatched — no deposit created</option><option value="LINK">Link an existing income deposit</option><option value="CREATE" disabled={!!existing?.transaction}>Create a deposit for the net amount</option></select>
          {draft.transactionAction === "CREATE" && <p className="text-sm text-gray-400">Creates one income transaction for the net amount. Account and record currencies must match. Existing deposits are checked before saving.</p>}
          {draft.transactionAction === "LINK" && <><label className="block space-y-1 text-sm">Find a deposit<input aria-label="Find a deposit" maxLength={200} className={fieldClass} value={depositSearch} onChange={event => setDepositSearch(event.target.value)} /></label><label className="block space-y-1 text-sm">Deposit date (optional)<input aria-label="Find deposit date" type="date" className={fieldClass} value={depositDate} onChange={event => setDepositDate(event.target.value)} /></label>{deposits.error && <FinanceLoadError error={deposits.error} retry={deposits.retry} />}<label className="block space-y-1 text-sm">Existing deposit<select aria-label="Existing deposit" required className={fieldClass} value={draft.transactionId} onChange={event => patch("transactionId", event.target.value)}><option value="">Choose a deposit with the same account, currency and net amount</option>{draft.transactionId && !selectedDeposit && <option value={draft.transactionId}>{existing?.transaction?.id === Number(draft.transactionId) ? `${existing.transaction.date} · ${existing.transaction.description}` : `Selected deposit #${draft.transactionId}`}</option>}{eligible.map(transaction => <option key={transaction.id} value={transaction.id}>{transaction.date} · {transaction.description} · {displayAmount(transaction.amount, transaction.currency)}</option>)}</select></label><p className="text-sm text-gray-400">Matches among the latest 25 search results. Search or filter by date to find older deposits. Pay date and bank posting date may differ.</p>{existing?.transaction && <Link href={`/finance/transactions/${existing.transaction.id}`} className={secondaryButton}>View linked deposit</Link>}</>}
        </section>
        <div className="flex flex-wrap gap-2 pt-3"><button type="submit" className={primaryButton}>{busy ? "Saving…" : "Save income record"}</button><Link href="/finance/income" className={secondaryButton}>Cancel</Link>{existing && <button type="button" className={`${secondaryButton} text-rose-500`} onClick={() => confirm("record")}>Delete income record</button>}</div>
      </section>
      <FinanceDocumentPanel document={existing?.document ?? null} baseUrl={existing ? `/api/finance/income/${existing.id}/document` : ""} title="Pay stub" file={file} onFile={chosen => { if (chosen && (!chosen.size || chosen.size > MAX_RECEIPT_BYTES)) { showFailure(new FinanceRequestError("Choose an image or PDF up to 15 MB.")); return; } setFile(chosen); setFailure(null); }} onDelete={() => confirm("document")} />
    </fieldset></form>
  </div>;
}
