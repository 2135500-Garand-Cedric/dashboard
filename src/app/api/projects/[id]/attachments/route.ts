import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { listAttachments, uploadAttachment } from "@/lib/work-management/supporting";
import { getProject } from "@/lib/work-management/project-server";
import { workUpload } from "@/lib/work-management/files";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () =>
      listAttachments(
        { projectId: workId((await context.params).id) },
        new URL(request.url).searchParams,
      ),
    200,
    "load",
  );
}
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => {
    const id = { projectId: workId((await context.params).id) },
      command = workCommand(request, false);
    await getProject(id.projectId);
    return uploadAttachment(id, await workUpload(request), command);
  }, 201);
}
