import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { hashToken } from "./security";
const userId = (value: string) => {
  if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647)
    throw new Error("Invalid account identifier.");
  return Number(value);
};
const toUser = (row: {
  id: number;
  email: string | null;
  name: string | null;
  emailVerified: Date | null;
}) => ({ ...row, id: String(row.id), email: row.email ?? "" }) as AdapterUser;
export const dashboardAdapter: Adapter = {
  // Provisioning and invite consumption are atomic in the sign-in callback.
  async createUser() {
    throw new Error("Invite registration must complete before a session is issued.");
  },
  async getUser(id) {
    const row = await prisma.user.findFirst({ where: { id: userId(id), active: true } });
    return row ? toUser(row) : null;
  },
  async getUserByEmail(email) {
    const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toUser(row) : null;
  },
  async getUserByAccount(key) {
    const row = await prisma.authAccount.findUnique({
      where: { provider_providerAccountId: key },
      include: { user: true },
    });
    return row ? toUser(row.user) : null;
  },
  async updateUser(input) {
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId(input.id) } });
    return toUser(row);
  },
  async linkAccount() {
    throw new Error("Use the authenticated sign-in linking flow.");
  },
  async createSession(input) {
    await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(94740, 1)`;
      if (!(await db.user.count({ where: { id: userId(input.userId), active: true } })))
        throw new Error("Account unavailable.");
      await db.authSession.create({
        data: {
          userId: userId(input.userId),
          tokenHash: hashToken(input.sessionToken),
          expires: input.expires,
        },
      });
    });
    return input;
  },
  async getSessionAndUser(token) {
    const row = await prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { permissions: true, initialization: true } } },
    });
    if (!row || !row.user.active || row.expires < new Date()) return null;
    return {
      session: { sessionToken: token, userId: String(row.userId), expires: row.expires },
      user: {
        ...toUser(row.user),
        role: row.user.role,
        sessionId: row.id,
        initialized: !!row.user.initialization,
        permissions: row.user.permissions.map((p) => p.capability),
      },
    };
  },
  async updateSession(input) {
    const row = await prisma.authSession.update({
      where: { tokenHash: hashToken(input.sessionToken) },
      data: { expires: input.expires },
    });
    return { sessionToken: input.sessionToken, userId: String(row.userId), expires: row.expires };
  },
  async deleteSession(token) {
    return prisma.$transaction(async (db) => {
      const row = await db.authSession.findUnique({ where: { tokenHash: hashToken(token) } });
      if (row) {
        await db.pushSubscription.updateMany({
          where: { userId: row.userId, sessionId: row.id },
          data: { active: false },
        });
        await db.pushDelivery.updateMany({
          where: { subscription: { userId: row.userId, sessionId: row.id }, status: "PENDING" },
          data: { status: "SKIPPED", errorCode: "DISABLED", leaseUntil: null },
        });
        await db.authSession.delete({ where: { id: row.id } });
        return { sessionToken: token, userId: String(row.userId), expires: row.expires };
      }
    });
  },
};
