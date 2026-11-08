export class VocabularyReadingError extends Error {}

type ReadingWord = { hiragana: string | null; readings?: string[] };

// Old practice snapshots and clients still use the primary hiragana value.
export function vocabularyReadings(word: ReadingWord): string[] {
  return [...new Set([word.hiragana, ...(word.readings ?? [])].filter((value): value is string => typeof value === "string" && !!value.trim()).map(value => value.trim()))];
}

export function validateReadings(value: unknown, primary: unknown, isKanji: boolean): string[] {
  const input = value === undefined ? [primary] : value;
  if (!Array.isArray(input) || !input.length || input.some(reading => typeof reading !== "string" || !reading.trim())) {
    throw new VocabularyReadingError("Enter at least one reading. Readings cannot be empty.");
  }
  const readings = [...new Set((input as string[]).map(reading => reading.trim().normalize("NFC")))];
  if (!isKanji && readings.length > 1) throw new VocabularyReadingError("Multiple readings are available for the Kanji category only.");
  return readings;
}

export function acceptsJapaneseAnswer(answer: string, word: ReadingWord & { japanese: string | null }): boolean {
  const normalize = (value: string) => value.trim().normalize("NFC");
  return [...vocabularyReadings(word), word.japanese].some(value => !!value && normalize(value) === normalize(answer));
}
