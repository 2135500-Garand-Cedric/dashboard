"use client";

import Link from "next/link";
import PersonSelect from "@/components/settings/PersonSelect";
import ReimbursementProgress from "./ReimbursementProgress";
import TaskModal from "@/components/shared/TaskModal";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LinkIcon, PencilSquareIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { ReimbursementDetails, ReimbursementLink } from "@/lib/finance/reimbursements";
import { displayAmount, twoDecimalAmount } from "@/lib/finance/transactions";
import { useSnackbar } from "@/context/SnackbarContext";
import {
  fieldClass,
  secondaryButton,
  primaryButton,
  financeRequest,
  useFinanceData,
} from "./shared";

const statusLabels = {
  AWAITING: "Awaiting reimbursement",
  PARTIAL: "Partially reimbursed",
  COMPLETE: "Fully reimbursed",
};
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function ReimbursementBadge({ status }: { status: keyof typeof statusLabels }) {
  const tone =
    status === "COMPLETE"
      ? "border-emerald-500/40 text-emerald-400"
      : status === "PARTIAL"
        ? "border-sky-500/40 text-sky-400"
        : "border-amber-500/40 text-amber-400";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tone}`}>
      {statusLabels[status]}
    </span>
  );
}

export default function Reimbursements({ id, onSaved }: { id: number; onSaved?: () => void }) {
  const result = useFinanceData<ReimbursementDetails>(
    `/api/finance/activities/${id}/reimbursements`,
  );
  const { showMessage } = useSnackbar();
  const shownError = useRef("");
  useEffect(() => {
    if (result.error && shownError.current !== result.error) showMessage(result.error);
    shownError.current = result.error;
  }, [result.error, showMessage]);
  if (result.error) return null;
  if (!result.data || result.loading)
    return (
      <section className="card" role="status">
        Loading reimbursements…
      </section>
    );
  return (
    <ReimbursementContent
      key={`${id}:${result.data.plans.map((plan) => plan.updatedAt).join()}:${result.data.links.map((link) => link.updatedAt).join()}`}
      data={result.data}
      onSaved={() => {
        result.retry();
        onSaved?.();
      }}
    />
  );
}

function ReimbursementContent({
  data,
  onSaved,
}: {
  data: ReimbursementDetails;
  onSaved: () => void;
}) {
  const expense = data.type === "EXPENSE";
  const endpoint = `/api/finance/activities/${data.transactionId}/reimbursements`;
  const [editPlan, setEditPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ReimbursementDetails["plans"][number] | null>(
    null,
  );
  const [contactId, setContactId] = useState("");
  const [expected, setExpected] = useState(data.summary ? "" : twoDecimalAmount(data.amount));
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<ReimbursementLink | null>(null);
  const [confirm, setConfirm] = useState<ReimbursementLink | "plan" | null>(null);
  const [busy, setBusy] = useState(false);
  const { showMessage } = useSnackbar();
  const money = (value: string) => displayAmount(value, data.currency).replace(/^\+/, "");
  async function save(method: string, body?: unknown, link?: ReimbursementLink) {
    if (busy) return;
    setBusy(true);
    try {
      await financeRequest(`${endpoint}${link ? `?link=${link.id}` : ""}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(link ? { "If-Match": link.updatedAt } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      showMessage("Reimbursement saved.");
      onSaved();
    } catch (failure) {
      setConfirm(null);
      const message = failure instanceof Error ? failure.message : "Unable to save reimbursement.";
      showMessage(message);
    } finally {
      setBusy(false);
    }
  }
  function submitPlan(event: FormEvent) {
    event.preventDefault();
    void save("PUT", {
      contactId: Number(contactId),
      amount: expected,
      planId: editingPlan?.id ?? null,
      expectedUpdatedAt: editingPlan?.updatedAt ?? null,
    });
  }
  function submitAllocation(event: FormEvent) {
    event.preventDefault();
    void save("POST", {
      expenseId:
        editing?.expenseId ?? data.candidates.find((item) => item.planId === Number(planId))?.id,
      planId: Number(planId),
      amount,
      expectedUpdatedAt: editing?.updatedAt ?? null,
    });
  }
  return (
    <section className="card min-w-0 space-y-5" aria-label="Reimbursements">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <LinkIcon className="h-5 w-5 text-sky-400" />
          {expense ? "Reimbursement" : "Reimburse expenses"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {data.summary && <ReimbursementBadge status={data.summary.status} />}
          {expense && (
            <button
              type="button"
              className={`${secondaryButton} gap-2`}
              disabled={busy}
              onClick={() => {
                setEditingPlan(null);
                setContactId("");
                setExpected(data.summary ? "" : twoDecimalAmount(data.amount));
                setEditPlan(true);
              }}
            >
              {data.summary ? (
                <PencilSquareIcon className="h-4 w-4" />
              ) : (
                <PlusIcon className="h-4 w-4" />
              )}
              {data.summary ? "Add person" : "Track reimbursement"}
            </button>
          )}
        </div>
      </header>
      {data.summary && (
        <>
          <p className="text-sm">
            Expected from <strong>{data.summary.person}</strong>
          </p>
          <ReimbursementProgress summary={data.summary} currency={data.currency} />
        </>
      )}
      {expense && data.plans.length > 0 && (
        <ul className="divide-y divide-card-border">
          {data.plans.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="space-y-2">
                <p className="font-semibold">{plan.person}</p>
                <ReimbursementBadge status={plan.status} />
                <p className="text-sm text-muted">
                  Expected {money(plan.expected)} · Received {money(plan.received)} · Still owed{" "}
                  {money(plan.remaining)}
                </p>
              </div>
              <button
                className={`${secondaryButton} gap-2`}
                disabled={busy}
                onClick={() => {
                  setEditingPlan(plan);
                  setContactId(String(plan.contactId));
                  setExpected(twoDecimalAmount(plan.expected));
                  setEditPlan(true);
                }}
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit person
              </button>
            </li>
          ))}
        </ul>
      )}
      <TaskModal
        open={expense && editPlan}
        title={editingPlan ? "Edit reimbursement person" : "Add reimbursement person"}
        busy={busy}
        onClose={() => setEditPlan(false)}
      >
        {expense && editPlan && (
          <form
            onSubmit={submitPlan}
            className="space-y-3 rounded-lg border border-card-border p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <PersonSelect
                value={contactId}
                currentName={editingPlan?.person}
                onChange={setContactId}
                disabled={busy}
              />
              <label className="space-y-1 text-sm">
                Expected amount
                <input
                  aria-label="Expected reimbursement"
                  className={fieldClass}
                  inputMode="decimal"
                  value={expected}
                  required
                  disabled={busy}
                  onChange={(event) => setExpected(event.target.value)}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className={primaryButton}>
                Save tracking
              </button>
              <button
                type="button"
                disabled={busy}
                className={secondaryButton}
                onClick={() => setEditPlan(false)}
              >
                Cancel
              </button>
              {editingPlan && (
                <button
                  type="button"
                  disabled={busy || data.links.some((link) => link.planId === editingPlan?.id)}
                  className={`${secondaryButton} border-rose-500/40`}
                  onClick={() => setConfirm("plan")}
                >
                  Remove tracking
                </button>
              )}
            </div>
          </form>
        )}
      </TaskModal>
      {!expense && (
        <>
          <div className="flex flex-wrap gap-6">
            <p>
              Payment <strong>{money(data.amount)}</strong>
            </p>
            <p>
              Not allocated <strong className="text-sky-400">{money(data.available)}</strong>
            </p>
          </div>
          {data.candidates.length > 0 || editing ? (
            <form className="space-y-3" onSubmit={submitAllocation}>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <label className="min-w-0 space-y-1 text-sm">
                  Expense
                  <select
                    aria-label="Expense to reimburse"
                    className={fieldClass}
                    value={planId}
                    disabled={busy || !!editing}
                    required
                    onChange={(event) => {
                      setPlanId(event.target.value);
                      setAmount("");
                    }}
                  >
                    <option value="">Select an expense</option>
                    {editing && <option value={editing.planId}>{editing.description}</option>}
                    {data.candidates.map((item) => (
                      <option key={item.planId} value={item.planId}>
                        {item.date} · {item.description} · {item.person} · {money(item.remaining)}{" "}
                        owed · {item.account}
                        {item.category ? ` · ${item.category}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  Amount
                  <input
                    aria-label="Reimbursement allocation amount"
                    className={fieldClass}
                    value={amount}
                    inputMode="decimal"
                    required
                    disabled={busy}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button className={primaryButton} disabled={busy}>
                  {editing ? "Save allocation" : "Allocate reimbursement"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      setEditing(null);
                      setPlanId("");
                      setAmount("");
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted">
              No outstanding expenses found. Mark an expense as expecting reimbursement first, or
              then return here.
            </p>
          )}
        </>
      )}
      {data.links.length > 0 && (
        <ul className="divide-y divide-card-border">
          {data.links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link
                  className="break-words text-blue-400 hover:underline"
                  href={`/finance/expenses/${expense ? link.paymentId : link.expenseId}`}
                >
                  {link.description}
                </Link>
                <p className="text-xs text-muted">
                  {dateFormat.format(new Date(`${link.date}T00:00:00Z`))} · {link.person} ·{" "}
                  {money(link.amount)}
                  {link.category ? ` · ${link.category}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {!expense && (
                  <button
                    type="button"
                    className={`${secondaryButton} gap-1.5`}
                    disabled={busy}
                    onClick={() => {
                      setEditing(link);
                      setPlanId(String(link.planId));
                      setAmount(twoDecimalAmount(link.amount));
                    }}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className={`${secondaryButton} gap-1.5 border-rose-500/40`}
                  disabled={busy}
                  onClick={() => setConfirm(link)}
                >
                  <XMarkIcon className="h-4 w-4" />
                  Unlink
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <TaskModal
        open={!!confirm}
        title={confirm === "plan" ? "Remove reimbursement tracking" : "Unlink reimbursement"}
        busy={busy}
        onClose={() => setConfirm(null)}
      >
        <div className="space-y-3">
          <p>
            {confirm === "plan"
              ? "Remove reimbursement tracking from this expense?"
              : "Unlink this reimbursement? The expense and bank payment will remain."}
          </p>
          <div className="flex gap-2">
            <button
              className={primaryButton}
              disabled={busy}
              onClick={() =>
                confirm === "plan"
                  ? save("PUT", {
                      remove: true,
                      planId: editingPlan?.id,
                      expectedUpdatedAt: editingPlan?.updatedAt ?? null,
                    })
                  : confirm && save("DELETE", undefined, confirm)
              }
            >
              Confirm
            </button>
            <button className={secondaryButton} disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      </TaskModal>
    </section>
  );
}
