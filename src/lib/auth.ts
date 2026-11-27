import { auditAuthentication } from "./audit/auth";
import { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { isOwnerGithubId, OWNER_AUTH_VERSION } from "./owner-policy";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      issuer: "https://github.com/login/oauth",
    }),
  ],
  session: { strategy: "jwt" },
  pages: { error: "/access-denied" },
  callbacks: {
    async signIn({ account, profile }) {
      const allowed =
        account?.provider === "github" &&
        isOwnerGithubId(account.providerAccountId) &&
        profile &&
        "id" in profile &&
        String(profile.id) === account.providerAccountId
          ? true
          : false;
      if (!allowed) await auditAuthentication("denied");
      return allowed ? true : "/access-denied";
    },
    async jwt({ token, account }) {
      if (account) {
        token.githubId = account.providerAccountId;
        token.provider = account.provider;
        token.ownerAuthVersion = OWNER_AUTH_VERSION;
      }
      return token;
    },
    async session({ session, token }) {
      session.githubId = typeof token.githubId === "string" ? token.githubId : undefined;
      session.ownerAccess =
        token.ownerAuthVersion === OWNER_AUTH_VERSION &&
        token.provider === "github" &&
        isOwnerGithubId(token.githubId);
      return session;
    },
  },
  events: {
    async signIn({ account }) {
      if (account?.provider === "github" && isOwnerGithubId(account.providerAccountId))
        await auditAuthentication("signed-in");
    },
    async signOut(message) {
      if (
        "token" in message &&
        message.token?.provider === "github" &&
        message.token.ownerAuthVersion === OWNER_AUTH_VERSION &&
        isOwnerGithubId(message.token.githubId)
      )
        await auditAuthentication("signed-out");
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
