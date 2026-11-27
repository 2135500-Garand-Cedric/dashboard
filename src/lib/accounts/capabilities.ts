export const JAPANESE_CAPABILITIES = [
  "japanese.vocabulary.read",
  "japanese.vocabulary.manage",
  "japanese.practice",
  "japanese.statistics.read",
  "japanese.history.read",
] as const;
export type Capability = (typeof JAPANESE_CAPABILITIES)[number];
export function validPermissions(value: unknown): Capability[] {
  if (!Array.isArray(value) || value.some((item) => !JAPANESE_CAPABILITIES.includes(item)))
    throw new Error("Choose supported Japanese permissions.");
  const result = [...new Set(value)] as Capability[];
  if (
    result.some((item) => ["japanese.vocabulary.manage", "japanese.practice"].includes(item)) &&
    !result.includes("japanese.vocabulary.read")
  )
    throw new Error("Vocabulary access is required to manage words or practice.");
  return result;
}
