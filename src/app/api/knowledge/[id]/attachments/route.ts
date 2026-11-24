import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
import { listAttachments, uploadAttachment } from "@/lib/work-management/supporting";
import { workUpload } from "@/lib/work-management/files";
import { articleRow } from "@/lib/knowledge/core";
import { prisma } from "@/lib/prisma";
export async function GET(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    async () =>
      listAttachments(
        { knowledgeArticleId: workId((await context.params).id) },
        new URL(request.url).searchParams,
      ),
    200,
    "load",
  );
}
export async function POST(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => {
    const id = workId((await context.params).id),
      command = workCommand(request, false);
    await articleRow(prisma, id);
    return uploadAttachment({ knowledgeArticleId: id }, await workUpload(request), command);
  }, 201);
}
