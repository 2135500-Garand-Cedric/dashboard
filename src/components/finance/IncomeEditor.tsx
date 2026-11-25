"use client";
import Link from "next/link";
import FinancialRecordLink from "./FinancialRecordLink";
import type { ReactNode } from "react";
import ActivityNotes from "./ActivityNotes";
import type { StatementPrefill } from "@/lib/finance/statement-prefill";
import { localToday } from "@/lib/work-management/date-format";
import { useSettings } from "@/context/SettingsContext";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useSnackbar } from "@/context/SnackbarContext";
import {
  INCOME_KINDS,
  incomeAmounts,
  type IncomeSource,
  type DeductionType,
  type FinanceIncome,
} from "@/lib/finance/income";
import { MAX_RECEIPT_BYTES } from "@/lib/finance/receipts";
import { type FinanceAccount } from "@/lib/finance/validation";
import {
  displayAmount,
  twoDecimalAmount,
  type FinanceTransaction,
} from "@/lib/finance/transactions";
import FinanceDocumentPanel from "./FinanceDocumentPanel";
import {
  fieldClass,
  financeRequest,
  FinanceLoadError,
  FinanceRequestError,
  primaryButton,
  secondaryButton,
  useFinanceData,
} from "./shared";
function incomeInputAmount(value?: string | null) {
  return value ? twoDecimalAmount(value) : "";
}
// Keep the server-provided currency list identical during hydration.
export function NewIncomeEditor({
  currencies,
  prefill,
}: {
  currencies: string[];
  prefill?: StatementPrefill;
}) {
  const { timeZone } = useSettings();
  return (
    <IncomeEditor
      initialDate={localToday(new Date(), timeZone)}
      currencies={currencies}
      prefill={prefill}
    />
  );
}
export default function IncomeEditor({
  id,
  initialDate,
  currencies,
  initialTransaction,
  prefill,
  onSaved,
  readOnly,
  headerMeta,
  headerActions,
  notesTransaction,
}: {
  initialTransaction?: FinanceTransaction;
  prefill?: StatementPrefill;
  onSaved?: () => void;
  readOnly?: boolean;
  headerMeta?: ReactNode;
  headerActions?: ReactNode;
  notesTransaction?: FinanceTransaction;
  id?: string;
  initialDate?: string;
  currencies: string[];
}) {
  return id ? (
    <ExistingIncome
      id={id}
      currencies={currencies}
      onSaved={onSaved}
      readOnly={readOnly}
      headerMeta={headerMeta}
      headerActions={headerActions}
      notesTransaction={notesTransaction}
    />
  ) : (
    <IncomeForm
      readOnly={readOnly}
      headerMeta={headerMeta}
      headerActions={headerActions}
      notesTransaction={notesTransaction}
      initialDate={initialDate!}
      currencies={currencies}
      initialTransaction={initialTransaction}
      prefill={prefill}
      refresh={onSaved}
    />
  );
}
function ExistingIncome({
  id,
  currencies,
  onSaved,
  readOnly,
  headerMeta,
  headerActions,
  notesTransaction,
}: {
  onSaved?: () => void;
  readOnly?: boolean;
  headerMeta?: ReactNode;
  headerActions?: ReactNode;
  notesTransaction?: FinanceTransaction;
  id: string;
  currencies: string[];
}) {
  const result = useFinanceData<{
    record: FinanceIncome;
  }>(`/api/finance/income/${id}`);
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (result.loading || !result.data) return <p role="status">Loading income record…</p>;
  return (
    <IncomeForm
      key={result.data.record.updatedAt}
      readOnly={readOnly}
      headerMeta={headerMeta}
      headerActions={headerActions}
      notesTransaction={notesTransaction}
      existing={result.data.record}
      initialDate={result.data.record.date}
      currencies={currencies}
      refresh={() => {
        result.retry();
        onSaved?.();
      }}
    />
  );
}
function IncomeForm({
  existing,
  initialDate,
  refresh,
  readOnly,
  headerMeta,
  headerActions,
  notesTransaction,
  initialTransaction,
  prefill,
}: {
  initialTransaction?: FinanceTransaction;
  prefill?: StatementPrefill;
  existing?: FinanceIncome;
  initialDate: string;
  currencies: string[];
  refresh?: () => void;
  readOnly?: boolean;
  headerMeta?: ReactNode;
  headerActions?: ReactNode;
  notesTransaction?: FinanceTransaction;
}) {
  const accounts = useFinanceData<{
    accounts: FinanceAccount[];
  }>("/api/finance/accounts");
  const sources = useFinanceData<{
    sources: IncomeSource[];
  }>("/api/finance/income-sources");
  const types = useFinanceData<{
    types: DeductionType[];
  }>("/api/finance/deduction-types");
  const [draft, setDraft] = useState(() => ({
    sourceId: String(existing?.source?.id ?? ""),
    description:
      existing?.description ?? initialTransaction?.description ?? prefill?.description ?? "",
    date: initialTransaction?.date ?? prefill?.date ?? initialDate,
    periodStart: existing?.periodStart ?? "",
    periodEnd: existing?.periodEnd ?? "",
    accountId: String(
      existing?.account?.id ?? initialTransaction?.account.id ?? prefill?.accountId ?? "",
    ),
    currency: existing?.currency ?? initialTransaction?.currency ?? prefill?.currency ?? "CAD",
    grossAmount: incomeInputAmount(existing?.grossAmount),
    netAmount: incomeInputAmount(
      existing?.netAmount ?? initialTransaction?.amount ?? prefill?.amount,
    ),
    notes: existing?.notes ?? initialTransaction?.notes ?? "",
    transactionAction: existing?.transaction || initialTransaction ? "LINK" : "CREATE",
    transactionId: String(existing?.transaction?.id ?? initialTransaction?.id ?? ""),
  }));
  const [deductions, setDeductions] = useState(
    () =>
      existing?.deductions.map((line) => ({
        typeId: String(line.typeId),
        amount: twoDecimalAmount(line.amount),
      })) ?? [],
  );
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<FinanceRequestError | null>(null);
  const [acknowledge, setAcknowledge] = useState(false),
    [confirmation, setConfirmation] = useState<"document" | null>(null);
  const requestKey = useRef<string | null>(null),
    guard = useRef(false),
    router = useRouter(),
    { showMessage } = useSnackbar();
  const patch = (key: keyof typeof draft, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setAcknowledge(false);
  };
  const originalAmount = (value: string, original?: string | null) =>
    original && value === twoDecimalAmount(original) ? original : value;
  const grossAmount = originalAmount(draft.grossAmount, existing?.grossAmount);
  const netAmount = originalAmount(
    draft.netAmount,
    existing?.netAmount ?? initialTransaction?.amount,
  );
  const sourceOptions =
    sources.data?.sources.filter((item) => item.active || item.id === existing?.source?.id) ?? [];
  const accountOptions =
    accounts.data?.accounts.filter((item) => item.active || item.id === existing?.account?.id) ??
    [];
  const currency =
    accounts.data?.accounts.find((account) => account.id === Number(draft.accountId))?.currency ??
    existing?.account?.currency ??
    initialTransaction?.account.currency ??
    draft.currency;
  const typeOptions =
    types.data?.types.filter(
      (item) => item.active || existing?.deductions.some((line) => line.typeId === item.id),
    ) ?? [];
  const availableTypes = typeOptions.filter(
    (type) => type.active && !deductions.some((line) => Number(line.typeId) === type.id),
  );
  const normalizedDeductions = deductions.map((line) => ({
    ...line,
    amount: originalAmount(
      line.amount.trim() || "0",
      existing?.deductions.find((saved) => saved.typeId === Number(line.typeId))?.amount,
    ),
  }));
  function addDeductions(all: boolean) {
    const additions = all ? availableTypes : availableTypes.slice(0, 1);
    if (deductions.length + additions.length > 30) {
      showMessage(
        "An income record can have up to 30 deductions. Add the ones you need individually.",
      );
      return;
    }
    setDeductions((previous) => [
      ...previous,
      ...additions.map((type) => ({ typeId: String(type.id), amount: "" })),
    ]);
    setAcknowledge(false);
  }
  let amounts: ReturnType<typeof incomeAmounts> | null = null;
  try {
    amounts = incomeAmounts(grossAmount || null, normalizedDeductions, netAmount);
  } catch {
    /* Wait for valid decimal fields. */
  }
  const mismatch = amounts?.difference != null && amounts.difference !== "0.0000";
  const loads = [accounts, sources, types];
  const disabled = busy || loads.some((result) => result.loading || !!result.error);
  const showFailure = (error: unknown) => {
    const failure =
      error instanceof FinanceRequestError
        ? error
        : new FinanceRequestError(
            error instanceof Error ? error.message : "Could not save income.",
          );
    setFailure(failure);
    showMessage(failure.message);
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setFailure(null);
    try {
      requestKey.current ??= crypto.randomUUID();
      const details = {
        ...draft,
        currency,
        sourceId: Number(draft.sourceId),
        accountId: Number(draft.accountId),
        periodStart: draft.periodStart || null,
        periodEnd: draft.periodEnd || null,
        grossAmount: grossAmount || null,
        netAmount,
        deductions: normalizedDeductions.map((line) => ({
          typeId: Number(line.typeId),
          amount: line.amount,
        })),
        transactionId: draft.transactionAction === "LINK" ? Number(draft.transactionId) : null,
        acknowledgeMismatch: acknowledge,
        syncMovement: true,
        ...(existing
          ? { expectedUpdatedAt: existing.updatedAt }
          : { requestKey: requestKey.current }),
      };
      const body = new FormData();
      body.append("details", JSON.stringify(details));
      if (file) body.append("file", file);
      const result = await financeRequest<{
        record: FinanceIncome;
      }>(existing ? `/api/finance/income/${existing.id}` : "/api/finance/income", {
        method: existing ? "PATCH" : "POST",
        body,
      });
      showMessage("Income record saved successfully.");
      refresh?.();
      if (result.record.transaction)
        router.push(`/finance/income/deposits/${result.record.transaction.id}`);
      else if (existing) refresh?.();
      else throw new Error("The saved income has no associated deposit.");
    } catch (error) {
      showFailure(error);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing || !confirmation || guard.current) return;
    guard.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await financeRequest(`/api/finance/income/${existing.id}/document`, {
        method: "DELETE",
        headers: { "If-Match": existing.updatedAt },
      });
      showMessage("Pay stub deleted. Income details were kept.");
      refresh?.();
    } catch (error) {
      showFailure(error);
    } finally {
      guard.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  }
  const confirm = (kind: "document") => {
    setConfirmation(kind);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold">
            {existing ? "Income details" : "New income record"}
          </h2>
          {headerMeta}
        </div>
        <div className="flex flex-wrap gap-2">
          {headerActions}
          <Link href="/finance/income" className={secondaryButton}>
            ← Income history
          </Link>
        </div>
      </div>
      {failure && (
        <div role="alert" className="card space-y-3">
          <p className="text-rose-500">{failure.message}</p>
          {failure.existingId && (
            <div className="flex flex-wrap gap-2">
              <FinancialRecordLink
                id={failure.existingId}
                kind={
                  failure.code === "EXISTING_DEPOSIT"
                    ? "TRANSACTION"
                    : failure.code === "DUPLICATE_RECEIPT"
                      ? "EXPENSE"
                      : "INCOME"
                }
              >
                Review existing{" "}
                {failure.code === "EXISTING_DEPOSIT"
                  ? "deposit"
                  : failure.code === "DUPLICATE_RECEIPT"
                    ? "receipt"
                    : "income record"}
              </FinancialRecordLink>
              {failure.code === "EXISTING_DEPOSIT" && (
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      transactionAction: "LINK",
                      transactionId: String(failure.existingId),
                    })
                  }
                >
                  Link this deposit instead
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {loads.map(
        (result, index) =>
          result.error && (
            <FinanceLoadError key={index} error={result.error} retry={result.retry} />
          ),
      )}
      {existing?.linkWarning && (
        <p role="alert" className="card text-amber-500">
          {existing.linkWarning}
        </p>
      )}
      {confirmation && (
        <div role="alert" className="card space-y-3">
          <p>{"Delete the pay stub? Income details and the linked bank deposit will remain."}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className={`${primaryButton} bg-rose-600`}
            >
              Confirm deletion
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmation(null)}
              className={secondaryButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <form onSubmit={save}>
        <fieldset
          disabled={!readOnly && disabled}
          className="grid min-w-0 items-start gap-5 xl:grid-cols-2"
        >
          <section className="card min-w-0 space-y-4">
            <h3 className="text-lg font-semibold">Income information</h3>
            <fieldset disabled={readOnly} className="min-w-0 space-y-4">
              <label className="block space-y-1">
                Employer / income source
                <select
                  aria-label="Employer / income source"
                  required
                  value={draft.sourceId}
                  className={fieldClass}
                  onChange={(event) => patch("sourceId", event.target.value)}
                >
                  <option value="">Choose a source</option>
                  {sourceOptions.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} · {INCOME_KINDS[source.kind]}
                      {source.active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </label>
              {!sources.loading && !sourceOptions.length && (
                <Link href="/finance/settings/income-sources" className={secondaryButton}>
                  Add an income source
                </Link>
              )}
              <label className="block space-y-1">
                Description
                <input
                  aria-label="Income description"
                  required
                  maxLength={300}
                  value={draft.description}
                  className={fieldClass}
                  placeholder="Paycheque, gift, interest, reimbursement…"
                  onChange={(event) => patch("description", event.target.value)}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  Pay date
                  <input
                    aria-label="Pay date"
                    type="date"
                    required
                    value={draft.date}
                    className={fieldClass}
                    onChange={(event) => patch("date", event.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  Deposit account
                  <select
                    aria-label="Deposit account"
                    required
                    className={fieldClass}
                    value={draft.accountId}
                    onChange={(event) => {
                      setDraft((previous) => ({
                        ...previous,
                        accountId: event.target.value,
                        ...(!existing?.transaction
                          ? { transactionAction: "CREATE", transactionId: "" }
                          : {}),
                      }));
                    }}
                  >
                    <option value="">Choose a deposit account</option>
                    {accountOptions.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                        {account.active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  Pay period start (optional)
                  <input
                    aria-label="Pay period start"
                    type="date"
                    required={!!draft.periodEnd}
                    value={draft.periodStart}
                    className={fieldClass}
                    onChange={(event) => patch("periodStart", event.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  Pay period end (optional)
                  <input
                    aria-label="Pay period end"
                    type="date"
                    required={!!draft.periodStart}
                    min={draft.periodStart || undefined}
                    value={draft.periodEnd}
                    className={fieldClass}
                    onChange={(event) => patch("periodEnd", event.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  Gross income (optional)
                  <input
                    aria-label="Gross income"
                    inputMode="decimal"
                    maxLength={20}
                    autoComplete="off"
                    value={draft.grossAmount}
                    className={fieldClass}
                    onChange={(event) => {
                      if (/^\d*(?:\.\d{0,2})?$/.test(event.target.value))
                        patch("grossAmount", event.target.value);
                    }}
                    onBlur={() =>
                      patch("grossAmount", incomeInputAmount(draft.grossAmount.replace(/\.$/, "")))
                    }
                  />
                </label>
                <label className="block space-y-1">
                  Net income
                  <input
                    aria-label="Net income"
                    inputMode="decimal"
                    required
                    maxLength={20}
                    autoComplete="off"
                    value={draft.netAmount}
                    className={fieldClass}
                    onChange={(event) => {
                      if (/^\d*(?:\.\d{0,2})?$/.test(event.target.value))
                        patch("netAmount", event.target.value);
                    }}
                    onBlur={() =>
                      patch("netAmount", incomeInputAmount(draft.netAmount.replace(/\.$/, "")))
                    }
                  />
                </label>
              </div>
              <section className="space-y-3 border-t border-card-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Deductions</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={deductions.length >= 30 || !availableTypes.length}
                      onClick={() => addDeductions(false)}
                    >
                      Add deduction
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={deductions.length >= 30 || !availableTypes.length}
                      onClick={() => addDeductions(true)}
                    >
                      Add all deductions
                    </button>
                  </div>
                </div>
                {deductions.map((line, index) => (
                  <div
                    key={index}
                    className="grid min-w-0 gap-2 rounded-lg border border-card-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <label className="block space-y-1 text-sm">
                      Type
                      <select
                        aria-label={`Deduction ${index + 1} type`}
                        required
                        className={fieldClass}
                        value={line.typeId}
                        onChange={(event) => {
                          setDeductions(
                            deductions.map((item, i) =>
                              i === index ? { ...item, typeId: event.target.value } : item,
                            ),
                          );
                          setAcknowledge(false);
                        }}
                      >
                        <option value="">Choose a type</option>
                        {typeOptions
                          .filter(
                            (type) =>
                              String(type.id) === line.typeId ||
                              !deductions.some((item) => Number(item.typeId) === type.id),
                          )
                          .map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                              {type.active ? "" : " (inactive)"}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="block space-y-1 text-sm">
                      Amount
                      <input
                        aria-label={`Deduction ${index + 1} amount`}
                        inputMode="decimal"
                        maxLength={20}
                        autoComplete="off"
                        className={fieldClass}
                        value={line.amount}
                        onChange={(event) => {
                          if (!/^\d*(?:\.\d{0,2})?$/.test(event.target.value)) return;
                          setDeductions(
                            deductions.map((item, i) =>
                              i === index ? { ...item, amount: event.target.value } : item,
                            ),
                          );
                          setAcknowledge(false);
                        }}
                        onBlur={() =>
                          setDeductions((previous) =>
                            previous.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    amount: incomeInputAmount(item.amount.replace(/\.$/, "")),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className={`${secondaryButton} self-end`}
                      aria-label={`Remove deduction ${index + 1}`}
                      onClick={() => {
                        setDeductions(deductions.filter((_, i) => i !== index));
                        setAcknowledge(false);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {!deductions.length && (
                  <p className="text-sm text-gray-400">No deductions. Add lines when applicable.</p>
                )}
                {amounts && (
                  <p className="text-sm">
                    Total deductions:{" "}
                    {displayAmount(amounts.deductionsTotal, currency).replace(/^\+/, "")}
                  </p>
                )}
                {mismatch && (
                  <div
                    role="alert"
                    className="space-y-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500"
                  >
                    <p>
                      Gross minus deductions does not equal net. Difference:{" "}
                      {twoDecimalAmount(amounts!.difference!)} {currency}.
                    </p>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        required
                        checked={acknowledge}
                        onChange={(event) => setAcknowledge(event.target.checked)}
                      />
                      Keep these amounts despite the difference
                    </label>
                  </div>
                )}
              </section>
            </fieldset>
            {readOnly && notesTransaction ? (
              <ActivityNotes inline transaction={notesTransaction} onSaved={() => refresh?.()} />
            ) : (
              <label className="block space-y-1">
                Notes (optional)
                <textarea
                  aria-label="Income notes"
                  rows={3}
                  maxLength={2000}
                  className={fieldClass}
                  value={draft.notes}
                  onChange={(event) => patch("notes", event.target.value)}
                />
              </label>
            )}
            <fieldset disabled={readOnly} className="min-w-0 space-y-4">
              {!accounts.loading && !accountOptions.length && (
                <Link href="/finance/settings/accounts" className={secondaryButton}>
                  Add a deposit account
                </Link>
              )}

              <div className="flex flex-wrap gap-2 pt-3">
                <button type="submit" hidden={readOnly} className={primaryButton}>
                  {busy ? "Saving…" : "Save income record"}
                </button>
                <Link href="/finance/income" className={secondaryButton}>
                  Cancel
                </Link>
              </div>
            </fieldset>
          </section>
          <fieldset disabled={readOnly} className="min-w-0">
            <FinanceDocumentPanel
              document={existing?.document ?? null}
              baseUrl={existing ? `/api/finance/income/${existing.id}/document` : ""}
              title="Pay stub"
              file={file}
              onFile={(chosen) => {
                if (chosen && (!chosen.size || chosen.size > MAX_RECEIPT_BYTES)) {
                  showFailure(new FinanceRequestError("Choose an image or PDF up to 15 MB."));
                  return;
                }
                setFile(chosen);
                setFailure(null);
              }}
              onDelete={() => confirm("document")}
            />
          </fieldset>
        </fieldset>
      </form>
    </div>
  );
}
