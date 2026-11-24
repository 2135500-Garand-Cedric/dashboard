# Short weekly report implementation plan

Status: implemented. The later overview revision shows completed weeks only and
uses summary cards without individual record lists; the maintenance guide describes
current behavior. The specification below retains the original scope.

Original implementation status: implemented. See [Weekly report maintenance](WEEKLY_REPORT_MAINTENANCE.md)
for the final code structure, aggregation rules, and executed verification. The
sections below preserve the implementation specification.

The weekly report would answer two questions: **What did I do this week?** and
**What needs my attention now?** It should take about a minute to scan and link
to the existing records when more detail is needed.

This develops proposal 5 in [Dashboard improvement ideas](../planned/DASHBOARD_IMPROVEMENT_IDEAS.md).
The first version is an on-demand page, without automatic emails, push messages,
AI summaries, or a scheduled report generator.

## Where it would appear

Add a protected `/weekly-report` page and a **Weekly report** navigation entry
with a recognizable calendar/report icon. Keep the report separate from the main
dashboard so its tiles stay compact.

At the top, show the written date range and simple **This week**, **Previous week**,
and previous/next week controls. Disable navigation beyond the current week.
Support a validated Monday date in the URL, such as `?week=2026-11-23`, so a report
can be revisited after a refresh. Do not add monthly/yearly modes initially;
Japanese statistics and finance already provide those views.

Use existing cards, icons, subtle colored borders, and written dates. On a wide
screen, work and attention can sit side by side, followed by Japanese practice,
Knowledge, and finance. On phones, use a single column and normal page scrolling.
Show at most three preview records per list, with a count and **View all** action.
Avoid a wall of notes, a full calendar, or several large charts.

## What the report would show

### Work completed during the selected week

Show the number of distinct tasks with a recorded transition to Done, followed
by up to three titles and their project names. A task completed twice in the same
week counts once in this headline.

Show reopened tasks separately. If something was completed and then reopened,
it still belongs to that week's completion activity, with a **Reopened** indicator
when appropriate. Opening a task shows its current record; the report must not
pretend that a historical completion describes its current status.

Cancelled work is separate from completed work. Archived tasks can still belong
to historical results. A deleted task's retained activity/reference can explain
what happened without offering a broken detail link. Checklist items and the
older Subtask model are not additional completed tasks; canonical child tasks
are ordinary tasks with their own IDs.

Use recorded activity, including status changes made through notes. Do not infer
weekly completions from the current status or latest `updatedAt`, and do not
count note copies in both task and project timelines as separate achievements.
When older history is incomplete, use **No recorded completions** or a coverage
indicator instead of claiming that nothing was completed.

### Needs attention now

This section is deliberately about the present, even when viewing an older week.
Label it **Needs attention now** so last month's report does not imply that today's
unfinished work was overdue last month.

Show compact groups for:

- Open tasks with overdue deadlines.
- Active follow-ups due now, including waiting tasks that have a due follow-up.
- Upcoming open-task deadlines and active project target dates in the next seven
  calendar days. Already-overdue project targets can appear with an Overdue label.

Reuse the My Work rules for open/archived status, date-only deadlines, exact
instants, dependencies where relevant, and recurring-task visibility. A waiting
task without a due follow-up is not automatically urgent. Closed, cancelled,
archived, or inactive records must not appear as actionable work.

A task can qualify for both overdue and follow-up groups. Deduplicate any overall
attention total by task ID and identify both reasons on its row. Project targets
remain a separate project count. Do not add the group totals as though every row
were a different task.

A task deadline is not an event, a follow-up is not a deadline, and a project
target is not automatically a scheduled work session. Keep those labels visible.
Do not invent an end-of-week historical backlog without historical snapshots.

### Japanese practice

Show vocabulary practice and kanji writing separately, each with session count,
word reviews, recorded practice time, and Weak/Good/Perfect totals. Use the familiar
status colors, with labels rather than color alone. A small status strip is enough;
there is no need to repeat the statistics page's full charts.

A word practiced in three sessions contributes three reviews. Do not label the
sum as unique vocabulary. Use saved results for each practice rather than today's
vocabulary status, which may have changed afterward. Sessions spanning midnight
belong to the local date they finished, matching the current saved practice date.
An unfinished or unsaved practice does not count as completed activity.

An optional **Practice impact** value can reuse the history calculation: sum
`averageAfter - averageBefore` for measured sessions and express it in percentage
points. Label partial coverage if some sessions lack measurements. This is recorded
practice impact, not the overall vocabulary list's net weekly change; adding or
deleting vocabulary and changes between sessions affect that average too.

Missing durations remain unknown, not zero minutes. If only some sessions record
time, display the known total with a partial-coverage indicator. Do not estimate
old session time, fabricate practice outcomes, or replace historical activity
names with newly renamed ones when a saved name exists.

### Knowledge saved during the week

Show the number of articles created and the number of existing articles changed,
with up to three titles and their types, such as Procedure or Troubleshooting.

