import { requireOwner } from "@/lib/require-owner";
import { workCommand, workId, workResponse } from "@/lib/work-management/validation";
import { projectStageCommand } from "@/lib/work-management/project-server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => {
      const id = workId((await context.params).id);
      return projectStageCommand(id, await request.json(), workCommand(request));
    },
    200,
    "save",
  );
}
