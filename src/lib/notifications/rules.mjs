import { createECDH, createHash } from "node:crypto";
import { DateTime } from "luxon";

export const DEFAULTS = {
  enabled: true,
  events: true,
  sessions: true,
  deadlines: true,
  followUps: true,
  milestones: false,
  showDetails: true,
  leadMinutes: 15,
  dateOnlyTime: "09:00",
};
export const LEAD_MINUTES = [0, 5, 15, 30, 60, 1440, 10080];
export const GRACE_MS = 15 * 60000;

export function pushConfiguration(env = process.env) {
  if (env.PUSH_ENABLED !== "true") return null;
  try {
    const publicKey = env.PUSH_VAPID_PUBLIC_KEY || "";
    const privateKey = env.PUSH_VAPID_PRIVATE_KEY || "";
    const subject = env.PUSH_VAPID_SUBJECT || "";
    const origin = new URL(env.NEXTAUTH_URL || "");
    if (
      origin.protocol !== "https:" &&
      !(
        env.NODE_ENV !== "production" &&
        origin.hostname === "localhost" &&
        origin.protocol === "http:"
      )
    )
      return null;
    if (!/^mailto:[^@\s]+@[^@\s]+$/.test(subject)) return null;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (ecdh.getPublicKey().toString("base64url") !== publicKey) return null;
    return { publicKey, privateKey, subject, origin: origin.origin };
  } catch {
    return null;
  }
}

export function subscriptionInput(value) {
  if (!value || typeof value !== "object") throw new Error("Invalid device registration.");
  const url = new URL(value.endpoint);
  const allowed = ["push.apple.com", "push.services.mozilla.com", "notify.windows.com"];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    value.endpoint.length > 4096 ||
    !(
      ["fcm.googleapis.com", "android.googleapis.com"].includes(url.hostname) ||
      allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    )
  ) {
    throw new Error("This browser's push service is not supported.");
  }
  const p256dh = value.keys?.p256dh,
    auth = value.keys?.auth;
  if (
    typeof p256dh !== "string" ||
    !/^[\w-]+$/.test(p256dh) ||
    Buffer.from(p256dh, "base64url").length !== 65 ||
    Buffer.from(p256dh, "base64url")[0] !== 4 ||
    typeof auth !== "string" ||
    !/^[\w-]+$/.test(auth) ||
    Buffer.from(auth, "base64url").length !== 16
  )
    throw new Error("Invalid browser subscription keys.");
  if (typeof value.label !== "string" || !value.label.trim() || value.label.length > 80)
    throw new Error("Enter a device name (80 characters maximum).");
  return { endpoint: url.href, p256dh, auth, label: value.label.trim() };
}

/** @returns {Partial<typeof DEFAULTS>} */
export function settingsInput(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !Object.hasOwn(DEFAULTS, key))
  )
    throw new Error("Invalid notification settings.");
  const result = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (value[key] === undefined) continue;
    if (key === "leadMinutes") {
      if (!LEAD_MINUTES.includes(value[key])) throw new Error("Choose a valid reminder time.");
    } else if (key === "dateOnlyTime") {
      if (typeof value[key] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value[key]))
        throw new Error("Choose a valid time for all-day reminders.");
    } else if (typeof value[key] !== "boolean")
      throw new Error("Choose valid notification options.");
    result[key] = value[key];
  }
  return result;
}

export function endpointHash(endpoint) {
  return createHash("sha256").update(endpoint).digest("hex");
}

// Date-only items use the user's timezone, including future DST offsets.
// A clock gap moves forward; a repeated local time uses its first occurrence.
export function dateOnlyInstant(day, time, zone) {
  const local = DateTime.fromISO(`${day}T${time}`, { zone });
  if (!local.isValid) return null;
  return new Date(Math.min(...local.getPossibleOffsets().map((date) => date.toMillis())));
}

export function reminderCandidate(source, settings, zone) {
  const target = source.at
    ? new Date(source.at)
    : source.date
      ? dateOnlyInstant(source.date, settings.dateOnlyTime, zone)
      : null;
  if (!target || !Number.isFinite(target.getTime()) || source.minutes === -1) return null;
  const minutes = source.minutes ?? (source.at ? settings.leadMinutes : 0);
  const key = createHash("sha256")
    .update(
      `${source.kind}:${source.id}:${source.at ? target.toISOString() : `date:${source.date}`}`,
    )
    .digest("hex");
  return {
    ...source,
    targetAt: target,
    sendAt: new Date(target.getTime() - minutes * 60000),
    occurrenceKey: key,
  };
}

export function reminderPayload(candidate, settings, zone) {
  const when = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    ...(candidate.at ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(candidate.targetAt);
  return {
    title: settings.showDetails ? candidate.title.slice(0, 150) : "Dashboard reminder",
    body: settings.showDetails
      ? `${candidate.label} · ${when}`
      : "Open Dashboard to view your reminder.",
    url: candidate.url,
    tag: `dashboard-${candidate.occurrenceKey}`,
  };
}
