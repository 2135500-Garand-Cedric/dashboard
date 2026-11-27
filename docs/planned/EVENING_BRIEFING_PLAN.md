# Evening briefing: a short spoken preview of tomorrow

Status: proposal only. No application code, database changes, scheduled jobs,
or paid API requests are implemented by this document. Repository and related
plans reviewed November 27, 2026.

Prerequisite: the [AI assistant foundation](AI_ASSISTANT_PLAN.md) is implemented,
including authenticated server-side AI calls, bounded data readers, provider
configuration, and usage limits. This proposal assumes that API exists; it does
not propose building another independent AI integration.

## Opinion and recommendation

This is a good use of AI: turn the dashboard's planning data into a calm,
short explanation you can listen to at the end of the day. The purpose is to
know what tomorrow looks like without opening every task and calendar event.

I recommend a **45–90 second briefing**, with a hard target of no more than
about 180 words. It should cover tomorrow's appointments, important deadlines,
and a few tasks or follow-ups that deserve attention. A quiet day should produce
a much shorter report, not extra commentary to fill the time.

Start with a **Prepare tomorrow's briefing** button and a player with its written
transcript. Optional preparation at a chosen evening time can follow once the
content and playback feel right. Never play audio automatically.

This is a forward-looking planning aid. The existing weekly report remains a
short retrospective about completed weeks; its date rules should not change.

## What you would hear

An illustrative example, using fictional dashboard records:

> Here's your plan for tomorrow, Wednesday, November 18. You have a team meeting
> at nine and a dentist appointment at five. You've reserved forty-five minutes
> at ten to work on payroll, which is also due tomorrow. Your laptop request is
> still waiting for a reply, and its follow-up is due tomorrow. You also have
> one overdue task: send the insurance document. Those are your main things to
> keep in mind.

The script must reflect actual records. It should never invent a meeting,
promise that a task will take an hour, or say you are free when the dashboard
only contains part of your schedule. If Outlook synchronization is not yet
implemented, the report cannot see appointments that exist only in Outlook.

## Selecting useful information

The server chooses eligible records and ranks them using deterministic rules;
the model makes the selected facts easier to listen to. Do not ask the AI to
inspect the whole database or independently decide what dates mean.

| Information | Inclusion and wording |
| --- | --- |
| Tomorrow's events | Actual timed events in chronological order, with all-day events introduced separately |
| Scheduled work sessions | Reserved work time, clearly distinguished from appointments and deadlines |
| Tasks due tomorrow | Say a task is due; do not describe its deadline as a separate appointment |
| Due or overdue follow-ups | Identify an action to check back, rather than a deadline to finish the task |
| Overdue tasks | Mention only a small, ranked selection of unfinished tasks; summarize the remainder as a count |
| Waiting tasks | Highlight when a follow-up is due; otherwise give at most a short useful summary, not the entire Waiting backlog |
| Focus selections | Include tasks deliberately chosen for the target day when supported by current planning data |
| Birthdays, holidays, project target dates | Briefly mention relevant dates, without inventing an action or treating an informational date as a booking |

Exclude DONE, CANCELLED, and archived tasks, completed/cancelled events, and
completed follow-ups from actionable recommendations. A waiting task does not
automatically mean you need to act tomorrow. Blocked work should be described
as blocked, not presented as ready to start.

Deduplicate by source identity: a task with a deadline, follow-up, and work
session can be discussed in one sentence. Keep its different date meanings
intact. If two distinct appointments overlap, mention the conflict briefly; do
not move anything. Projects contain tasks and informational dates, not extra
copies of all their tasks in the spoken list.

For a crowded day, mention the first appointment and the most important items,
then give accurate remaining counts. Keep the complete structured agenda below
the transcript so omitted details stay accessible. A short briefing must not
imply it spoke every item. If nothing qualifies, simply say that the dashboard
has no appointments or urgent items recorded for tomorrow.

Suggested ranking: timed commitments first, then tomorrow's deadlines and due
follow-ups, urgent overdue work, and deliberately selected focus tasks. Use
priority, due time, and stable IDs to break ties. Keep selection bounded before
sending it to the provider.

## Dates, recurrence, and freshness

Resolve tomorrow using the connected user's saved account timezone. Build its
local midnight-to-midnight window and convert timed query boundaries to UTC;
do not calculate tomorrow by adding a fixed 24 hours. Date-only deadlines and
all-day occasions retain their date-only meaning.

Include events overlapping the target day, not just those starting that day.
Describe ongoing multi-day events appropriately. Reuse existing calendar readers,
recurrence expansion, cancellations/exceptions, and selected holiday/birthday
rules; avoid generating additional recurring task occurrences for this report.

Show **For Wednesday, November 18 · Prepared Tuesday at 8:30 p.m.** with the
actual dates. Persist the target date when preparation starts so an API response
after midnight does not silently change the day being summarized. After midnight,
label an existing briefing by its explicit date rather than calling it tomorrow.

A prepared briefing is a snapshot, not a live schedule. Display its prepared
time and an **Update briefing** action. Refresh the source data before updating;
never silently replace audio while it is playing. A later canceled appointment
must disappear from a regenerated version.

## Where it lives and how it feels

Add a small **Tomorrow's briefing** entry in the Assistant page and a compact
dashboard action/card. Reuse the existing dashboard layout without crowding it
with another large report tile. A separate sidebar module is unnecessary.

The briefing view should contain:

- Target date, prepared time, and Generate/Update action.
- Play/Pause, elapsed time, seek control, and playback speed.
- The exact spoken transcript and linked source cards below it.
- Clear Preparing, Creating audio, Ready, and Failed states.

