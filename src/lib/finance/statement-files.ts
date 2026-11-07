import { createHash } from "node:crypto";
import { FinanceValidationError } from "./validation";
import { MAX_CSV_BYTES, parseStatement } from "./statement-csv";
import { importUploadInput } from "./statement-imports";
import { readFinanceFormData, type PreparedReceiptFile } from "./receipt-files";

export async function statementUpload(request: Request) {
  const form = await readFinanceFormData(request, MAX_CSV_BYTES, "Statement");
  const input = importUploadInput(form.details), file = form.file;
  if (!file || !file.size || file.size > MAX_CSV_BYTES) throw new FinanceValidationError("Choose a CSV file up to 2 MB.", 413);
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new FinanceValidationError("Upload a CSV, TSV or text CSV file. PDF and spreadsheet workbooks are not supported.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseStatement(buffer, input.parsing);
  const prepared: PreparedReceiptFile = { buffer, mimeType: "text/csv", extension: "csv", contentHash: createHash("sha256").update(buffer).digest("hex"), originalName: file.name.replace(/^.*[\\/]/, "").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200) || "statement.csv" };
  return { input, parsed, file: prepared };
}
export async function statementJson(request: Request) {
  const limit = 8 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new FinanceValidationError("Statement review request is too large.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new FinanceValidationError("Statement details are missing.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > limit) { await reader.cancel(); throw new FinanceValidationError("Statement review request is too large.", 413); } chunks.push(chunk.value); }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
