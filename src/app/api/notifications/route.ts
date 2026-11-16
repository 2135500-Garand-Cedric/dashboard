import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import {
  notificationOverview,
  saveNotificationSettings,
  notificationError,
  notificationHeaders,
} from "@/lib/notifications/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await notificationOverview(), { headers: notificationHeaders });
  } catch (error) {
    return notificationError(error);
  }
}
export async function PATCH(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await saveNotificationSettings(await request.json()), {
      headers: notificationHeaders,
    });
  } catch (error) {
    return notificationError(error);
  }
}
