import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeId } from "@/lib/finance/validation";
import { financeHeaders } from "@/lib/finance/server";
import { transactionError } from "@/lib/finance/transaction-server";
import { deleteActivity, saveActivityNotes } from "@/lib/finance/activity-server";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    await deleteActivity(financeId((await context.params).id), request.headers.get("If-Match"));
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) {
    return transactionError(error, "delete financial activity");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return NextResponse.json(
        { error: "Notes request is too large." },
        { status: 413, headers: financeHeaders },
      );
    return NextResponse.json(
      await saveActivityNotes(
        financeId((await context.params).id),
        JSON.parse(raw),
        request.headers.get("If-Match"),
      ),
      { headers: financeHeaders },
    );
  } catch (error) {
    return transactionError(error, "save financial activity notes");
  }
}
