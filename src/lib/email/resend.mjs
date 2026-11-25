export class EmailError extends Error {
  constructor(code, retryable = false, retryAfter = 0) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

const mailbox = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function validEmailRecipient(value) {
  return typeof value === "string" && value.length <= 254 && mailbox.test(value);
}
/** @param {NodeJS.ProcessEnv} env
 * @param {{enabled: boolean, recipient: string} | null} preferences */
export function emailConfiguration(env = process.env, preferences = null) {
  if (env.EMAIL_ENABLED !== "true" || !preferences?.enabled) return null;
  const from = env.EMAIL_FROM?.trim() || "";
  const address = from.match(/<([^<>]+)>$/)?.[1] || from;
  const to = preferences.recipient;
  if (
    !mailbox.test(address) ||
    !validEmailRecipient(to) ||
    /[\r\n]/.test(from) ||
    from.length > 250 ||
    !/^re_[\w-]{8,}$/.test(env.RESEND_API_KEY || "")
  )
    throw new EmailError("EMAIL_CONFIGURATION");
  return { apiKey: env.RESEND_API_KEY, from, to };
}

// Shared transport: callers supply a prepared message, not a weekly-report object.
// The server owns recipient selection; no public arbitrary-email relay is exposed.
export async function sendEmail(message, { config, key, fetcher = fetch }) {
  if (!config || !/^[\w:/.-]{1,200}$/.test(key)) throw new EmailError("EMAIL_CONFIGURATION");
  if (
    !message ||
    !mailbox.test(message.to) ||
    !message.subject ||
    !message.text ||
    JSON.stringify(message).length > 8 * 1024 * 1024
  )
    throw new EmailError("EMAIL_MESSAGE_INVALID");
  let response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new EmailError("EMAIL_NETWORK", true);
  }
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const conflict = response.status === 409 ? await response.json().catch(() => null) : null;
    const concurrent = conflict?.name === "concurrent_idempotent_requests";
    throw new EmailError(
      `RESEND_HTTP_${response.status}`,
      concurrent || response.status === 429 || response.status >= 500,
      Number.isFinite(retryAfter) ? Math.min(900, Math.max(0, retryAfter)) : 0,
    );
  }
  const data = await response.json().catch(() => null);
  if (typeof data?.id !== "string" || !data.id || data.id.length > 100)
    throw new EmailError("EMAIL_RESPONSE_UNKNOWN", true);
  return { id: data.id };
}
