import { AsyncLocalStorage } from "node:async_hooks";
const actors = new AsyncLocalStorage();
export function runAsActor(actor, action) {
  return actors.run(actor, action);
}
export function currentActor() {
  return actors.getStore() ?? null;
}
export function currentUserId() {
  const actor = currentActor();
  if (!actor) throw new Error("An authenticated user context is required.");
  return actor.id;
}
