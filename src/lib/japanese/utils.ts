type ActivityStatus = { activityId: number; status: string };
const scores: Record<string, number> = { WEAK: 0, GOOD: 0.5, PERFECT: 1 };

export function calculateActivityStats(activityVocabs: ActivityStatus[], activityIds: number[]) {
  const values = activityIds.map((id) => scores[activityVocabs.find((av) => av.activityId === id)?.status || "WEAK"] ?? 0);
  const worst = values.length ? Math.min(...values) : 0;
  const worstStatus = worst === 1 ? "PERFECT" : worst === 0.5 ? "GOOD" : "WEAK";
  const percentage = (values.length ? values.reduce((sum, score) => sum + score, 0) / values.length * 100 : 0).toFixed(2);
  return { worstStatus, percentage };
}
