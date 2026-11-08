import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { vocabularyProgress } from "./vocabulary-progress";
import { recordJapaneseProgress } from "./progress-history";
import type { PracticeSessionInput, PracticeSessionReview, PracticeWordResult, PracticeStatus } from "./practice-session-types";

export class PracticeSessionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function parsePracticeSession(value: unknown): PracticeSessionInput {
  if (!value || typeof value !== "object") throw new PracticeSessionError("Invalid practice session.");
  const data = value as PracticeSessionInput;
  if (typeof data.sessionKey !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.sessionKey)) throw new PracticeSessionError("Invalid session identifier. Please start a new practice.");
  if (!Number.isInteger(data.activity) || data.activity < 1) throw new PracticeSessionError("Choose a valid activity.");
  if (!Array.isArray(data.categories) || data.categories.some(id => !Number.isInteger(id) || id < 1)) throw new PracticeSessionError("Invalid selected categories.");
  if (typeof data.starredOnly !== "boolean") throw new PracticeSessionError("Invalid starred-word filter.");
  if (typeof data.startedAt !== "string" || typeof data.completedAt !== "string") throw new PracticeSessionError("Practice start and finish times are required.");
  const start = Date.parse(data.startedAt), finish = Date.parse(data.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start || (finish - start) / 1000 > 2147483647) throw new PracticeSessionError("Invalid practice start or finish time.");
  if (!Array.isArray(data.updates) || !data.updates.length || data.updates.length > 1000) throw new PracticeSessionError("The practice must include rated words.");
  const ids = new Set<number>();
  for (const item of data.updates) {
    if (!item || !Number.isInteger(item.activityVocabId) || item.activityVocabId < 1 || !["WEAK", "GOOD", "PERFECT"].includes(item.status) || ids.has(item.activityVocabId)) throw new PracticeSessionError("Practice ratings must contain unique words and valid statuses.");
    ids.add(item.activityVocabId);
  }
  return { ...data, categories: [...new Set(data.categories)] };
}

export async function buildPracticeReview(db: Prisma.TransactionClient, input: PracticeSessionInput, userId = 1): Promise<PracticeSessionReview> {
  const [vocabulary, activities, categories] = await Promise.all([
    db.vocabulary.findMany({ where: { userId }, include: { category: true, activityVocab: true, verbForms: { include: { formType: true, activityVocab: true } } } }),
    db.activity.findMany({ select: { id: true, activity: true } }),
    db.category.findMany({ where: { id: { in: input.categories } }, select: { id: true, name: true } }),
  ]);
  const activity = activities.find(item => item.id === input.activity);
  if (!activity) throw new PracticeSessionError("This activity no longer exists.");
  if (categories.length !== input.categories.length) throw new PracticeSessionError("A selected category no longer exists. Please refresh the page.");
  const available = new Map<number, Omit<PracticeWordResult, "status">>();
  for (const word of vocabulary) {
    const base = { vocabId: word.id, english: word.english, japanese: word.japanese || "", hiragana: word.hiragana, readings: word.readings?.length ? word.readings : [word.hiragana], categoryName: word.category?.name ?? null };
    for (const link of word.activityVocab.filter(link => link.activityId === input.activity)) {
      available.set(link.id, { ...base, english: word.category?.name.trim().toLowerCase() === "verb" ? `${word.english} (dictionary form)` : word.english, activityVocabId: link.id, previousStatus: link.status });
    }
    if (input.activity !== 5) for (const form of word.verbForms) {
      for (const link of form.activityVocab.filter(link => link.activityId === input.activity)) {
        available.set(link.id, { ...base, english: `${word.english} (${form.formType.name})`, japanese: form.form, hiragana: form.reading, readings: [form.reading], activityVocabId: link.id, previousStatus: link.status });
      }
    }
  }
  const words = input.updates.map(item => {
    const word = available.get(item.activityVocabId);
    if (!word) throw new PracticeSessionError("A practiced word no longer exists or does not belong to this activity. Your practice was not saved.");
    return { ...word, status: item.status };
  });
  const updates = new Map(input.updates.map(item => [item.activityVocabId, item.status]));
  const updateLinks = <T extends { id: number; status: PracticeStatus }>(links: T[]) => links.map(link => ({ ...link, status: updates.get(link.id) ?? link.status }));
  const projected = vocabulary.map(word => ({ ...word, activityVocab: updateLinks(word.activityVocab), verbForms: word.verbForms.map(form => ({ ...form, activityVocab: updateLinks(form.activityVocab) })) }));
  const ids = activities.map(item => item.id);
  const average = (values: ReturnType<typeof vocabularyProgress>) => values.length ? values.reduce((sum, word) => sum + word.percentage, 0) / values.length : 0;
  return {
    id: null, activityId: activity.id, activityName: activity.activity,
    date: new Date(input.completedAt).toISOString(), startedAt: new Date(input.startedAt).toISOString(), completedAt: new Date(input.completedAt).toISOString(),
    durationSeconds: Math.round((Date.parse(input.completedAt) - Date.parse(input.startedAt)) / 1000),
    wordCount: words.length, weakCount: words.filter(word => word.status === "WEAK").length,
    goodCount: words.filter(word => word.status === "GOOD").length, perfectCount: words.filter(word => word.status === "PERFECT").length,
    averageBefore: average(vocabularyProgress(vocabulary, ids)), averageAfter: average(vocabularyProgress(projected, ids)),
    hasDetails: true, selectedCategories: categories, starredOnly: input.starredOnly, words,
  };
}

