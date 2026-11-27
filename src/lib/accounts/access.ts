import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "./security";
import type { Actor } from "./context.mjs";
import type { Capability } from "./capabilities";
export async function getActor(): Promise<Actor | null> {
  const session = await getServerSession(authOptions);
  if (!session?.authUserId || !session.sessionId) return null;
  const row = await prisma.authSession.findFirst({
    where: {
      id: session.sessionId,
      userId: session.authUserId,
      expires: { gt: new Date() },
      user: { active: true },
    },
    include: { user: { include: { permissions: true, initialization: true } } },
  });
  return row
    ? {
        id: row.userId,
        sessionId: row.id,
        role: row.user.role,
        name: row.user.name,
        timeZone: row.user.timeZone,
        permissions: row.user.permissions.map((p) => p.capability),
        initialized: !!row.user.initialization,
      }
    : null;
}
export function hasPermission(actor: Actor, capability: Capability) {
  return actor.role === "OWNER" || actor.permissions.includes(capability);
}
export async function requirePermission(capability: Capability, request?: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (!actor.initialized || !hasPermission(actor, capability))
    return Response.json({ error: "You do not have access to this feature." }, { status: 403 });
  if (request && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request))
    return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  return null;
}
