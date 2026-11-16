import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import {
  registerDevice,
  unregisterDevice,
  deviceId,
  notificationError,
  notificationHeaders,
} from "@/lib/notifications/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await registerDevice(await request.json()), {
      headers: notificationHeaders,
    });
  } catch (error) {
    return notificationError(error);
  }
}
export async function DELETE(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    await unregisterDevice(deviceId((await request.json()).id));
    return NextResponse.json({ success: true }, { headers: notificationHeaders });
  } catch (error) {
    return notificationError(error);
  }
}
