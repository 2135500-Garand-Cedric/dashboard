# Daily journal: dictate your day and save it as text

Status: proposal only. No journal page, database changes, recording or speech
features are implemented by this document. Repository and referenced documentation
reviewed November 24, 2026; physical iPhone/PWA behavior has not been tested.

## Opinion and recommendation

I think this is a useful idea. The dashboard currently helps organize work and
record what was done; a journal could preserve what made a day meaningful. A nice
conversation or small enjoyable moment is easy to forget and does not naturally
belong in a task or troubleshooting article.

I would make it a calm, simple personal journal: **one entry per day, a prominent
microphone button, an editable transcript, and optional prompts**. Speak about
your day, correct anything misheard, and save it as written text. A short paragraph
should be enough. Avoid compulsory mood scores, streaks, achievements or long questionnaires.
You should be able to write about an ordinary or difficult day too, without having
to invent a positive answer.

### Confirmed scope: speech-to-text

The requested feature is **speech-to-text**: you speak about your day and the
application turns your recording into an editable journal entry. Dictation is a
core part of the proposed journal, not an optional enhancement.

Typing remains available for corrections and as a fallback. Reading entries aloud
(text-to-speech) is outside the initial scope and could be considered separately
later. A conversational AI assistant is not required for recording/transcription.

| Feature | Example | Role in this proposal |
| --- | --- | --- |
| Speech-to-text | Speak about a nice dinner and get an editable written entry | Core requested feature |
| Typing/editing | Correct a name or add a detail to the transcript | Core supporting feature |
| AI rewriting | Ask for a polished summary of your entry | Optional later enhancement, never required for saving |

## Everyday experience

Add **Journal** to the sidebar. Opening it shows today's date and the existing
entry, or a blank editor with a microphone button ready to use. A date control lets you write about yesterday
or revisit another day. There should be no need to invent a title.

The editor would have one main text area and small optional prompt buttons:

- **Best moment** — something you especially enjoyed.
- **Something nice** — a kind gesture, conversation, surprise or enjoyable event.
- **What happened** — anything else you want to remember.

These help you start writing; they should not become three mandatory forms.
Pressing one can insert a heading into the same draft, ready for you to dictate
or type your own words.
An optional short highlight can provide a useful preview in history.

For example, after dictating and reviewing your words:

> Today I had lunch with an old friend. We stayed much longer than planned and
> laughed about our school years. The best moment was realizing how easy it was
> to talk again even after so much time. I also went for a quiet walk afterward.

The entry page would keep the date, Record/Stop controls, transcript and save
status easy to find. Use the existing dark theme, icons, centered dialogs where
needed, and responsive spacing. On a phone, prioritize a comfortable reading/editing
area and large recording buttons. Long journal text can scroll naturally with
the page.

## Speech-to-text: the main workflow

Provide a dedicated microphone button with visible recording state and elapsed
time. Start only when you press Record; never listen automatically on opening the
page. A practical first limit would be five minutes per clip, with additional clips
allowed for the same day.

1. Choose the journal date, defaulting to today in your saved dashboard timezone.
2. Press Record and speak about your day.
3. Press Stop; the microphone is released and the clip is transcribed.
4. Review the written transcript and correct names, punctuation or misunderstood words.
5. Insert or append it to the entry and save it through the normal journal workflow.

Use a hosted transcription service for a consistent dedicated recording experience.
The phone keyboard's dictation can also populate the text area, but it is a fallback
or early prototype, not a substitute for the planned microphone workflow.

Show distinct **Recording / Transcribing / Ready to review / Saved** states. A
transcript should not be described as saved until its journal write succeeds.
Keep the selected journal date fixed throughout a recording, even if midnight
passes before transcription finishes.

Append dictation to existing text or insert it at the chosen position. A late
transcription response must not overwrite edits made while it was processing.
Show the transcript for correction when insertion would be ambiguous. Names,
French/English switching and punctuation deserve testing.

A protected upload endpoint should use a reusable transcription adapter, shared
with the one proposed for the [AI assistant](AI_ASSISTANT_PLAN.md), without requiring the rest of that
assistant to exist first. Validate recording format, size and duration, release
the microphone afterward, and discard temporary audio after transcription.

