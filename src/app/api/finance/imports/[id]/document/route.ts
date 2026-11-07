import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import { transactionError } from "@/lib/finance/transaction-server";
import { readReceiptFile } from "@/lib/finance/receipt-files";
import { getStatementDocument, deleteStatement } from "@/lib/finance/statement-server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const document = await getStatementDocument(financeId((await context.params).id)), buffer = await readReceiptFile(document.storageKey);
    return new NextResponse(new Uint8Array(buffer), { headers: { ...financeHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(buffer.length), "Content-Disposition": `attachment; filename="statement-${document.importId}.csv"; filename*=UTF-8''${encodeURIComponent(document.originalName).replace(/'/g, "%27")}`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return transactionError(error, "download the original CSV"); }
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    await deleteStatement(financeId((await context.params).id), Number(request.headers.get("If-Match")), true);
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) { return transactionError(error, "delete the original CSV"); }
}
