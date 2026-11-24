import { authorizedEmailWorker } from "@/lib/email/worker.mjs";
import { emailResponseError, processEmailQueue } from "@/lib/email/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!authorizedEmailWorker(request))
    return Response.json(
      { error: "Unauthorized worker." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    return await processEmailQueue();
  } catch (error) {
    return emailResponseError(error);
  }
}
