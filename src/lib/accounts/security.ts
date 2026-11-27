import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const inviteCookie =
  process.env.NODE_ENV === "production" ? "__Host-dashboard-invite" : "dashboard-invite";
export const linkCookie =
  process.env.NODE_ENV === "production" ? "__Host-dashboard-link" : "dashboard-link";
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 1800,
};
export async function requestBudget(db: Prisma.TransactionClient, area: string, max = 200) {
  const slot = Math.floor(Date.now() / 600000);
  const row = await db.authRequestBudget.upsert({
    where: { key: `${area}:${slot}` },
    create: { key: `${area}:${slot}`, expires: new Date((slot + 2) * 600000) },
    update: { count: { increment: 1 } },
  });
  if (row.count > max) throw new Error("Too many attempts. Try again later.");
  await db.authRequestBudget.deleteMany({ where: { expires: { lt: new Date() } } });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (
    (!origin || origin === new URL(process.env.NEXTAUTH_URL || request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
export async function smallJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Send a JSON request.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new Error("Request is too large.");
    }
    chunks.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
