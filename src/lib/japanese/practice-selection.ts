import type { PracticeStatus } from "./practice-session-types";

const REVIEW_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

type ReviewWord = {
  status: PracticeStatus;
  lastPracticed: Date | string | null;
};

// Review priority is temporary. The stored rating still controls borders and averages.
export function practicePriority(word: ReviewWord, now = new Date()): PracticeStatus {
  if (word.lastPracticed === null) return "WEAK";
  const practicedAt = new Date(word.lastPracticed).getTime();
  return now.getTime() - practicedAt >= REVIEW_INTERVAL_MS ? "WEAK" : word.status;
}

export function selectPracticeWords<T extends ReviewWord>(
  words: T[],
  count: number,
  now = new Date(),
): T[] {
  const groups: Record<PracticeStatus, T[]> = { WEAK: [], GOOD: [], PERFECT: [] };
  for (const word of words) groups[practicePriority(word, now)].push(word);
  const result: T[] = [];
  for (const status of ["WEAK", "GOOD", "PERFECT"] as const) {
    const group = groups[status];
    for (let index = group.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [group[index], group[other]] = [group[other], group[index]];
    }
    result.push(...group.slice(0, Math.max(0, count - result.length)));
    if (result.length >= count) break;
  }
  return result;
}