On a phone, make Play prominent and keep the transcript and agenda comfortably
readable. Only begin playback after a tap; browsers restrict audible autoplay.
See [MDN's autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
On generation failure, the first Play tap should not be assumed to grant
permission for arbitrary delayed playback: offer a clear Play button when ready.

Coordinate with the existing music player so the report and YouTube music do
not talk over one another. Pause music when starting the briefing and leave
resumption under your control. Keep the briefing player mounted across internal
navigation if practical. Do not promise reliable background or locked-screen
iPhone playback without testing the actual PWA; the feature must remain useful
with foreground playback and a transcript.

## AI and speech workflow

1. Authenticate and authorize the owner; resolve target date and timezone.
2. Read a bounded planning snapshot with source IDs, titles, statuses, relevant
   times, blockers, and counts using existing services.
3. Produce a deterministic structured agenda, grouping duplicate references.
4. Ask the existing assistant API to write a brief script from those facts only.
5. Validate referenced IDs, timestamps, counts, length, and allowed sections.
6. Send the accepted script to a text-to-speech adapter and store private audio.
7. Return the transcript, source cards, and protected playback URL.

An AI text API does not necessarily include speech synthesis. Reuse the
assistant's speech provider if it supports this, or add a small reusable
text-to-speech adapter behind the same provider/settings and budget conventions.
Generate a normal audio file instead of opening a realtime voice conversation.
There is no microphone recording or speech-to-text requirement for listening.

Prefer a constrained output structure with source IDs and factual fields that
can be checked against the snapshot. Mechanical checks cannot guarantee every
sentence is correct; keep model freedom narrow and reject unsupported claims.
Use deterministic text as a safe fallback if validation or the model fails.
If speech synthesis fails, still show the usable text and agenda with Retry audio.
If source queries fail, say which section is unavailable rather than interpreting
it as an empty calendar or zero tasks.

Do not attach write tools to this workflow. It must not create tasks, reschedule
events, change statuses, send messages, or choose new focus tasks. A separate
explicit request to the assistant can handle those actions through its normal
approval rules.

## Storage, privacy, and reliability

Use a small owner-scoped briefing record containing target date, timezone,
prepared timestamp, source snapshot/fingerprint, exact script, generation state,
provider usage, and an optional private audio storage key. Track the active
generation/version so retries and late responses cannot overwrite newer results.
Keep separate text-ready and audio-ready states.

Use stable job keys and a database claim to prevent double generation across
concurrent taps, worker restarts, or retries. Regenerate audio only when the
accepted script, voice, or language changes. Explicit refreshes still need rate
and spending limits; one briefing per date must not mean unlimited paid retries.

Start owner-only, consistent with the assistant plan. Protect generation,
transcript, and audio endpoints; derive the owner from authentication, never an
AI-supplied user ID. Invited users must not see the owner's calendar or report.
If member access is added later, it requires scoped source readers and an
explicit permission, not just a new sidebar link.

Send only necessary planning fields to the provider, excluding attachments,
finance, full notes, and unrelated personal information. Task titles are still
private data. Treat their content as data rather than provider instructions.
Keep audio outside public assets, use no-store responses, and avoid logging
scripts or provider payloads. Existing public-portfolio work must never expose
these files.

Keep a short retention period, such as seven days, and replace obsolete audio
with retryable cleanup. This is a disposable planning aid, not a permanent
historical record. If stored in a new directory/volume, include it in the backup
inventory or explicitly document audio as regenerable; handle restored records
whose audio is missing by offering regeneration. No offline caching initially.

## Optional evening preparation and notification

After on-demand generation works, add an opt-in setting for an evening time,
language, and voice. Reuse the existing worker framework with a separate job
type and appropriate timeout/lease; do not perform slow AI generation inside
notification delivery itself. Hosted APIs need no extra container beyond the
existing app and worker architecture.

Schedule according to the user's timezone, with one preparation per target day.
Handle daylight-saving duplicate/missing times explicitly and prevent duplicate
jobs. A late restart should not create a backlog of obsolete briefings; skip
missed days and prepare only the next relevant day. Never generate automatically
when the setting is disabled or the usage budget is exhausted.

An optional inbox/push notification can say **Tomorrow's briefing is ready** and
open the authenticated briefing view. Send it only after generation is ready,
with at most one notification per target date. Keep titles and appointment
details off the lock screen by default. A push notification does not play the
report automatically. Email and PDF delivery are outside this proposal.

## Cost and implementation order

Each new briefing costs a short text-model request plus speech synthesis. Those
are separate usage categories: the assistant plan's transcription prices do not
apply to generated speech. With one 45–90 second report per day, the baseline
is roughly 30 text generations and 22.5–45 generated audio minutes per month,
before retries or refreshes. Providers may bill synthesis by characters or tokens
rather than minutes; use their actual units when estimating cost.

Provider/model selection and current prices must be checked when implementing.
Reuse the assistant's usage accounting and enforce a shared server-side budget.
There is no required new paid subscription or dedicated AI hardware, but API
usage is not assumed free simply because the assistant is already available.

Suggested delivery order:

1. Build and test the read-only next-day agenda and ranking rules.
2. Add a bounded AI-written script and visible source cards.
3. Add private speech generation, playback, and music coordination.
4. Verify phone/PWA behavior and reliable retries before scheduled generation.
5. Add opt-in evening scheduling and ready notifications if useful.

Acceptance checks should cover an empty day, a crowded day, recurring exceptions,
overlapping events, all-day and multi-day entries, informational dates, overdue
and waiting tasks, blockers, completed/archived exclusion, deduplication, timezone
changes, midnight and daylight-saving transitions, failed data reads, unsupported
model claims, provider failures, repeated taps, missing audio, and denied access.
No tests or API calls for this proposed feature have been executed.

The desired outcome is simple: press Play in the evening, listen for about a
minute, and understand the main commitments and next actions recorded for tomorrow.
