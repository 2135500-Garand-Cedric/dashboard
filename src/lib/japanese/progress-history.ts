import type { Prisma } from "@/generated/prisma";
import { vocabularyProgress } from "./vocabulary-progress";
import { torontoDateKey } from "./dates";

export async function recordJapaneseProgress(db: Prisma.TransactionClient, userId = 1, now = new Date()) {
  const [vocabulary, activities] = await Promise.all([
    db.vocabulary.findMany({ where: { userId }, include: { category: true, activityVocab: true, verbForms: { include: { activityVocab: true } } } }),
    db.activity.findMany({ select: { id: true } }),
  ]);
  const percentages = vocabularyProgress(vocabulary, activities.map((activity) => activity.id));
  const average = percentages.length ? percentages.reduce((sum, word) => sum + word.percentage, 0) / percentages.length : 0;
  return db.japaneseProgressSnapshot.upsert({
    where: { userId_day: { userId, day: torontoDateKey(now) } },
    create: { userId, day: torontoDateKey(now), average, vocabularyCount: vocabulary.length },
    update: { average, vocabularyCount: vocabulary.length },
  });
}
