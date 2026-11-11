import { APP_TIME_ZONE } from "@/lib/app-time-zone";
import { requireOwner } from "@/lib/require-owner";
import { workCommand, workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
import { listEvents, createEvent } from "@/lib/work-management/server";

export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;
  const response = await workResponse(() => listEvents());
  response.headers.set("X-App-Time-Zone", APP_TIME_ZONE);
  return response;
}
export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;
  return workResponse(
    async () => createEvent(await request.json(), workCommand(request, false)),
    201,
  );
}
