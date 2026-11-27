import assert from "node:assert/strict";
import test from "node:test";
import {
  practiceCategorySelection,
  VERB_DICTIONARY_CATEGORY as dict,
} from "./helpers/practice-categories.mjs";
test("dictionary-only is a virtual base-word filter and full Verb wins without duplicates", () => {
  assert.deepEqual(practiceCategorySelection([], 7), {
    filtered: false,
    dictionaryOnly: false,
    baseIds: [],
    formIds: [],
  });
  assert.deepEqual(practiceCategorySelection([dict], 7), {
    filtered: true,
    dictionaryOnly: true,
    baseIds: [7],
    formIds: [],
  });
  assert.deepEqual(practiceCategorySelection([dict, 8], 7), {
    filtered: true,
    dictionaryOnly: true,
    baseIds: [8, 7],
    formIds: [8],
  });
  assert.deepEqual(practiceCategorySelection([dict, 7, 7], 7), {
    filtered: true,
    dictionaryOnly: false,
    baseIds: [7],
    formIds: [7],
  });
});
