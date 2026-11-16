import { AsyncLocalStorage } from "node:async_hooks";
import { APP_TIME_ZONE } from "./app-time-zone";

const context = new AsyncLocalStorage<string>();
export function getAppTimeZone() {
  return context.getStore() || APP_TIME_ZONE;
}
export function runInTimeZone<T>(timeZone: string, action: () => T): T {
  return context.run(timeZone, action);
}
