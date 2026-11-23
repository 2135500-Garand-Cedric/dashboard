import { requireOwner } from "@/lib/require-owner";
import { listBirthdays, saveBirthday } from "@/lib/birthday-server";
import { workResponse } from "@/lib/work-management/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(() => listBirthdays(), 200, "load");
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return workResponse(async () => saveBirthday(await request.json()), 201);
}
