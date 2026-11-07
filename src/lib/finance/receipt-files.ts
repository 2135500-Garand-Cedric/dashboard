import { createHash, randomUUID } from "node:crypto";
import { mkdir, chmod, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { FinanceValidationError } from "./validation";
import { MAX_RECEIPT_BYTES } from "./receipts";

export interface PreparedReceiptFile { buffer: Buffer; originalName: string; mimeType: string; extension: string; contentHash: string; }
export function receiptStoragePath(key: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif|pdf|csv)$/.test(key)) throw new FinanceValidationError("Invalid stored document.", 404);
  const root = path.resolve(process.env.FINANCE_UPLOAD_DIR || path.join(process.cwd(), "private/finance"));
  const publicRoot = path.resolve(process.cwd(), "public");
  if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Receipt storage must be private.");
  return path.join(root, key);
}
export async function prepareReceiptFile(file: File): Promise<PreparedReceiptFile> {
  if (!file.size || file.size > MAX_RECEIPT_BYTES) throw new FinanceValidationError("Choose an image or PDF up to 15 MB.", 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  let extension: string, mimeType: string;
  if (buffer.subarray(0, 5).toString() === "%PDF-" && buffer.subarray(-2048).includes(Buffer.from("%%EOF"))) {
    extension = "pdf"; mimeType = "application/pdf";
  } else {
    try {
      const processor = sharp(buffer, { limitInputPixels: 40000000, failOn: "warning" });
      const metadata = await processor.metadata();
      const formats: Record<string, [string, string]> = { jpeg: ["jpg", "image/jpeg"], png: ["png", "image/png"], webp: ["webp", "image/webp"], gif: ["gif", "image/gif"] };
      if (!metadata.format || !formats[metadata.format] || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
      [extension, mimeType] = formats[metadata.format];
      await processor.resize(1, 1).png().toBuffer();
    } catch { throw new FinanceValidationError("Upload a valid JPEG, PNG, WebP, single-frame GIF, or PDF. Export HEIC photos as JPEG first."); }
  }
  const declared = file.type.toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== mimeType && !(declared === "image/jpg" && mimeType === "image/jpeg")) throw new FinanceValidationError("The file contents do not match its declared type.");
  return { buffer, extension, mimeType, originalName: file.name.replace(/^.*[\\/]/, "").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200) || `receipt.${extension}`, contentHash: createHash("sha256").update(buffer).digest("hex") };
}
export async function storeReceiptFile(file: PreparedReceiptFile) {
  const key = `${randomUUID()}.${file.extension}`;
  const target = receiptStoragePath(key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(target), 0o700);
  try { await writeFile(target, file.buffer, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) await removeReceiptFile(key);
    throw error;
  }
  return key;
}
export async function removeReceiptFile(key: string) {
  try { await unlink(receiptStoragePath(key)); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) console.error("Finance: unable to remove a private financial file."); }
}
export async function readReceiptFile(key: string) {
  try { return await readFile(receiptStoragePath(key)); }
  catch { throw new FinanceValidationError("The document is unavailable. Replace the document or restore it from backup.", 404); }
}

// Bound the actual stream, not just an untrusted Content-Length header, before parsing multipart.
// Shared bounded multipart reader for receipts, income documents and statement CSVs.
export async function readFinanceFormData(request: Request, maxBytes: number, label: string) {
  const limit = maxBytes + 65536;
  if (Number(request.headers.get("content-length")) > limit) throw new FinanceValidationError(`The upload is too large. Maximum file size is ${Math.floor(maxBytes / 1024 / 1024)} MB.`, 413);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new FinanceValidationError(`Use a multipart ${label.toLowerCase()} form.`);
  const reader = request.body?.getReader();
  if (!reader) throw new FinanceValidationError(`${label} form is missing.`);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new FinanceValidationError(`The upload is too large. Maximum file size is ${Math.floor(maxBytes / 1024 / 1024)} MB.`, 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new FinanceValidationError(`Invalid ${label.toLowerCase()} upload form.`); }
  if ([...form.keys()].some(key => !["details", "file"].includes(key)) || form.getAll("details").length !== 1 || form.getAll("file").length > 1) throw new FinanceValidationError(`Unexpected ${label.toLowerCase()} form fields.`);
  const details = form.get("details");
  if (typeof details !== "string" || details.length > 16000) throw new FinanceValidationError(`${label} details are missing or too large.`);
  const file = form.get("file");
  if (file !== null && typeof file === "string") throw new FinanceValidationError("Choose a valid uploaded file.");
  return { details: JSON.parse(details), file };
}

export async function receiptFormData(request: Request, label = "Receipt") {
  const form = await readFinanceFormData(request, MAX_RECEIPT_BYTES, label);
  return { details: form.details, file: form.file ? await prepareReceiptFile(form.file) : null };
}
