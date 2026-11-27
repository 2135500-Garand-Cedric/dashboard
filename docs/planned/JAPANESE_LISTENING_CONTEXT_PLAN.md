# Japanese listening: reliable readings and reusable example sentences

Status: proposal only. No application code, schema changes, AI calls, or audio
generation are implemented by this document. Repository reviewed November 27, 2026.

Prerequisite for AI suggestions: the shared API, authorization, provider adapter,
and spending controls from [AI_ASSISTANT_PLAN.md](AI_ASSISTANT_PLAN.md) exist.
Assume that foundation is available when implementing this proposal. The initial
pronunciation improvement and manually written examples do not require AI.

## Opinion and recommendation

Yes, keep the listening activity and improve it with context. **Hear the word,
then one short sentence using that word**, with its text and English meaning
hidden until revealing the answer. Context makes the activity more useful when
an isolated word is short or shares a pronunciation with another word.

Your idea of building a sentence collection gradually is sensible: aim for
**three accepted examples per vocabulary item**, generating one suggestion when
the item has fewer than three. You choose whether to keep it permanently. Three
is a useful target, not a reason to generate three at once for every vocabulary
item or prevent you from editing/replacing an example later.

I recommend two changes to the proposed workflow:

1. Fix pronunciation independently: speak an explicit saved reading instead of
   asking the speech engine to infer a reading from kanji.
2. Prepare suggestions a few words ahead, using accepted examples immediately
   when available. Practice should not wait on a fresh AI request for every word.

The goal is vocabulary listening with a small amount of context, not translating
long sentences or testing unfamiliar grammar. A sentence can clarify meaning,
but it cannot guarantee perfectly natural pronunciation or teach pitch accent
accurately on its own.

## Current implementation

| Source | Current behavior |
| --- | --- |
| `src/app/japanese/practice/PageClient.tsx` | Activity ID 4 is Japanese-to-English listening. `speak()` creates a browser `SpeechSynthesisUtterance`, sets `ja-JP`, and sends the displayed Japanese spelling. |
| Same practice component | An effect speaks `currentWord.japanese` when the current item changes; Hear again also speaks that spelling. It does not explicitly select a Japanese voice or use the saved kana reading. |
| `Vocabulary` in `prisma/schema.prisma` | Stores Japanese spelling, primary `hiragana`, and additional `readings`. Multiple readings are currently supported for Kanji-category vocabulary. |
| `VerbForm` | Stores each conjugated spelling and its own `reading`, linked to the base vocabulary. |
| `src/lib/japanese/readings.ts` | Collects readings for answer display and checks written answers. Listening currently does not use that reading list to control pronunciation. |
| Practice/session services | Already handle per-activity progress, partial completion, reviews/history, XP, and gold. Sentence acceptance should not change those rules. |

There is no current sentence collection or sentence-generation system. The
listening activity remains a self-rated word activity: reveal, then Weak, Good,
or Perfect. This proposal does not require automatic speech assessment.

## Pronunciation: separate what is shown from what is spoken

Preserve kanji in the vocabulary and revealed sentence, but give speech synthesis
an explicit pronunciation. For a normal word, use the primary saved kana reading.
For a selected verb form, use that form's reading rather than the dictionary-form
reading. If a reading is absent, show that limitation and allow a spelling-based
fallback; never silently describe the inferred audio as verified.

Do not concatenate all possible kanji readings and read them as a word. A Kanji
entry may describe a character with several on/kun readings rather than one
independent word. Choose one clearly labeled target reading for a trial, then use
a natural example containing the character with that reading. Skip contextual
generation if a meaningful lexical use cannot be established; ask for a manual
example rather than inventing a standalone use for a bound reading.

Store sentence spelling and full sentence pronunciation separately. The latter
is a speech-oriented kana string, not text produced by blindly replacing kanji.
Particles such as は, へ, and を need to be checked in the chosen voice, and kana
alone does not guarantee correct prosody. Allow manual corrections and preview.

Keep browser speech as the initial low-complexity playback path. Explicitly
select an available Japanese voice and handle voices loading asynchronously.
Available voices come from the device, and the browser otherwise selects a
default for the requested language. See [MDN voice selection](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/voice)
and [available voices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices).

