import { NextResponse } from "next/server";
import { FinanceValidationError } from "./validation";

// The existing single-owner app stores its owner's data under database user 1.
// requireOwner must run in every handler before this identifier is used.
export const FINANCE_USER_ID = 1;
export const financeHeaders = { "Cache-Control": "private, no-store" };

export function financeError(error: unknown, operation: string) {
  if (error instanceof FinanceValidationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: financeHeaders });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400, headers: financeHeaders });
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const known = {
    P2002: { status: 409, message: "An entry with this name already exists. Choose a different name or edit the existing entry." },
    P2025: { status: 404, message: "This record was not found." },
    P2003: { status: 409, message: "This record is linked to financial history. Deactivate it instead of deleting it." },
    P2034: { status: 409, message: "This record changed during your request. Refresh and try again." },
  };
  if (typeof code === "string" && Object.hasOwn(known, code)) {
    const result = known[code as keyof typeof known];
    return NextResponse.json({ error: result.message }, { status: result.status, headers: financeHeaders });
  }
  // Do not log Prisma errors or request bodies: they can contain financial data.
  console.error(`Finance: unable to ${operation}.`);
  return NextResponse.json({ error: `Unable to ${operation}. Please try again.` }, { status: 500, headers: financeHeaders });
}

export const accountSelect = { id: true, name: true, type: true, currency: true, maskedIdentifier: true, active: true } as const;
export const categorySelect = { id: true, name: true, type: true, active: true } as const;
