import { auditTestDependency } from "./audit.mjs";
// Existing domain fixtures use the configured baseline zone and do not read user
// preferences. Settings/request-context tests load the actual modules separately.
export function timeZoneTestDependency(name, dependencies = {}) {
  const audit = auditTestDependency(name, dependencies);
  if (audit) return audit;
  if (name === "@/lib/user-settings")
    return {
      withUserTimeZone: async (action) => action(),
      readUserSettings: async () => ({ timeZone: "America/Toronto" }),
    };
  if (name === "@/lib/time-zone-context")
    return {
      getAppTimeZone: () => process.env.APP_TIME_ZONE || "America/Toronto",
    };
  return undefined;
}