For more consistent cross-device audio, optionally use the assistant's reusable
text-to-speech adapter and cache generated clips. A text AI API is not itself a
speech engine; hosted synthesis is a separate capability and potential cost.
Evaluate actual Japanese samples before changing providers. A more expensive
voice is not a guarantee that ambiguous kanji or all-kana text will be read well.
Pronunciation overrides must be honored, and bad clips must be replaceable.

## Practice experience

1. Start the existing listening activity with its normal word selection.
2. For the current item, play its selected reading, pause briefly, then play one
   accepted example or a prepared candidate.
3. Keep Japanese sentence text, reading, translation, and the answer hidden.
   Keep the existing category cue visible.
4. Offer Replay word, Replay sentence, and Replay both, plus a slower replay.
5. Reveal the answer: English meaning, Japanese word and reading, sentence,
   pronunciation, and English sentence translation. Highlight the target span.
6. If the example is an AI suggestion, show **Keep sentence**, **Edit**, and
   **Dismiss** independently of Weak/Good/Perfect.
7. Rate the word and continue through the existing practice flow.

Keeping a sentence must not rate the word, award extra XP, or finish the practice.
Rating a word must not implicitly accept an AI sentence. Avoid a forced review
modal for each item. An unaccepted suggestion may be used for this trial after
basic validation, but is labeled as a suggestion at reveal; a Report problem
action lets the user discard it without being forced to penalize their knowledge.

When pronunciation/audio is wrong or unclear, allow replay or skip without a
rating. A skipped/unrated item must not enter the completed-word updates or earn
rewards. Preserve the existing early-finish behavior for already rated words.

Example contrast:

| Target | Reading | Example | English |
| --- | --- | --- | --- |
| 橋 | はし | あの橋を渡ります。 | I will cross that bridge. |
| 箸 | はし | 箸でご飯を食べます。 | I eat rice with chopsticks. |

The context distinguishes the intended meanings without relying on pitch accent.
Examples here illustrate the design; they are not seeded or verified audio.

## Generate gradually without interrupting practice

At session start, fetch accepted examples for the selected items in a bounded
request. Rotate examples rather than always using the first. Retain the chosen
example throughout the trial so Replay does not unexpectedly change the sentence.

If an item has fewer than three accepted examples, prepare at most one new
candidate for it during the session, subject to a session-wide limit. Prefetch
only a small lookahead; do not generate for a 100-word queue all at once when the
user may finish early. Stop requesting new generations after finishing/canceling.

When an accepted example exists, use it while a candidate prepares. A candidate
can be offered after reveal; do not replace the sentence the learner just heard.
When no example is ready, immediately use word-only playback with an optional
Try a sentence action. A late candidate may be previewed after reveal or used on
a later encounter, without restarting audio or revealing an answer early.

Use the assistant provider adapter with a strict output schema: Japanese sentence,
pronunciation, English translation, target surface form/span, target reading,
and target sense/form identifiers. Provide the selected word's spelling, reading,
English sense, category, and form plus existing examples to avoid near duplicates.
Optionally send a small set of familiar words; do not send the entire vocabulary
database for each generation.

Request short beginner-friendly sentences, usually one clause, with simple
grammar, clear context, and the intended meaning. JLPT-like N5/N4 difficulty can
be a prompt preference, not an automatically certified classification. Avoid
unfamiliar names, obscure idioms, long subordinate clauses, and vague sentences
that do not help distinguish the word.

Validate size, target references, duplicates, and required fields on the server.
Confirm the target is used in the intended sense and requested verb form; a
substring match alone cannot establish this. Grammar, translation, and naturalness
cannot be guaranteed by schema validation or a second AI pass. Keep user review,
editing, reporting, and manual creation available. Do not infer approval from
the fact that the learner completed the exercise.

Repeatedly dismissed examples should not regenerate forever in the same session.
Offer another suggestion explicitly later. Generation failures must never prevent
practice or discard saved progress. Do not generate before practice merely because
a vocabulary list was opened.

## Data model and management

Use one owner-scoped `VocabularyExample` model with:

- Stable ID, `userId`, and required vocabulary reference.
- Optional verb-form reference, constrained to that vocabulary and owner.
- Target reading and sense information sufficient to disambiguate the example.
- Japanese sentence, pronunciation, English translation, and target span/form.
- Creation/update timestamps, revision, and manual/AI origin metadata.

