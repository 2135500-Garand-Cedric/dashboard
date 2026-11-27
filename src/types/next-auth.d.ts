import "next-auth";
declare module "next-auth" {
  interface Session {
    authUserId: number;
    role: string;
    sessionId: string;
    permissions: string[];
    initialized: boolean;
    githubId?: string;
    ownerAccess: boolean;
    user?: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}