Use `KnowledgeArticle.createdAt` for creation and
`KnowledgeArticleRevision.recordedAt` for changes. A current `updatedAt` alone
would miss last week's edit if the article was edited again this week.
Count each article once within a group, and exclude articles created during the
week from the separate existing-articles-changed headline. Restores and other
recorded article changes can be included with their actual action labels.

Use the relevant historical revision title where available, while showing a
current Archived indicator if needed. Unsaved editor drafts and temporary image
uploads are not published articles. Do not read or summarize document contents
or copy troubleshooting notes into the short report.

### Recorded finances

Show **Income**, **Expenses**, and **Net cash flow** for the selected week and one
explicit currency. A CAD 400 deposit, CAD 125 of purchases, and CAD 10 refund would
show CAD 400 income, CAD 115 expenses, and CAD 285 net cash flow, provided there
are no cash-flow adjustments.

Reuse the overview's canonical financial calculation and statement-match status:

- Receipts and pay stubs are supporting records, not additional money movements.
- Matched imported/manual records count once through the existing duplicate
  exclusion and matching rules.
- Transfers between owned accounts, including credit-card payments, are excluded
  from income and expenses.
- Refunds reduce expenses on their recorded financial date; they do not silently
  rewrite an earlier week's purchases.
- Preserve existing classification of reimbursements instead of guessing whether
  a payment should be an income or a refund.
- Income here is counted cash deposits, not gross salary plus net salary plus
  deposits. Do not add the removed pay-details section back into this report.
- If cash-flow adjustments are nonzero, show a short adjustment line so the net
  total reconciles. The existing formula includes adjustments alongside income,
  purchases, and refunds.

Use the existing five supported currencies and their symbols. Never combine CAD,
USD, EUR, GBP, and JPY into one total or apply an invented exchange rate. Label the
section **Recorded CAD activity**, for example, rather than implying complete
finances or an account balance.

Include a compact count of income/expense records in the selected date range
**not matched to a statement**, linked to those records. This is independent of
whether an expense has a receipt or an income has a pay stub. Do not restore a
separate reconciliation workflow.

Offer the existing finance dataset choices, defaulting to Personal, so example
finance data is explicitly selected rather than mixed into personal figures.
Finance drill-down links must carry the same dates, currency, and dataset filters.
A week with no CAD records should say **No recorded CAD activity**, without implying
that there was no activity in another currency.

## Week boundaries and current week behavior

Use Monday 00:00 through the next Monday 00:00 in the saved dashboard timezone.
Compute calendar boundaries first, then convert the two boundaries to UTC.
Queries use an inclusive start and exclusive end. Do not calculate a week by
adding exactly 168 hours: daylight-saving transitions can change its duration.

For the current week, include recorded activity only through the report's captured
current time and label the report **Week so far**. For a previous week, use the
full completed interval. Capture one `now` and timezone per report request so
sections agree about the selected period and what is due now.

Financial transaction dates are calendar dates. Pass the selected Monday through
Sunday to the existing custom-date report filters instead of shifting those
stored dates as if they were UTC timestamps. Future-dated transactions later in
the current week should not be presented as already recorded cash flow through
now; cap this week's financial end date at the user's local today.

Changing the saved timezone recalculates report boundaries. Do not rewrite stored
records. Keep the interface free of hardcoded timezone names.

Do not compare a partial current week with a complete previous week in the initial
version. A historical report is recalculated from available records: corrected
finance entries and later backdated data can change it. It is not a frozen audit
statement or a saved snapshot of everything as it looked that Sunday.

## Existing code and data to reuse

- `src/components/SideMenu.tsx` and `ProtectedLayout` provide navigation and the
  existing GitHub-owner page boundary.
- `src/lib/work-management/activity-server.ts`, `task-foundation.ts`, and the
  `WorkActivity` model provide recorded transitions, before/after status changes,
  timestamps, and retained task references.
- `src/lib/work-management/planning-rules.ts`, `dates.ts`, and `query.ts` provide
  planning predicates and timezone-aware date rules. Reuse the read-only rules,
  not `searchWork` blindly: that service also invokes recurrence generation.
  Opening a report must not generate tasks or otherwise mutate source records.
- `WorkProject` provides target dates and current project status. Reuse recurrence
  visibility rules without manufacturing additional future copies.
- `Practice`, `src/lib/japanese/practice-session-types.ts`, and `practice-sessions.ts`
  provide recorded session counts, durations, outcomes, and practice impact. Existing
  history reads accept day/month ranges, so they need a deliberate weekly extension
  or a dedicated report reader; a fabricated `range=week` link will not work today.
- `KnowledgeArticle` and `KnowledgeArticleRevision` provide article creation and
  revision history. `src/lib/knowledge/server.ts` supplies the existing detail links
  and owner-scoped reading conventions.
- `src/lib/finance/reporting.ts`, `overview.ts`, and `reporting-server.ts` provide
  exact money arithmetic, canonical counting, filters, dataset selection, and
  statement-match coverage. `/api/finance/reports` already supports custom dates.
