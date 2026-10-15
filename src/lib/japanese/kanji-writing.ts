export const KANJI_WRITING_ACTIVITY_ID = 5;

export function isKanji(character: string): boolean {
  return /^\p{Unified_Ideograph}$/u.test(character);
}

export function getKnownKanji(vocabulary: { japanese: string | null; category?: { name: string } | null }[]): Set<string> {
  return new Set(vocabulary
    .filter((word) => word.category?.name.trim().toLowerCase() === "kanji")
    .flatMap((word) => Array.from(word.japanese || "").filter(isKanji)));
}

export function isKanjiWritingEligible(text: string | null | undefined, knownKanji: Set<string>): boolean {
  if (!text) return false;
  let hasKanji = false;
  for (const character of text) {
    if (isKanji(character)) {
      if (!knownKanji.has(character)) return false;
      hasKanji = true;
    } else if (!/^[\p{Script=Hiragana}\p{Script=Katakana}ー\u3099\u309a]$/u.test(character)) {
      return false;
    }
  }
  return hasKanji;
}

export function getApplicableActivityIds(activityIds: number[], eligible: boolean, isVerbForm = false): number[] {
  return activityIds.filter((id) => id !== KANJI_WRITING_ACTIVITY_ID || (eligible && !isVerbForm));
}
