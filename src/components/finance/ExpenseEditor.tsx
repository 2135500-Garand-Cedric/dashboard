"use client";
import Link from "next/link";
import FinancialRecordLink from "./FinancialRecordLink";
import type { ReactNode } from "react";
import ActivityNotes from "./ActivityNotes";
import type { StatementPrefill } from "@/lib/finance/statement-prefill";
import FinanceDocumentPanel from "./FinanceDocumentPanel";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useSnackbar } from "@/context/SnackbarContext";
import { receiptDifference, receiptTotal, type FinanceReceipt } from "@/lib/finance/receipts";
import {
  currencyOptionLabel,
  type FinanceAccount,
  type FinanceCategory,
} from "@/lib/finance/validation";
import { twoDecimalAmount, type FinanceTransaction } from "@/lib/finance/transactions";
import {
  fieldClass,
  financeRequest,
  FinanceLoadError,
  FinanceRequestError,
  primaryButton,
  secondaryButton,
  useFinanceData,
} from "./shared";
export default function ExpenseEditor({
  id,
  initialDate,
  currencies,
  onSaved,
  readOnly,
  headerMeta,
  headerActions,
  notesTransaction,
  initialTransaction,
  prefill,
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
    <ExistingReceipt
      id={id}
      currencies={currencies}
      onSaved={onSaved}
      readOnly={readOnly}
      headerMeta={headerMeta}
      headerActions={headerActions}
      notesTransaction={notesTransaction}
    />
  ) : (
    <ReceiptForm
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
function ExistingReceipt({
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
    receipt: FinanceReceipt;
  }>(`/api/finance/expenses/${id}`);
  if (result.error) return <FinanceLoadError error={result.error} retry={result.retry} />;
  if (result.loading || !result.data) return <p role="status">Loading receipt…</p>;
  return (
    <ReceiptForm
      key={result.data.receipt.updatedAt}
      readOnly={readOnly}
      headerMeta={headerMeta}
      headerActions={headerActions}
      notesTransaction={notesTransaction}
      existing={result.data.receipt}
      initialDate={result.data.receipt.date}
      currencies={currencies}
      refresh={() => {
        result.retry();
        onSaved?.();
      }}
    />
  );
}
function ReceiptForm({
  existing,
  initialDate,
  currencies,
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
  existing?: FinanceReceipt;
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
  const categories = useFinanceData<{
    categories: FinanceCategory[];
  }>("/api/finance/categories");
  const [draft, setDraft] = useState(() => ({
    merchant:
      existing?.merchant ??
      initialTransaction?.counterparty ??
      initialTransaction?.description ??
      prefill?.description ??
      "",
    date: initialTransaction?.date ?? prefill?.date ?? initialDate,
    accountId: String(
      existing?.account?.id ?? initialTransaction?.account.id ?? prefill?.accountId ?? "",
    ),
    categoryId: String(existing?.category?.id ?? initialTransaction?.category?.id ?? ""),
    currency: existing?.currency ?? initialTransaction?.currency ?? prefill?.currency ?? "CAD",
    subtotal:
      (existing?.subtotal ?? initialTransaction?.amount.replace(/^-/, "") ?? prefill?.amount)
        ? twoDecimalAmount(
            (existing?.subtotal ??
              initialTransaction?.amount.replace(/^-/, "") ??
              prefill?.amount)!,
          )
        : "",
    tax: twoDecimalAmount(existing?.tax ?? "0"),
    tip: twoDecimalAmount(existing?.tip ?? "0"),
    total:
      (existing?.total ?? initialTransaction?.amount.replace(/^-/, "") ?? prefill?.amount)
        ? twoDecimalAmount(
            (existing?.total ?? initialTransaction?.amount.replace(/^-/, "") ?? prefill?.amount)!,
          )
        : "",
    notes: existing?.notes ?? initialTransaction?.notes ?? "",
    transactionAction: existing?.transaction || initialTransaction ? "LINK" : "CREATE",
    transactionId: String(existing?.transaction?.id ?? initialTransaction?.id ?? ""),
  }));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FinanceRequestError | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [confirmation, setConfirmation] = useState<"document" | null>(null);
  const requestKey = useRef<string | null>(null),
    saving = useRef(false);
  const router = useRouter(),
    { showMessage } = useSnackbar();
  const patch = (key: keyof typeof draft, value: string) => {
    setDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (["subtotal", "tax", "tip"].includes(key)) {
        try {
          next.total = twoDecimalAmount(receiptTotal(next.subtotal, next.tax, next.tip));
        } catch {
          // Leave the last valid total while an amount is incomplete.
        }
      }
      return next;
    });
    setAcknowledge(false);
    setAllowDuplicate(false);
  };
  let difference: string | null = null;
  try {
    difference = receiptDifference(draft.subtotal, draft.tax || "0", draft.tip || "0", draft.total);
  } catch {
    /* Show the warning only once all amounts are valid. */
  }
  const mismatch = difference !== null && difference !== "0.0000";
  const accountOptions =
    accounts.data?.accounts.filter(
      (account) => account.active || account.id === existing?.account?.id,
    ) ?? [];
  const categoryOptions =
    categories.data?.categories.filter(
      (category) =>
        category.type === "EXPENSE" && (category.active || category.id === existing?.category?.id),
    ) ?? [];
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setFailure(null);
    try {
      requestKey.current ??= crypto.randomUUID();
      const details = {
        ...draft,
        accountId: Number(draft.accountId),
        categoryId: Number(draft.categoryId),
        tax: draft.tax || "0",
        tip: draft.tip || "0",
        transactionId: draft.transactionAction === "LINK" ? Number(draft.transactionId) : null,
        acknowledgeMismatch: acknowledge,
        syncMovement: true,
        allowDuplicate,
        ...(existing
          ? { expectedUpdatedAt: existing.updatedAt }
          : { requestKey: requestKey.current }),
      };
      // Preserve legacy precision when a displayed amount was left unchanged.
      for (const key of ["subtotal", "tax", "tip", "total"] as const) {
        if (existing && draft[key] === twoDecimalAmount(existing[key]))
          details[key] = existing[key];
      }
      const body = new FormData();
      body.append("details", JSON.stringify(details));
      if (file) body.append("file", file);
      const result = await financeRequest<{
        receipt: FinanceReceipt;
      }>(existing ? `/api/finance/expenses/${existing.id}` : "/api/finance/expenses", {
        method: existing ? "PATCH" : "POST",
        body,
      });
      showMessage("Expense saved successfully.");
      refresh?.();
      if (result.receipt.transaction)
        router.push(`/finance/expenses/${result.receipt.transaction.id}`);
      else if (existing) refresh?.();
      else throw new Error("The saved expense has no associated money movement.");
    } catch (error) {
      const failure =
        error instanceof FinanceRequestError
          ? error
          : new FinanceRequestError(
              error instanceof Error ? error.message : "Could not save the receipt.",
            );
      setFailure(failure);
      showMessage(failure.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing || !confirmation || saving.current) return;
    saving.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await financeRequest(`/api/finance/expenses/${existing.id}/document`, {
        method: "DELETE",
        headers: { "If-Match": existing.updatedAt },
      });
      showMessage("Document deleted. Receipt details were kept.");
      refresh?.();
    } catch (error) {
      setFailure(
        new FinanceRequestError(
          error instanceof Error ? error.message : "Could not delete the receipt.",
        ),
      );
    } finally {
      saving.current = false;
      setBusy(false);
      setConfirmation(null);
    }
  }
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold">
            {existing || initialTransaction ? "Expense details" : "New expense"}
          </h2>
          {headerMeta}
        </div>
        <div className="flex flex-wrap gap-2">
          {headerActions}
          <Link href="/finance/expenses" className={secondaryButton}>
            ← Expenses
          </Link>
        </div>
      </div>
      {failure && (
        <div className="card space-y-3" role="alert">
          <p className="text-rose-500">{failure.message}</p>
          {["EXISTING_EXPENSE", "DUPLICATE_TRANSACTION"].includes(failure.code ?? "") && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setAllowDuplicate(true);
                setFailure(null);
                showMessage("Separate purchase confirmed. Save the expense to continue.");
              }}
            >
              Record a separate purchase
            </button>
          )}
          {failure.existingId && (
            <div className="flex flex-wrap gap-2">
              <FinancialRecordLink
                id={failure.existingId}
                kind={
                  failure.code?.startsWith("DUPLICATE_RECEIPT") ||
                  failure.code === "RECEIPT_REQUEST_USED"
                    ? "EXPENSE"
                    : "TRANSACTION"
                }
              >
                Review existing{" "}
                {failure.code === "DUPLICATE_RECEIPT" || failure.code === "RECEIPT_REQUEST_USED"
                  ? "receipt"
                  : "expense"}
              </FinancialRecordLink>
              {failure.code === "EXISTING_EXPENSE" && (
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
                  Link this expense instead
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}
      {categories.error && <FinanceLoadError error={categories.error} retry={categories.retry} />}
      {existing?.linkWarning && (
        <p role="alert" className="card text-amber-500">
          {existing.linkWarning}
        </p>
      )}
      {confirmation && (
        <div className="card space-y-3" role="alert">
          <p>
            {
              "Delete the uploaded document? Your receipt details and linked transaction will remain."
            }
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              type="button"
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
      {(accounts.loading || categories.loading) && (
        <p role="status">Loading accounts and categories…</p>
      )}
      <form aria-busy={busy} onSubmit={save}>
        <fieldset
          disabled={
            !readOnly &&
            (busy ||
              accounts.loading ||
              categories.loading ||
              !!accounts.error ||
              !!categories.error)
          }
          className="grid min-w-0 items-start gap-5 xl:grid-cols-2"
        >
          <section className="card min-w-0 space-y-4">
            <h3 className="text-lg font-semibold">Receipt information</h3>
            <fieldset disabled={readOnly} className="min-w-0 space-y-4">
              <label className="block space-y-1">
                Description / merchant
                <input
                  aria-label="Description / merchant"
                  required
                  maxLength={200}
                  className={fieldClass}
                  value={draft.merchant}
                  onChange={(event) => patch("merchant", event.target.value)}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  Purchase date
                  <input
                    aria-label="Purchase date"
                    type="date"
                    required
                    className={fieldClass}
                    value={draft.date}
                    onChange={(event) => patch("date", event.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  Payment account
                  <select
                    aria-label="Payment account"
                    required
                    className={fieldClass}
                    value={draft.accountId}
                    onChange={(event) => patch("accountId", event.target.value)}
                  >
                    <option value="">Choose an account</option>
                    {accountOptions.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                        {account.active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  Currency
                  <select
                    aria-label="Receipt currency"
                    className={fieldClass}
                    value={draft.currency}
                    onChange={(event) => patch("currency", event.target.value)}
                  >
                    {currencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currencyOptionLabel(currency)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  Expense category
                  <select
                    aria-label="Expense category"
                    required
                    className={fieldClass}
                    value={draft.categoryId}
                    onChange={(event) => patch("categoryId", event.target.value)}
                  >
                    <option value="">Choose a category</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {category.active ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!accounts.loading && !accountOptions.length && (
                <Link href="/finance/settings/accounts" className={secondaryButton}>
                  Create a payment account
                </Link>
              )}
              {!categories.loading && !categoryOptions.length && (
                <Link href="/finance/settings/categories" className={secondaryButton}>
                  Create an expense category
                </Link>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["subtotal", "Subtotal"],
                    ["tax", "Tax (optional)"],
                    ["tip", "Tip (optional)"],
                    ["total", "Total"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block space-y-1">
                    {label}
                    <input
                      aria-label={label}
                      inputMode="decimal"
                      autoComplete="off"
                      required={key === "subtotal" || key === "total"}
                      maxLength={20}
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                      className={fieldClass}
                      value={draft[key]}
                      onChange={(event) => {
                        const value = event.target.value.startsWith(".")
                          ? `0${event.target.value}`
                          : event.target.value;
                        if (/^\d*(?:\.\d{0,2})?$/.test(value)) patch(key, value);
                      }}
                      onBlur={() => {
                        const value = draft[key].replace(/\.$/, "");
                        if (value && twoDecimalAmount(value) !== draft[key])
                          patch(key, twoDecimalAmount(value));
                      }}
                    />
                  </label>
                ))}
              </div>
              {mismatch && (
                <div
                  role="alert"
                  className="space-y-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-500"
                >
                  <p>
                    Subtotal + tax + tip does not equal total. Difference:{" "}
                    {twoDecimalAmount(difference!)} {draft.currency}.
                  </p>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={acknowledge}
                      onChange={(event) => setAcknowledge(event.target.checked)}
                      required
                    />
                    Keep these amounts despite the difference
                  </label>
                </div>
              )}
            </fieldset>
            {readOnly && notesTransaction ? (
              <ActivityNotes inline transaction={notesTransaction} onSaved={() => refresh?.()} />
            ) : (
              <label className="block space-y-1">
                Notes (optional)
                <textarea
                  aria-label="Expense notes"
                  maxLength={2000}
                  rows={3}
                  className={fieldClass}
                  value={draft.notes}
                  onChange={(event) => patch("notes", event.target.value)}
                />
              </label>
            )}
            <fieldset disabled={readOnly} className="min-w-0 space-y-4">
              <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:flex-wrap">
                <button className={primaryButton} type="submit" hidden={readOnly}>
                  {busy ? "Saving…" : "Save expense"}
                </button>
                <Link href="/finance/expenses" className={secondaryButton}>
                  Cancel
                </Link>
              </div>
            </fieldset>
          </section>
          <fieldset disabled={readOnly} className="min-w-0">
            <FinanceDocumentPanel
              document={existing?.document ?? null}
              baseUrl={`/api/finance/expenses/${existing?.id}/document`}
              title="Receipt"
              file={file}
              onFile={setFile}
              onDelete={() => {
                setConfirmation("document");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </fieldset>
        </fieldset>
      </form>
    </div>
  );
}
