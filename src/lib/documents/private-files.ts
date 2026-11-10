import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdir, open, realpath, lstat, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export class PrivateFileError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface PreparedDocument {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  extension: string;
  contentHash: string;
}
export const documentHash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
export function validStorageKey(key: string) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp|gif|pdf)$/.test(
    key,
  );
}
export async function prepareDocument(file: File): Promise<PreparedDocument> {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES)
    throw new PrivateFileError("Choose a nonempty image or PDF up to 15 MB.", 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size || buffer.length > MAX_DOCUMENT_BYTES)
    throw new PrivateFileError("The uploaded file is incomplete or too large.", 413);
  let extension: string, mimeType: string;
  if (/^%PDF-(1\.[0-7]|2\.0)/.test(buffer.subarray(0, 9).toString("ascii"))) {
    const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(buffer.subarray(-2048).toString("latin1"));
    const offset = end ? Number(end[1]) : -1,
      xref =
        offset >= 9 && offset < buffer.length
          ? buffer.subarray(offset, offset + 2048).toString("latin1")
          : "";
    if (
      !end ||
      !(
        xref.startsWith("xref") ||
        (/^\d+\s+\d+\s+obj\b/.test(xref) && /\/Type\s*\/XRef\b/.test(xref))
      )
    )
      throw new PrivateFileError(
        "This PDF is incomplete or invalid. Export it again as a PDF before uploading.",
      );
    extension = "pdf";
    mimeType = "application/pdf";
  } else {
    try {
      const image = sharp(buffer, { limitInputPixels: 40000000, failOn: "warning" });
      const metadata = await image.metadata();
      const formats: Record<string, [string, string]> = {
        jpeg: ["jpg", "image/jpeg"],
        png: ["png", "image/png"],
        webp: ["webp", "image/webp"],
        gif: ["gif", "image/gif"],
      };
      if (
        !metadata.format ||
        !formats[metadata.format] ||
        (metadata.pages ?? 1) !== 1 ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 40000000
      )
        throw new Error("Unsupported image");
      [extension, mimeType] = formats[metadata.format];
      await image.resize(1, 1).png().toBuffer();
    } catch {
      throw new PrivateFileError(
        "Choose a valid JPEG, PNG, WebP, single-frame GIF or PDF. Images must be at most 40 megapixels. Export HEIC photos as JPEG first.",
      );
    }
  }
  const declared = file.type.toLowerCase();
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== mimeType &&
    !(declared === "image/jpg" && mimeType === "image/jpeg")
  )
    throw new PrivateFileError("The file contents do not match the selected file type.");
  const originalName =
    file.name
      .replace(/^.*[\\/]/, "")
      .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
      .slice(0, 200)
      .trim() || `document.${extension}`;
  return { buffer, originalName, extension, mimeType, contentHash: documentHash(buffer) };
}
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new PrivateFileError("This request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PrivateFileError("The request body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PrivateFileError("This request is too large.", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function documentForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new PrivateFileError("Choose a file using the upload form.");
  let form: FormData;
  try {
    form = await new Response(await boundedBody(request, MAX_DOCUMENT_BYTES + 65536), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch (error) {
    if (error instanceof PrivateFileError) throw error;
    throw new PrivateFileError("The upload form is invalid. Choose your file again.");
  }
  const file = form.get("file");
  if (
    [...form.keys()].some((key) => key !== "file") ||
    form.getAll("file").length !== 1 ||
    !file ||
    typeof file === "string"
  )
    throw new PrivateFileError("Choose exactly one image or PDF.");
  return prepareDocument(file);
}
async function canonicalLocation(value: string): Promise<string> {
  try {
    return await realpath(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = path.dirname(value);
    return parent === value
      ? value
      : path.join(await canonicalLocation(parent), path.basename(value));
  }
}
const overlaps = (a: string, b: string) =>
  a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
export function privateDocumentStore(directory: string, forbidden: string[]) {
  const root = path.resolve(directory);
  async function safeRoot(create = false) {
    const resolved = await canonicalLocation(root);
    for (const value of forbidden)
      if (
        overlaps(root, path.resolve(value)) ||
        overlaps(resolved, await canonicalLocation(path.resolve(value)))
      )
        throw new PrivateFileError(
          "Work document storage is not configured privately. Review WORK_UPLOAD_DIR.",
          503,
        );
    if (create) await mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new PrivateFileError("Work document storage is unavailable.", 503);
    if (create) await chmod(root, 0o700);
  }
  function target(key: string) {
    if (!validStorageKey(key)) throw new PrivateFileError("Invalid stored document.", 404);
    return path.join(root, key);
  }
  return {
    async write(file: PreparedDocument) {
      await safeRoot(true);
      const key = `${randomUUID()}.${file.extension}`,
        destination = target(key);
      let handle;
      try {
        handle = await open(
          destination,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        await handle.writeFile(file.buffer);
        await handle.sync();
      } catch (error) {
        if (handle) await unlink(destination).catch(() => {});
        throw error;
      } finally {
        await handle?.close();
      }
      return key;
    },
    async read(key: string) {
      try {
        const destination = target(key);
        await safeRoot();
        const handle = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size < 1 || stat.size > MAX_DOCUMENT_BYTES)
            throw new Error("Invalid stored document");
          return await handle.readFile();
        } finally {
          await handle.close();
        }
      } catch (error) {
        if (error instanceof PrivateFileError && error.status === 503) throw error;
        throw new PrivateFileError(
          "The original file is unavailable. Restore it from backup or replace the attachment.",
          404,
        );
      }
    },
    async remove(key: string) {
      const destination = target(key);
      await safeRoot();
      try {
        await unlink(destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    path: target,
  };
}
