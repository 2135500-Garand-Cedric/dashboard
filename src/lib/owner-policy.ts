// Permanent public GitHub ID for https://github.com/2135500-Garand-Cedric.
// Usernames and email addresses can change; neither is an authorization key.
import { OWNER_GITHUB_ID } from "./owner-identity.mjs";
export { OWNER_GITHUB_ID, OWNER_AUTH_VERSION, OWNER_DATABASE_USER_ID } from "./owner-identity.mjs";

export function isOwnerGithubId(id: unknown): boolean {
  return typeof id === "string" && id === OWNER_GITHUB_ID;
}

export function isOwnerSession(
  session: { ownerAccess?: boolean; githubId?: string } | null | undefined,
): boolean {
  return session?.ownerAccess === true && isOwnerGithubId(session.githubId);
}
