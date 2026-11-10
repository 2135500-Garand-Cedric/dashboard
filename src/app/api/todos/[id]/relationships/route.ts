import { requireOwner } from "@/lib/require-owner";
import { readRelationships, relationshipCommand } from "@/lib/work-management/relationships";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () =>
      readRelationships(workId((await context.params).id), new URL(request.url).searchParams),
    200,
    "load",
  );
}
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () =>
    relationshipCommand(
      workId((await context.params).id),
      await request.json(),
      workCommand(request),
    ),
  );
}
export async function DELETE(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () =>
    relationshipCommand(
      workId((await context.params).id),
      await request.json(),
      workCommand(request),
      true,
    ),
  );
}
