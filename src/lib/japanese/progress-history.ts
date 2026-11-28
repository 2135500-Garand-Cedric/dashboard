import { currentUserId } from "@/lib/accounts/context.mjs";
import type { Prisma } from "@/generated/prisma";
import {
  vocabularyProgress,
  readJapaneseVocabulary,
} from "./vocabulary-progress";
import { torontoDateKey } from "./dates";

type ProgressTotals = { average: number; vocabularyCount: number };
export async function recordJapaneseProgress(
  db: Prisma.TransactionClient,
  userId = currentUserId(),
  now = new Date(),
  totals?: ProgressTotals,
) {
  if (!totals) {
    const [vocabulary, activities] = await Promise.all([
      readJapaneseVocabulary(db, userId),
      db.activity.findMany({ select: { id: true } }),
    ]);
    const percentages = vocabularyProgress(
      vocabulary,
      activities.map((activity) => activity.id),
    );
    totals = {
      average: percentages.length
        ? percentages.reduce((sum, word) => sum + word.percentage, 0) /
          percentages.length
        : 0,
      vocabularyCount: vocabulary.length,
    };
  }
  const day = torontoDateKey(now);
  return db.japaneseProgressSnapshot.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, ...totals },
    update: totals,
  });
}
