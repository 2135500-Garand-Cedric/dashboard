import { shiftDateKey, torontoDateKey } from "./dates";

type Counts = { perfect: number; good: number; weak: number; total: number };
const emptyCounts = (): Counts => ({ perfect: 0, good: 0, weak: 0, total: 0 });
export type StatisticsPeriod = "month" | "year";

function shiftMonth(key: string, offset: number): string {
  const date = new Date(`${key.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export function statisticsStartDate(now: Date, period: StatisticsPeriod): string {
  const today = torontoDateKey(now);
  return period === "year" ? shiftMonth(today, -11) : shiftDateKey(today, -29);
}

export function buildJapaneseStatistics(
  now: Date,
  practices: { date: Date; activityId: number; perfectCount: number; goodCount: number; weakCount: number; wordCount: number }[],
  vocabulary: { addedDate: Date; category: { name: string } | null }[],
  progress: { percentage: number; worstStatus: string }[],
  snapshots: { day: string; average: number }[],
  period: StatisticsPeriod = "month",
) {
  const today = torontoDateKey(now);
  const days = Array.from({ length: period === "year" ? 12 : 30 }, (_, index) => ({
    date: period === "year" ? shiftMonth(today, index - 11) : shiftDateKey(today, index - 29),
    vocab: emptyCounts(), kanji: emptyCounts(), added: emptyCounts(), average: null as number | null,
  }));
  const byDay = new Map(days.map((day) => [day.date, day]));
  const bucketKey = (date: Date) => period === "year" ? `${torontoDateKey(date).slice(0, 7)}-01` : torontoDateKey(date);
  for (const practice of practices) {
    if (torontoDateKey(practice.date) > today) continue;
    const day = byDay.get(bucketKey(practice.date));
    if (!day) continue;
    const counts = practice.activityId === 5 ? day.kanji : day.vocab;
    counts.perfect += practice.perfectCount;
    counts.good += practice.goodCount;
    counts.weak += practice.weakCount;
    counts.total += practice.wordCount;
  }
  const categories = new Map<string, number>();
  vocabulary.forEach((word, index) => {
    const name = word.category?.name || "Uncategorized";
    categories.set(name, (categories.get(name) || 0) + 1);
    if (torontoDateKey(word.addedDate) > today) return;
    const day = byDay.get(bucketKey(word.addedDate));
    if (!day) return;
    const status = progress[index].worstStatus;
    if (status === "PERFECT") day.added.perfect += 1;
    else if (status === "GOOD") day.added.good += 1;
    else day.added.weak += 1;
    day.added.total += 1;
  });
  // Carry the last observed value forward, leaving dates before tracking blank.
  const ordered = [...snapshots].sort((a, b) => a.day.localeCompare(b.day));
  let snapshotIndex = 0;
  let average: number | null = null;
  for (const day of days) {
    const monthEnd = period === "year" ? shiftDateKey(shiftMonth(day.date, 1), -1) : day.date;
    const cutoff = monthEnd > today ? today : monthEnd;
    while (snapshotIndex < ordered.length && ordered[snapshotIndex].day <= cutoff) {
      average = ordered[snapshotIndex++].average;
    }
    day.average = average;
  }
  return {
    period,
    days,
    categories: [...categories].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    historyStarted: ordered[0]?.day ?? null,
    summary: {
      practiced: days.reduce((sum, day) => sum + day.vocab.total, 0),
      kanji: days.reduce((sum, day) => sum + day.kanji.total, 0),
      added: days.reduce((sum, day) => sum + day.added.total, 0),
      vocabularyCount: vocabulary.length,
      average: progress.length ? progress.reduce((sum, word) => sum + word.percentage, 0) / progress.length : 0,
    },
  };
}

export type JapaneseStatistics = ReturnType<typeof buildJapaneseStatistics>;
