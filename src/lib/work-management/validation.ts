import { NextResponse } from "next/server";

export class WorkValidationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function workId(value: unknown): number {
  if (typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new WorkValidationError("Choose a valid record.");
  return value;
}
export function workBody(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new WorkValidationError("The request contains invalid fields.");
  return value as Record<string, unknown>;
}
export function workText(value: unknown, label: string, max: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > max || (!nullable && !value.trim())) throw new WorkValidationError(`Enter a valid ${label} (${max} characters maximum).`);
  return nullable ? value : value.trim();
}
export function workInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647) throw new WorkValidationError(`Enter a nonnegative whole number for ${label}.`);
  return value;
}
export type WorkCommand = { requestKey: string; revision?: number };
export function workCommand(request: Request, existing = true): WorkCommand {
  const requestKey = request.headers.get("Idempotency-Key") || "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestKey)) throw new WorkValidationError("A valid request identifier is required. Reload the page and try again.", 428);
  if (!existing) return { requestKey };
  const header = request.headers.get("If-Match") || "";
  const match = /^(?:"([1-9]\d*)"|([1-9]\d*))$/.exec(header);
  if (!match) throw new WorkValidationError("Reload this record before saving; its version is required.", 428);
  return { requestKey, revision: workId(match[1] || match[2]) };
}
export async function workResponse(action: () => Promise<unknown>, status = 200, operation: "save" | "load" = "save") {
  try { return NextResponse.json(await action(), { status, headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof WorkValidationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Enter a valid request." }, { status: 400 });
    // Never log request bodies, Prisma errors/parameters, notes or contact data.
    console.error("Work management: operation failed.");
    return NextResponse.json({ error: operation === "load" ? "Unable to load this data. Reload the page and try again." : "Unable to save this change. Reload the record and try again." }, { status: 500 });
  }
}
