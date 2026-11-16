import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as userId } from "@/lib/owner-policy";
import {
  DEFAULTS,
  endpointHash,
  pushConfiguration,
  settingsInput,
  subscriptionInput,
} from "./rules.mjs";
import { reminderState, sendPush } from "./engine.mjs";

export const notificationHeaders = { "Cache-Control": "private, no-store" };
export class NotificationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function notificationError(error: unknown) {
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { error: "Enter a valid request." },
      { status: 400, headers: notificationHeaders },
    );
  return NextResponse.json(
    {
      error:
        error instanceof NotificationError
          ? error.message
          : "Unable to update notifications. Try again.",
    },
    {
      status: error instanceof NotificationError ? error.status : 503,
      headers: notificationHeaders,
    },
  );
}
export function deviceId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
  )
    throw new NotificationError("Choose a valid device.");
  return value;
}
export async function notificationOverview() {
  const config = pushConfiguration();
  const [state, devices] = await Promise.all([
    reminderState(prisma, userId),
    prisma.pushSubscription.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!state) throw new NotificationError("Application owner not found.", 503);
  return {
    configured: !!config,
    publicKey: config?.publicKey ?? null,
    settings: Object.fromEntries(
      Object.keys(DEFAULTS).map((key) => [key, state.settings[key as keyof typeof DEFAULTS]]),
    ),
    worker: {
      lastSeenAt: state.settings.workerSeenAt?.toISOString() ?? null,
      errorCode: state.settings.workerError ?? null,
    },
    devices: devices.map((device) => ({
      id: device.id,
      label: device.label,
      endpointHash: endpointHash(device.endpoint),
      lastSuccessAt: device.lastSuccessAt?.toISOString() ?? null,
      createdAt: device.createdAt.toISOString(),
      keyChanged: config ? device.vapidPublicKey !== config.publicKey : false,
    })),
  };
}
export async function saveNotificationSettings(value: unknown) {
  let data;
  try {
    data = settingsInput(value);
  } catch (error) {
    throw new NotificationError(error instanceof Error ? error.message : "Invalid settings.");
  }
  const previous = await prisma.notificationSettings.findUnique({ where: { userId } });
  await prisma.notificationSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: {
      ...data,
      ...(data.enabled === true && previous?.enabled === false ? { enabledAt: new Date() } : {}),
    },
  });
  return notificationOverview();
}
export async function registerDevice(value: unknown) {
  const config = pushConfiguration();
  if (!config)
    throw new NotificationError("Push notifications are not configured on the server yet.", 503);
  let input;
  try {
    input = subscriptionInput(value);
  } catch (error) {
    throw new NotificationError(error instanceof Error ? error.message : "Invalid subscription.");
  }
  return prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(94721, ${userId}::integer)`;
    const existing = await db.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
    if (existing && existing.userId !== userId)
      throw new NotificationError("This registration belongs to a different account.", 403);
    if (
      !existing?.active &&
      (await db.pushSubscription.count({ where: { userId, active: true } })) >= 10
    )
      throw new NotificationError("Remove an unused device before adding another (maximum 10).");
    await db.notificationSettings.upsert({ where: { userId }, create: { userId }, update: {} });
    const device = await db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { ...input, userId, vapidPublicKey: config.publicKey },
      update: {
        ...input,
        active: true,
        vapidPublicKey: config.publicKey,
        ...(!existing?.active || existing.vapidPublicKey !== config.publicKey
          ? { createdAt: new Date() }
          : {}),
      },
    });
    return { id: device.id };
  });
}
export async function unregisterDevice(id: string) {
  const result = await prisma.pushSubscription.updateMany({
    where: { id, userId },
    data: { active: false },
  });
  if (!result.count) throw new NotificationError("Device not found.", 404);
  await prisma.pushDelivery.updateMany({
    where: { subscriptionId: id, status: "PENDING" },
    data: { status: "SKIPPED", errorCode: "DISABLED", leaseUntil: null },
  });
}
export async function sendTestNotification(id: string) {
  const config = pushConfiguration();
  if (!config)
    throw new NotificationError("Push notifications are not configured on the server yet.", 503);
  const now = new Date();
  const claimed = await prisma.pushSubscription.updateMany({
    where: {
      id,
      userId,
      active: true,
      vapidPublicKey: config.publicKey,
      OR: [{ lastTestAt: null }, { lastTestAt: { lt: new Date(now.getTime() - 60000) } }],
    },
    data: { lastTestAt: now },
  });
  if (!claimed.count)
    throw new NotificationError(
      "Enable this device first, or wait one minute before sending another test.",
      429,
    );
  const device = await prisma.pushSubscription.findFirst({ where: { id, userId, active: true } });
  if (!device) throw new NotificationError("Device not found.", 404);
  try {
    await sendPush({
      subscription: device,
      payload: {
        title: "Dashboard notifications",
        body: "This device can receive your calendar reminders.",
        url: "/settings",
        tag: "dashboard-test",
      },
      config,
      ttl: 60,
    });
    await prisma.pushSubscription.update({ where: { id }, data: { lastSuccessAt: now } });
  } catch (error) {
    const status =
      error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
    if ([404, 410].includes(status))
      await prisma.pushSubscription.update({ where: { id }, data: { active: false } });
    throw new NotificationError(
      [404, 410].includes(status)
        ? "This device registration expired. Enable notifications again."
        : "The push service could not accept the test. Check the server push configuration and try again.",
      503,
    );
  }
}
