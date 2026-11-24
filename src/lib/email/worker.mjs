import { timingSafeEqual } from "node:crypto";

export function authorizedEmailWorker(request, env = process.env) {
  const secret = env.EMAIL_WORKER_SECRET || "";
  const provided = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  return (
    /^[\w-]{32,200}$/.test(secret) &&
    Buffer.byteLength(provided) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  );
}

// The existing worker only wakes the shared queue endpoint. Report generation
// stays inside Next.js, where the canonical TypeScript readers already run.
export async function runEmailWorkerPass({ env = process.env, fetcher = fetch } = {}) {
  if (env.EMAIL_ENABLED !== "true") return { sent: 0 };
  if ((env.EMAIL_WORKER_SECRET || "").length < 32) return { sent: 0, error: "EMAIL_CONFIGURATION" };
  try {
    const base = new URL(env.EMAIL_APP_URL || env.NEXTAUTH_URL || "");
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password)
      return { sent: 0, error: "EMAIL_CONFIGURATION" };
    const response = await fetcher(new URL("/api/email/process", base), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EMAIL_WORKER_SECRET}` },
      signal: AbortSignal.timeout(110000),
      redirect: "error",
    });
    if (!response.ok) return { sent: 0, error: "EMAIL_WORKER_UNAVAILABLE" };
    const result = await response.json();
    return {
      sent: Number(result.sent) || 0,
      ...(result.failed ? { error: "EMAIL_DELIVERY_FAILED" } : {}),
    };
  } catch {
    return { sent: 0, error: "EMAIL_WORKER_UNAVAILABLE" };
  }
}