- `withUserTimeZone`, `SettingsContext`, shared cards, `FinanceLoadError`, snackbar
  conventions, and existing source-detail buttons provide consistent presentation.

The existing Japanese date-helper names include an older timezone reference, but
they resolve through the saved application timezone. Do not infer a fixed timezone
from a function name or add another hardcoded reporting timezone.

## Proposed page and API

Add an owner-protected `/api/weekly-report?week=YYYY-MM-DD` read endpoint, with
validated finance currency and dataset parameters. Add a bounded detail endpoint
such as `/api/weekly-report/items?section=completed&week=...&cursor=...` for expanded
lists. These are proposed routes, not existing APIs.

Keep aggregation in small server services and pure calculation helpers. Query the
underlying services/models directly instead of making the server fetch its own
HTTP endpoints. Return section summaries, up to three preview rows, exact totals,
coverage indicators, the selected date boundaries, and the captured current time.

**View all** should expand a paginated list in the report or use an existing page
only when its filters reproduce the same metric. The All Work page cannot currently
filter completion activity by week; linking the completion count to today's Done
list would hide reopened work and produce different results. Individual rows
should open their normal task, project, practice-session, article, or finance detail.

Use distinct-ID counts and bounded queries, not per-row detail requests. Avoid
loading Knowledge bodies or practice word-result JSON for headline totals.
The finance reporting service currently reads broad datasets; reuse it once for
the chosen currency and inspect its cost rather than issuing one full report
request for every currency. Any later query optimization must retain linked
records needed for duplicate/matching calculations, even across date boundaries.

A failure in finance should leave work, Knowledge, and Japanese sections usable.
Return explicit per-section availability and a Retry action; unavailable data must
not look like a zero total. Cancel stale requests when switching weeks and refresh
on demand. No continuous polling or worker is needed.

## Authentication and reliability

Use the current GitHub-owner policy and permanent database-owner mapping. Call
`requireOwner` before parsing query parameters or reading data in every new API.
Scope histories and linked sources to the owner, including retained/deleted-source
references. Page protection alone is insufficient for API access.

Use private no-store responses. Do not log notes, descriptions, document details,
financial values, or raw queries. Keep private report data out of service-worker
caches. Opening or refreshing the report must not mark tasks done, acknowledge
notifications, save practice sessions, import transactions, or update snapshots.

No initial database migration, new dependency, extra container, or scheduled job
is expected. Reuse existing history rather than copying source records into a
weekly table. Add an index only if measured query performance justifies a separate
additive migration.

## Implementation phases

### Phase 1 Period and work summary

Create the protected page, navigation, validated week controls, timezone boundary
helper, work-completion reader, and current attention groups. Distinguish historical
activity from today's state, and provide exact drill-down lists.

Acceptance: a task completed then reopened is represented accurately; current
attention matches My Work; opening any week performs no source writes.

### Phase 2 Japanese and Knowledge summaries

Add separate practice types, recorded duration/impact coverage, and revision-based
Knowledge activity. Link to individual sessions and articles without loading their
full contents for the summary.

Acceptance: repeated word reviews are not presented as unique words, missing
measurements remain unknown, and later article edits do not erase an earlier
week's recorded change.

### Phase 3 Finance and responsive presentation

Add the existing financial totals for custom weekly dates, currency/dataset controls,
statement-match coverage, and responsive sections. Keep the page short, with
expanded lists available when requested.

Acceptance: weekly values reconcile with finance overview using identical filters;
transfers, linked documents, and matched imports do not inflate totals.

### Phase 4 Verification and maintenance notes

Test the combined report on desktop and phones with disposable fixtures. Document
the aggregation rules, historical coverage, source links, and section error behavior.

Required cases:

- Monday boundaries, year changes, current partial weeks, timezone changes, and
  both daylight-saving transitions.
- Repeated task completions, reopening, cancellation, archiving, deletion, child
  tasks, status changes through notes, and missing legacy activity.
- Recurring instances retain their own IDs; attention counts agree with planning
  visibility and do not double-count overlapping groups.
- Saved/unsaved practice, midnight sessions, repeated vocabulary, both activity
  types, and missing time/average measurements.
- Articles created and edited repeatedly, changed again in a later week, restored,
  archived, and temporary image drafts excluded from published counts.
- Income deposits, cash/debit/credit purchases, refunds in a later week, credit-card
  payments, savings transfers, adjustments, manual/import overlaps, partially matched
  statements, multiple currencies, and example datasets.
- Exact counts beyond the three-item previews, stable pagination, correct filtered
  links, one section failing, empty weeks, stale response cancellation, and narrow
  phone layouts.
- Anonymous/non-owner access, foreign source IDs, malformed dates, no private caching,
  and proof that report requests do not change source data.

Do not create example finance activity in production or backfill invented historical
work/practice values to make the report look complete.

## Deferred additions

Keep automatic delivery, inbox reminders to read the report, AI-written narratives,
PDF/email exports, budgets, forecasts, activity rankings, scores, saved weekly
snapshots, full calendar analytics, and new time tracking out of the first version.
The report should summarize and link to what already exists.