Recording requires permission and HTTPS under normal browser rules.
[MDN microphone documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
explains these requirements. Test the actual iPhone PWA, including interrupted
recording, denied permission and switching applications. Keep typing available
throughout. Saving the original voice recording could be a later explicit option;
it is not required for this speech-to-text journal and would add private file
storage needs. The saved journal text is the primary record.

## Browsing memories

Provide a simple history page with recent dated entries and a short preview or
highlight. A month/date filter and text search should be enough initially. Opening
an entry lets you read or edit the saved text. An empty day should look like an
invitation to write, not an incomplete task.

Potential later additions include favorite memories, an On this day view after
enough history exists, optional photos and a monthly collection of chosen
highlights. These are interesting because they help rediscover memories; a large
statistics dashboard would add less value to this particular feature.

## How it fits the current repository

Keep journal entries separate from `KnowledgeArticle` and work notes. Knowledge
contains reusable reference material; work notes describe progress on a task or
project. A journal describes a day and should not require either association.
Reuse the existing layout, owner authorization, snackbar feedback and timezone
helpers, rather than forcing journal text into those models.

A minimal new `JournalEntry` model could contain:

| Field | Purpose |
| --- | --- |
| `id`, `userId` | Stable entry identity and server-enforced owner |
| `entryDate` | Date of the day being described, as `YYYY-MM-DD` |
| `body` | Your written text, including any optional prompt headings |
| `highlight` | Optional short best-moment preview |
| `revision` | Protect against overwriting an entry from another device |
| `createdAt`, `updatedAt` | Actual UTC timestamps for saving/editing |

Use a unique `(userId, entryDate)` constraint so several captures on one day
extend one entry. The entry date is a calendar date, not midnight stored as an
instant. Default it from the dashboard's saved timezone; writing yesterday's
entry today still saves yesterday as `entryDate`. Changing timezone later should
not move already written entries onto different dates.

Candidate routes would be `/journal`, `/journal/history` and a dated entry page,
with owner-protected journal APIs. Those paths and the model are proposals, not
features currently present. No photos, audio tables or generic attachment model
are needed for the first dictation-and-text version. Temporary recording upload
does not require permanently attaching audio to the entry.

## Saving reliably and keeping it private

I would favor private autosave after a short pause in typing, with clear
**Saving / Saved / Unable to save** feedback and a manual Retry/Save action.
Transcription finishing does not mean the entry has been saved; these states stay separate.
Do not display Saved until the server confirms the write.

Use expected revisions, stable request identifiers and the daily uniqueness rule.
If two devices create or edit the same day, preserve the draft and show a conflict
instead of silently replacing one version. Protect unsaved work before navigation.
Durable offline drafts are a separate capability: existing in-memory context alone
does not guarantee recovery after an iPhone closes the PWA. If full crash/offline
recovery is included, scope and test it explicitly with the
[recoverable drafts proposal](DASHBOARD_IMPROVEMENT_IDEAS.md#2-recover-unfinished-forms-after-a-refresh-or-phone-app-restart).

Every entry, search and transcription endpoint uses the existing GitHub
owner-only guards. Keep journal text out of server logs. Full-database backups
would include saved text entries automatically. Discard temporary clips after
transcription/cancellation rather than retaining raw audio by default. Explain
that a discarded clip cannot be recovered if the transcript is also lost.

Journal content should not automatically appear in the weekly PDF email, task
activity feed or future AI context. Those integrations could be explicit options.
For example, the weekly report might show days written or a highlight you selected,
without including private paragraphs by default. Explain which audio is sent to
the transcription provider and its retention policy. Do not log recordings or
transcript contents.

## Reminders and links to other ideas

An optional evening reminder could reuse the notification worker and inbox.
It should be opt-in, easy to dismiss, and skipped when today's entry is already
written. A missed day should not create a backlog of journal reminders.

The [planned assistant](AI_ASSISTANT_PLAN.md) could later support “Add this to
today's journal” or find a memory you ask about. Saving a straightforward journal
entry should remain possible without the conversational assistant. Transcription
converts your speech into words; it should not summarize or rewrite it automatically.
Rewriting should be an explicit preview and must preserve your original meaning rather than invent happier events
or claiming feelings you did not describe.

## Cost and hosting

| Version | Expected additional service cost |
| --- | --- |
| Typed editing and journal history | Uses existing NAS/database hosting; no chat-model API required |
| Phone keyboard dictation | No transcription API charge from the dashboard; availability depends on the device |
| Dedicated microphone and hosted transcription | Core speech-to-text path; charged by the chosen provider's usage |
| AI rewriting or future read-aloud | Outside the initial scope; costs depend on the chosen implementation |

As one current transcription example,
[GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe)
lists **US$0.0045/minute**. Two recorded minutes every day over 30 days would be
about **US$0.27/month**; five minutes daily would be about **US$0.68/month**.
These are calculations before tax/exchange rates, not measured dashboard costs,
and do not include optional AI rewriting or paid speech generation. Recheck rates
and model availability when implementing.

No extra container is needed for the journal with hosted transcription. Local
transcription would be a separate hardware/service decision. Provider credentials
and recording limits would be configured during implementation; no environment
variables need changing for this planning document.

## Suggested implementation phases

1. **Journal foundation:** one owner-scoped entry per date, comfortable editor,
   optional prompts/highlight, reliable save states and history. This supports the
   dictation workflow; it is not the complete requested feature on its own.
2. **Core speech-to-text:** prominent Record/Stop controls, shared transcription
   service, editable transcript, safe append/insert behavior, recording limits and
   explicit processing/error states.
3. **Phone and reliability verification:** iPhone PWA microphone permissions,
   interrupted uploads, app switching, failed transcription/save retries and
   preservation of text typed while processing.
4. **Optional memory features:** favorites, chosen highlights, evening reminders
   and carefully scoped assistant/weekly-report integration. Read-aloud could be
   discussed separately later.

Verify near-midnight date selection, backdated entries, timezone changes,
concurrent edits, duplicate saves, lost connections, French/English speech,
Unicode text, microphone denial, silence/empty transcripts, interrupted recordings,
recording limits, navigation while processing, and unauthorized access. Keep typed
fallback available when recording or transcription fails.

My preferred first version is deliberately small: **speak about your day, review
what was transcribed, and keep it reliably as written memories**.
