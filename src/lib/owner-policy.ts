// Permanent public GitHub ID for https://github.com/2135500-Garand-Cedric.
// Usernames and email addresses can change; neither is an authorization key.
export const OWNER_GITHUB_ID = "89470930";
export const OWNER_AUTH_VERSION = 1;

export function isOwnerGithubId(id: unknown): boolean {
  return typeof id === "string" && id === OWNER_GITHUB_ID;
}

export function isOwnerSession(session: { ownerAccess?: boolean; githubId?: string } | null | undefined): boolean {
  return session?.ownerAccess === true && isOwnerGithubId(session.githubId);
}
