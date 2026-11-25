import { EmailError, emailConfiguration, validEmailRecipient } from "./resend.mjs";

export class EmailSettingsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function readEmailPreferences(db, userId) {
  const saved = await db.emailSettings.findUnique({ where: { userId } });
  return {
    enabled: saved?.enabled ?? false,
    recipient: saved?.recipient ?? "",
    revision: saved?.revision ?? 0,
  };
}

export function emailPreferencesInput(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["enabled", "recipient", "revision"].includes(key)) ||
    typeof value.enabled !== "boolean" ||
    typeof value.recipient !== "string" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw new EmailSettingsError("Enter valid email settings.");
  const recipient = value.recipient.trim();
  if ((recipient || value.enabled) && !validEmailRecipient(recipient))
    throw new EmailSettingsError("Enter one valid recipient email address.");
  return { enabled: value.enabled, recipient, revision: value.revision };
}

export async function saveEmailPreferences(db, userId, value) {
  const input = emailPreferencesInput(value);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(94726, ${userId}::integer)`;
      const previous = await readEmailPreferences(tx, userId);
      if (previous.revision !== input.revision)
        throw new EmailSettingsError(
          "Email settings changed on another page. Reload and try again.",
          409,
        );
      if (previous.enabled === input.enabled && previous.recipient === input.recipient)
        return previous;
      if (!input.enabled || previous.recipient !== input.recipient) {
        const code = input.enabled ? "EMAIL_RECIPIENT_CHANGED" : "EMAIL_DISABLED";
        for (const attempted of [false, true]) {
          await tx.emailDelivery.updateMany({
            where: { userId, status: "PENDING", firstAttemptAt: attempted ? { not: null } : null },
            data: {
              status: attempted ? "UNKNOWN" : "FAILED",
              errorCode: code,
              leaseUntil: null,
              claimToken: null,
            },
          });
        }
      }
      const saved = await tx.emailSettings.upsert({
        where: { userId },
        create: { userId, enabled: input.enabled, recipient: input.recipient || null },
        update: {
          enabled: input.enabled,
          recipient: input.recipient || null,
          revision: { increment: 1 },
        },
      });
      return { enabled: saved.enabled, recipient: saved.recipient || "", revision: saved.revision };
    },
    { timeout: 30000, maxWait: 30000 },
  );
}

// Serialize the final permission check, network call and acceptance record with
// settings changes. Once disabling is confirmed, no new request can be sent.
// An already accepted email cannot be recalled. A short bounded transaction here
// is deliberate; transport timeout is 15 seconds and the lock is per owner.
export async function withEmailPermission(db, userId, message, action, env = process.env) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(94726, ${userId}::integer)`;
      const preferences = await readEmailPreferences(tx, userId);
      const config = emailConfiguration(env, preferences);
      if (!config) throw new EmailError("EMAIL_DISABLED");
      if (message.to !== config.to) throw new EmailError("EMAIL_RECIPIENT_CHANGED");
      return action(tx, config);
    },
    { timeout: 30000, maxWait: 30000 },
  );
}