type StoredPractice = Prisma.PracticeGetPayload<{ include: { activity: true } }>;
export function serializePractice(practice: StoredPractice): PracticeSessionReview {
  return {
    id: practice.id, activityId: practice.activityId, activityName: practice.activityName ?? practice.activity.activity,
    date: practice.date.toISOString(), startedAt: practice.startedAt?.toISOString() ?? null, completedAt: practice.completedAt?.toISOString() ?? null,
    durationSeconds: practice.durationSeconds, wordCount: practice.wordCount,
    weakCount: practice.weakCount, goodCount: practice.goodCount, perfectCount: practice.perfectCount,
    averageBefore: practice.averageBefore, averageAfter: practice.averageAfter, hasDetails: practice.words !== null,
    selectedCategories: practice.selectedCategories as PracticeSessionReview["selectedCategories"],
    starredOnly: practice.starredOnly, words: practice.words as unknown as PracticeWordResult[] | null,
  };
}

function errorCode(error: unknown) { return error && typeof error === "object" && "code" in error ? error.code : null; }

export async function savePracticeSession(input: PracticeSessionInput, userId = 1) {
  // Serializable retries protect the before/after average from concurrent saves.
  // The session key makes a retry after a lost response safe as well.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.practice.findUnique({ where: { sessionKey: input.sessionKey }, include: { activity: true } });
        if (existing) {
          if (existing.userId !== userId || existing.activityId !== input.activity || existing.startedAt?.getTime() !== Date.parse(input.startedAt) || existing.completedAt?.getTime() !== Date.parse(input.completedAt)) throw new PracticeSessionError("This session identifier has already been used. Please start a new practice.", 409);
          return serializePractice(existing);
        }
        const review = await buildPracticeReview(tx, input, userId);
        for (const item of input.updates) await tx.activityVocab.update({ where: { id: item.activityVocabId }, data: { status: item.status } });
        await tx.vocabulary.updateMany({ where: { userId, id: { in: review.words!.map(word => word.vocabId) } }, data: { lastPracticed: new Date(input.completedAt) } });
        const saved = await tx.practice.create({ data: {
          userId, sessionKey: input.sessionKey, activityId: input.activity, activityName: review.activityName,
          date: new Date(input.completedAt), startedAt: new Date(input.startedAt), completedAt: new Date(input.completedAt), durationSeconds: review.durationSeconds,
          wordCount: review.wordCount, weakCount: review.weakCount, goodCount: review.goodCount, perfectCount: review.perfectCount,
          averageBefore: review.averageBefore, averageAfter: review.averageAfter,
          selectedCategories: review.selectedCategories!.map(category => ({ ...category })), starredOnly: input.starredOnly,
          words: review.words!.map(word => ({ ...word })),
        }, include: { activity: true } });
        await recordJapaneseProgress(tx, userId);
        return serializePractice(saved);
      }, { isolationLevel: "Serializable", timeout: 20000 });
    } catch (error) {
      if (attempt < 2 && ["P2034", "P2002"].includes(String(errorCode(error)))) continue;
      throw error;
    }
  }
  throw new PracticeSessionError("Unable to save practice. Please try again.", 503);
}
