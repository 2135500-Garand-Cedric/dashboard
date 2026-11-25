import { FinanceValidationError } from "./validation";
import { decimalAmount } from "./transactions";

export type ReimbursementSummary = {
  person: string;
  expected: string;
  received: string;
  remaining: string;
  personalCost: string;
  status: "AWAITING" | "PARTIAL" | "COMPLETE";
};
export type ReimbursementLink = {
  id: number;
  expenseId: number;
  planId: number;
  person: string;
  paymentId: number;
  amount: string;
  updatedAt: string;
  description: string;
  date: string;
};
export type ReimbursementDetails = {
  transactionId: number;
  type: "EXPENSE" | "REFUND";
  currency: string;
  amount: string;
  available: string;
  summary: ReimbursementSummary | null;
  planUpdatedAt: string | null;
  plans: {
    id: number;
    contactId: number;
    person: string;
    expected: string;
    received: string;
    remaining: string;
    updatedAt: string;
    status: ReimbursementSummary["status"];
  }[];
  links: ReimbursementLink[];
  candidates: {
    id: number;
    planId: number;
    description: string;
    date: string;
    person: string;
    remaining: string;
    account: string;
  }[];
};

export function reimbursementStatus(expected: string, received: string) {
  // Inputs have already been normalized to four decimal places.
  const units = (value: string) => BigInt(value.replace(".", ""));
  if (units(received) === BigInt(0)) return "AWAITING" as const;
  return units(received) >= units(expected) ? ("COMPLETE" as const) : ("PARTIAL" as const);
}

export function reimbursementInput(value: unknown, kind: "plan" | "allocation") {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FinanceValidationError("Provide valid reimbursement details.");
  const body = value as Record<string, unknown>;
  const allowed =
    kind === "plan"
      ? ["contactId", "amount", "expectedUpdatedAt", "remove", "planId"]
      : ["expenseId", "amount", "expectedUpdatedAt", "planId"];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new FinanceValidationError("Unknown reimbursement field.");
  if (
    body.expectedUpdatedAt !== null &&
    (typeof body.expectedUpdatedAt !== "string" ||
      !Number.isFinite(Date.parse(body.expectedUpdatedAt)))
  )
    throw new FinanceValidationError("Reload the reimbursement before saving.");
  if (kind === "plan" && body.remove !== undefined && typeof body.remove !== "boolean")
    throw new FinanceValidationError("Invalid reimbursement tracking choice.");
  const remove = kind === "plan" && body.remove === true;
  if (
    kind === "plan" &&
    !remove &&
    (typeof body.contactId !== "number" ||
      !Number.isSafeInteger(body.contactId) ||
      body.contactId < 1 ||
      body.contactId > 2147483647)
  )
    throw new FinanceValidationError("Choose who will reimburse you from People.");
  if (
    kind === "allocation" &&
    (typeof body.expenseId !== "number" ||
      !Number.isSafeInteger(body.expenseId) ||
      body.expenseId < 1 ||
      body.expenseId > 2147483647)
  )
    throw new FinanceValidationError("Choose an expense to reimburse.");
  if (
    body.planId != null &&
    (typeof body.planId !== "number" ||
      !Number.isSafeInteger(body.planId) ||
      body.planId < 1 ||
      body.planId > 2147483647)
  )
    throw new FinanceValidationError("Choose a valid reimbursement person.");
  return {
    planId: (body.planId ?? null) as number | null,
    contactId: body.contactId as number,
    amount: remove ? null : decimalAmount(body.amount),
    expenseId: body.expenseId as number,
    expectedUpdatedAt: body.expectedUpdatedAt as string | null,
    remove,
  };
}
