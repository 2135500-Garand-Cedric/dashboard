import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { listAttachments, uploadAttachment } from "@/lib/work-management/supporting";
import { getTodo } from "@/lib/work-management/server";
import { workUpload } from "@/lib/work-management/files";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () =>
      listAttachments(workId((await context.params).id), new URL(request.url).searchParams),
    200,
    "load",
  );
}
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => {
    const id = workId((await context.params).id),
      command = workCommand(request, false);
    await getTodo(id);
    return uploadAttachment(id, await workUpload(request), command);
  }, 201);
}
