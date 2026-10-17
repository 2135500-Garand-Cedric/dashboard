import { getKnownKanji, isKanjiWritingEligible, getApplicableActivityIds } from "./kanji-writing";
import { calculateActivityStats } from "./utils";

type Links = { activityId: number; status: string }[];
export type ProgressVocabulary = {
  japanese: string | null;
  category: { name: string } | null;
  activityVocab: Links;
  verbForms: { activityVocab: Links }[];
};

export function vocabularyProgress(vocabulary: ProgressVocabulary[], activityIds: number[]) {
  const knownKanji = getKnownKanji(vocabulary);
  const statusRank: Record<string, number> = { WEAK: 0, GOOD: 1, PERFECT: 2 };
  return vocabulary.map((word) => {
    const base = calculateActivityStats(word.activityVocab, getApplicableActivityIds(activityIds, isKanjiWritingEligible(word.japanese, knownKanji)));
    const stats = [base];
    if (word.category?.name.trim().toLowerCase() === "verb") {
      stats.push(...word.verbForms.map((form) => calculateActivityStats(form.activityVocab, getApplicableActivityIds(activityIds, false, true))));
    }
    return {
      worstStatus: stats.reduce((worst, stat) => statusRank[stat.worstStatus] < statusRank[worst] ? stat.worstStatus : worst, base.worstStatus),
      percentage: Number((stats.reduce((sum, stat) => sum + Number(stat.percentage), 0) / stats.length).toFixed(2)),
    };
  });
}
