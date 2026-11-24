import path from "node:path";
import {
  boundedBody,
  documentForm,
  documentHash,
  privateDocumentStore,
  PrivateFileError,
  type PreparedDocument,
} from "@/lib/documents/private-files";
import { WorkValidationError } from "./validation";
export type { PreparedDocument };
export { documentHash };
export function workFileStore() {
  return privateDocumentStore(
    process.env.WORK_UPLOAD_DIR || path.join(process.cwd(), "private/work"),
    [
      path.join(process.cwd(), "public"),
      process.env.FINANCE_UPLOAD_DIR || path.join(process.cwd(), "private/finance"),
    ],
  );
}
export async function fileOperation<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof PrivateFileError)
      throw new WorkValidationError(error.message, error.status);
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["ENOSPC", "EACCES", "EPERM", "EROFS", "ENOTDIR"].includes(String(error.code))
    )
      throw new WorkValidationError(
        "Private upload storage is unavailable or full. Check storage permissions and free space, then retry.",
        503,
      );
    throw error;
  }
}
export async function workUpload(request: Request) {
  return fileOperation(() => documentForm(request));
}
export async function workNoteJson(request: Request, limit = 256 * 1024) {
  return fileOperation(
    async () => JSON.parse((await boundedBody(request, limit)).toString("utf8")) as unknown,
  );
}
