// A practice-only choice, never a Category row or a vocabulary category ID.
export const VERB_DICTIONARY_CATEGORY = -1;
export function practiceCategorySelection(categories: number[], verbCategoryId: number | null) {
  const real = [...new Set(categories.filter((id) => id > 0))];
  const dictionaryOnly =
    categories.includes(VERB_DICTIONARY_CATEGORY) &&
    verbCategoryId !== null &&
    !real.includes(verbCategoryId);
  return {
    filtered: categories.length > 0,
    dictionaryOnly,
    baseIds: [...new Set([...real, ...(dictionaryOnly ? [verbCategoryId!] : [])])],
    formIds: real,
  };
}
