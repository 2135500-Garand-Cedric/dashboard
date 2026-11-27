export type Actor = {
  id: number;
  role: string;
  sessionId?: string;
  name?: string | null;
  timeZone?: string | null;
  permissions: string[];
  initialized: boolean;
};
export function runAsActor<T>(actor: Actor, action: () => T): T;
export function currentActor(): Actor | null;
export function currentUserId(): number;