Keep unaccepted candidates in short-lived generation records with retry keys and
expiry; they do not count toward the three accepted examples. A **Keep sentence**
operation validates and promotes a candidate atomically, with idempotency and a
concurrency check so two tabs cannot accidentally exceed the initial three-slot
collection. Accepted examples remain editable and deletable from vocabulary
details. Use a conflict response instead of overwriting another tab's corrections.

Scope examples to the exact learning target: three dictionary-form examples do
not establish three examples for every verb conjugation. Generate lazily for the
form actually practiced. For multiple kanji readings, each example identifies
which reading it illustrates; collection coverage should not hide unrepresented
readings. Show counts by form/reading when managing examples, without generating
all combinations automatically.

Changes to a vocabulary spelling, sense, reading, or conjugation invalidate
affected examples for automatic playback until reviewed. Link example ownership
with composite constraints consistently with existing Japanese entities. Do not
attach examples to `ActivityVocab`: the text belongs to the vocabulary/form and
can be reused, while progress remains specific to the activity.

If practice history includes sentence details, save a small optional snapshot
of the exact example and reading used for each completed listening word. This
keeps old reviews accurate after examples are edited/deleted; do not require
reconstruction for older sessions. Playing three sentences is still one word
encounter, not three reviews or extra rewards. Existing percentages, two-week
review timers, and partial-completion rules remain unchanged.

For cached audio, use private storage and authenticated playback. Key clips by
normalized script/reading, voice, provider, and playback configuration; edits
invalidate stale clips. Include files in backup/cleanup procedures or clearly
mark them as regenerable. No public portfolio/media access or service-worker
offline cache is needed.

## Multiple users, permissions, and cost

Reuse the assistant's authorization and budget policy. Its current plan starts
owner-only: invited Japanese members must not automatically gain paid AI access
merely because they can practice. If desired later, explicitly grant a Japanese
example-generation capability with per-user quotas. Reusing accepted examples
requires vocabulary read/practice access; editing or keeping examples requires
vocabulary management access. Every operation must scope vocabulary, forms,
candidates, and audio to the authenticated user.

Member vocabulary copies keep independent examples. Starter-copy behavior must
be explicit: copying approved text can be supported, but should not share mutable
owner records, candidates, private audio URLs, or require new generation charges.
Other users cannot read or alter the owner's sentence collection.

Enforce per-session/per-day generation limits, input/output bounds, concurrency
limits, and the assistant's shared spending cap. Reuse stable request IDs so
network retries do not intentionally trigger additional provider calls; record
ambiguous provider outcomes rather than retrying indefinitely. Do not log full
vocabulary lists or sentence prompts by default.

Cost is proportional to new candidate generations, not simply completed words.
For example, 20 candidates per day means about 600 generation requests over a
30-day month; that is an illustrative workload, not a proposed mandatory limit.
Once a target has three accepted examples, ordinary practice reuses them without
new text generation. Browser speech adds no paid synthesis API call from this app;
hosted speech has separate charges and should be cached. Verify provider pricing
and actual Japanese quality at implementation rather than promising a fixed cost.

## Suggested implementation order and verification

1. Correct word/form reading selection and speech queue cancellation first.
2. Add accepted sentence CRUD, manual entry, reveal UI, and contextual playback.
3. Integrate bounded AI candidates, prefetching, Keep/Edit/Dismiss, and quotas.
4. Add cached hosted speech only if browser voices remain unsatisfactory.
5. Verify the experience on the actual iPhone PWA as well as desktop.

Cancel old speech on advancing, replaying, leaving practice, or finishing so
utterances cannot accumulate or play the wrong word. Handle unavailable voices,
blocked playback, paused synthesis, failed audio, and late asynchronous results
with a visible retry. Coordinate with dashboard music to avoid overlapping audio.

Tests should cover homophones, alternate kanji readings, exact verb forms,
word-only fallback, sentence rotation, answer hiding, duplicate acceptance,
cross-user rejection, missing AI permission, spending limits, generation failures,
vocabulary edits, replay/advance races, incorrect target senses, early finishing,
and unchanged word counts/rewards/timers. No feature tests or provider calls have
been executed for this proposal.

The recommended outcome is the existing quick word practice with better
pronunciation and useful context, while building a small, personally approved
example library a few sentences at a time.
