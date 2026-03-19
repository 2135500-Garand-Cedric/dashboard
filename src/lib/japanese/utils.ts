// /lib/japanese/activityUtils.ts
import { ActivityVocab, ActivityVocabStatus } from "@/generated/prisma";

const statusMap: Record<string, number> = { WEAK: 1, GOOD: 2, PERFECT: 3 };
const reverseStatus: Record<number, string> = { 1: "WEAK", 2: "GOOD", 3: "PERFECT" };

export function calculateActivityStats(
  activityVocabs: ActivityVocab[],
  activityCount: number,
  excludeActivityIds: number[] = []
) {
  let filtered = activityVocabs;

  if (excludeActivityIds.length) {
    filtered = filtered.filter(av => !excludeActivityIds.includes(av.activityId));
    activityCount -= excludeActivityIds.length;
  }

  const worstVal = Math.min(...(filtered.map(av => statusMap[av.status]) || [1]));
  const worstStatus = reverseStatus[worstVal];

  const sum = filtered.reduce((acc, av) => {
    if (av.status === ActivityVocabStatus.PERFECT) return acc + 1;
    if (av.status === ActivityVocabStatus.GOOD) return acc + 0.5;
    return acc;
  }, 0);

  const percentage = ((sum / activityCount) * 100).toFixed(2);

  return { worstStatus, percentage };
}
