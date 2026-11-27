import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { cookies } from "next/headers";
import { dashboardAdapter } from "./accounts/adapter";
import { authorizeIdentity, identityAudit } from "./accounts/identity";
import { inviteCookie, linkCookie } from "./accounts/security";
import { prisma } from "./prisma";
import { auditAuthentication } from "./audit/auth";

export const authOptions: NextAuthOptions = {
  adapter: dashboardAdapter,
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  session: { strategy: "database", maxAge: 30 * 86400, updateAge: 86400 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ account, profile, user }) {
      try {
        if (!account || !profile) return false;
        const jar = await cookies();
        const subject = String("sub" in profile ? profile.sub : "id" in profile ? profile.id : "");
        if (subject !== account.providerAccountId) return false;
        const allowed = await authorizeIdentity({
          provider: account.provider,
          subject,
          email: user.email ?? null,
          verified: "email_verified" in profile && profile.email_verified === true,
          name: user.name ?? null,
          invite: jar.get(inviteCookie)?.value,
          link: jar.get(linkCookie)?.value,
          currentSession:
            jar.get("__Secure-next-auth.session-token")?.value ??
            jar.get("next-auth.session-token")?.value,
        });
        if (!allowed) await auditAuthentication("denied");
        return allowed ? true : "/signin?error=AccessDenied";
      } catch {
        console.error("Authentication: account access unavailable.");
        return "/signin?error=AccessDenied";
      }
    },
    async session({ session, user }) {
      const info = user as typeof user & {
        role: string;
        sessionId: string;
        permissions: string[];
        initialized: boolean;
      };
      session.authUserId = Number(user.id);
      session.role = info.role;
      session.sessionId = info.sessionId;
      session.permissions = info.permissions;
      session.initialized = info.initialized;
      session.ownerAccess = info.role === "OWNER";
      if (session.user) session.user.id = user.id;
      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl);
        if (target.origin === baseUrl) return target.href;
      } catch {}
      return baseUrl;
    },
  },
  events: {
    async signOut(message) {
      if (
        "session" in message &&
        message.session &&
        typeof message.session === "object" &&
        "userId" in message.session
      ) {
        const id = Number(message.session.userId);
        if (Number.isInteger(id) && id > 0)
          try {
            await identityAudit(prisma, id, id, "auth.signed-out", "User signed out");
          } catch {
            console.error("Audit: authentication history unavailable.");
          }
      }
    },
    async signIn({ user }) {
      try {
        await identityAudit(
          prisma,
          Number(user.id),
          Number(user.id),
          "auth.signed-in",
          "User signed in",
        );
      } catch {
        console.error("Audit: authentication history unavailable.");
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
