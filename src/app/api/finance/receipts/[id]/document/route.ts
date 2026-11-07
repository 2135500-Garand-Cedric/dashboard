import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { financeHeaders } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import { readReceiptFile } from "@/lib/finance/receipt-files";
import { getReceiptDocument, deleteReceipt, receiptError } from "@/lib/finance/receipt-server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    const document = await getReceiptDocument(financeId((await context.params).id));
    const buffer = await readReceiptFile(document.storageKey);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(buffer), { headers: {
      ...financeHeaders, "Content-Type": document.mimeType, "Content-Length": String(buffer.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="receipt-${document.receiptId}.${document.mimeType === "application/pdf" ? "pdf" : document.mimeType.split("/")[1]}"; filename*=UTF-8''${encodeURIComponent(document.originalName).replace(/'/g, "%27")}`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "no-referrer",
    } });
  } catch (error) { return receiptError(error, "load the receipt document"); }
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  try {
    await deleteReceipt(financeId((await context.params).id), true, request.headers.get("If-Match"));
    return NextResponse.json({ success: true }, { headers: financeHeaders });
  } catch (error) { return receiptError(error, "delete the receipt document"); }
}
