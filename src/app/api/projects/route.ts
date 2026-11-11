import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
import { listProjects, createProject } from "@/lib/work-management/project-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(async () => listProjects(new URL(request.url).searchParams), 200, "load");
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => createProject(await request.json(), workCommand(request, false)),
    201,
    "save",
  );
}
