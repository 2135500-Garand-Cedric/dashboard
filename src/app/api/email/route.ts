import { requireOwner } from "@/lib/require-owner";
import { emailDeliveryStatus, emailResponseError, queueRequestedEmail } from "@/lib/email/server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return await emailDeliveryStatus();
  } catch (error) {
    return emailResponseError(error);
  }
}
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return await queueRequestedEmail(await request.json());
  } catch (error) {
    return emailResponseError(error);
  }
}
