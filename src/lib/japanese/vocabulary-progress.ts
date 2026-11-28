import { categoryKind } from "./category-kind";
import {
  getKnownKanji,
  isKanjiWritingEligible,
  getApplicableActivityIds,
} from "./kanji-writing";
import { calculateActivityStats } from "./utils";

type Links = { activityId: number; status: string }[];
export type ProgressVocabulary = {
  japanese: string | null;
  category: { name: string; kind?: string } | null;
  activityVocab: Links;
  verbForms: { activityVocab: Links }[];
};

export function vocabularyProgress(
  vocabulary: ProgressVocabulary[],
  activityIds: number[],
) {
  const knownKanji = getKnownKanji(vocabulary);
  const statusRank: Record<string, number> = { WEAK: 0, GOOD: 1, PERFECT: 2 };
  return vocabulary.map((word) => {
    const base = calculateActivityStats(
      word.activityVocab,
      getApplicableActivityIds(
        activityIds,
        isKanjiWritingEligible(word.japanese, knownKanji),
      ),
    );
    const stats = [base];
    if (categoryKind(word.category) === "VERB") {
      stats.push(
        ...word.verbForms.map((form) =>
          calculateActivityStats(
            form.activityVocab,
            getApplicableActivityIds(activityIds, false, true),
          ),
        ),
      );
    }
    return {
      worstStatus: stats.reduce(
        (worst, stat) =>
          statusRank[stat.worstStatus] < statusRank[worst]
            ? stat.worstStatus
            : worst,
        base.worstStatus,
      ),
      percentage: Number(
        (
          stats.reduce((sum, stat) => sum + Number(stat.percentage), 0) /
          stats.length
        ).toFixed(2),
      ),
    };
  });
}

// Read flat user-scoped tables rather than nesting ActivityVocab under thousands
// of composite vocabulary/form keys. Prisma expands that nesting into large OR
// expressions which can exceed PostgreSQL's stack-depth limit.
export async function readJapaneseVocabulary(
  db: import("@/generated/prisma").Prisma.TransactionClient,
  userId: number,
) {
  const [vocabulary, forms, links] = await Promise.all([
    db.vocabulary.findMany({
      where: { userId },
      select: {
        id: true,
        english: true,
        japanese: true,
        hiragana: true,
        readings: true,
        starred: true,
        addedDate: true,
        categoryId: true,
        category: { select: { id: true, name: true, kind: true } },
      },
      orderBy: { english: "asc" },
    }),
    db.verbForm.findMany({
      where: { userId },
      select: {
        id: true,
        baseVocabId: true,
        form: true,
        reading: true,
        formType: { select: { name: true } },
      },
    }),
    db.activityVocab.findMany({
      where: { userId },
      select: {
        id: true,
        activityId: true,
        status: true,
        vocabId: true,
        verbFormId: true,
      },
    }),
  ]);
  type Link = (typeof links)[number];
  const baseLinks = new Map<number, Link[]>(),
    formLinks = new Map<number, Link[]>();
  for (const link of links) {
    const id = link.verbFormId ?? link.vocabId;
    if (id === null) continue;
    const target = link.verbFormId === null ? baseLinks : formLinks;
    const group = target.get(id);
    if (group) group.push(link);
    else target.set(id, [link]);
  }
  const formsByWord = new Map<
    number,
    ((typeof forms)[number] & { activityVocab: Link[] })[]
  >();
  for (const form of forms) {
    const value = { ...form, activityVocab: formLinks.get(form.id) || [] };
    const group = formsByWord.get(form.baseVocabId);
    if (group) group.push(value);
    else formsByWord.set(form.baseVocabId, [value]);
  }
  return vocabulary.map((word) => ({
    ...word,
    activityVocab: baseLinks.get(word.id) || [],
    verbForms: formsByWord.get(word.id) || [],
  }));
}
