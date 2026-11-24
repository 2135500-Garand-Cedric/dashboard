import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { imageParent, listInlineImages, uploadInlineImage } from "@/lib/knowledge/images";
import { workUpload } from "@/lib/work-management/files";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(
    () => listInlineImages(imageParent(new URL(request.url).searchParams)),
    200,
    "load",
  );
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => {
    const parent = imageParent(new URL(request.url).searchParams);
    const command = workCommand(
      request,
      typeof parent !== "number" && "knowledgeArticleId" in parent,
    );
    return uploadInlineImage(parent, await workUpload(request), command);
  }, 201);
}
