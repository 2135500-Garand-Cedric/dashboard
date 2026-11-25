# Global dashboard search plan

Status: **implemented November 25, 2026**.

All seven result groups, navigation, People focus, current-note matching and
verification are implemented. See [maintenance and verification](GLOBAL_SEARCH_MAINTENANCE.md)
for the delivered behavior, test commands and remaining device/deployment checks.
The design sections below retain the original planning language. The phone
placement has since changed to the shared top-right Quick actions menu; desktop
placement is unchanged.

Reviewed November 25, 2026 against the current application. This develops
[improvement idea 1: Search the whole dashboard from one place](../planned/DASHBOARD_IMPROVEMENT_IDEAS.md).
Implementation adds no database schema, migration, dependency or search worker.
Search reads existing records without changing them.

## 1. Concept and recommendation

Add one **Search dashboard** control that is available throughout the signed-in
application. It finds existing records across modules and takes you to the right
place to read or update them.

For example:

- `VPN` finds a troubleshooting article, an incident task, and a project whose
  own searchable fields mention VPN.
- `Dad` finds the People entry and expenses or repayments linked to that person.
- `TASK-0012` opens the matching task near the top of the results.
- `学校`, `がっこう`, or `school` finds the vocabulary entry through its Japanese,
  reading, or English fields.
- `Christmas` finds the selected holiday and matching tasks or Knowledge articles.

Each result needs a recognizable title, a module/type icon, useful context, and a
short explanation of the match. Opening search, typing, and selecting filters
must remain read-only. Creation and editing continue through the existing forms.

My recommendation is to start with tasks, projects, and Knowledge, then expand
through the steps below. The finished feature should cover the dashboard's main
records, including People, Japanese vocabulary, calendar records, and finance.
The first delivery should clearly identify which modules are searchable.

## 2. Placement

### Desktop

Put a full-width **Search dashboard** button directly below the sidebar's
**Dashboard Menu** header and above the navigation links. Add a magnifying-glass
icon and a small `Ctrl K` / `⌘ K` shortcut hint.

A separate row fits the existing 256-pixel sidebar without squeezing its title
and notification bell. It also avoids adding another header above every page or
reducing the main dashboard's bounded tile area.

Support `Ctrl+K` on Windows/Linux and `⌘+K` on macOS. Ignore the shortcut during
IME composition, when another modal is open, and when an editable control owns
that shortcut, such as a Knowledge editor inserting a link. The visible button
remains the reliable way to open search. Do not use an unmodified `/` shortcut
that could interrupt typing Japanese or writing notes.

### Phone and installed PWA

Add a search icon to the existing shared mobile controls, between the navigation
button and notification bell. Give all three controls at least a 44 × 44-pixel
hit area, respect the development banner and safe-area insets, and keep page
headings clear. Do not add a bottom floating button over page actions.

If the mobile navigation drawer is open, selecting Search closes the drawer
before opening search. Search and the notification preview should not remain
open over each other.

### Relationship to Quick add

Global search is available on every owner page. The existing **Quick add** button
stays beside the main dashboard title, with its approved dashboard-only scope.
Keep the two controls distinct and reuse their existing destination pages.

## 3. Search experience

### Opening and typing

On desktop, open a centered dialog approximately 720 pixels wide, bounded by the
viewport. On phones, use a near-full-screen sheet/dialog that adapts to the visual
viewport and on-screen keyboard.

Keep the input and close button above an internally scrollable results area.
Move focus into the input; support Escape, a close button, outside click where
appropriate, keyboard navigation, and focus restoration to the trigger. Reuse
the established modal behavior and styles without depending on task-detail
loading readiness. Avoid nested search and editing dialogs.

Before typing, show a compact **Go to page** list: My Work, Calendar, Knowledge,
Finance, Japanese vocabulary, People, and Settings. These are local navigation
shortcuts and need no database request.

Debounce searches by about 250 milliseconds. Allow a single Japanese/CJK
character; require two characters for ordinary Latin-text browsing. Exact record
references remain supported. Validate a maximum of 120 Unicode characters and
show a useful message for unsupported input.

Cancel or supersede earlier requests when input changes. A slow response for
`VP` must never replace a newer response for `VPN`. During Japanese IME
composition, wait for composition to finish before searching.

### Results

Group results under **Tasks**, **Projects**, **Knowledge**, **Calendar**,
**Finance**, **People**, and **Japanese vocabulary** as those adapters are added.
Show up to three results per group in the dialog, with a **See all** action for
that group. Fetch one extra row to determine whether more exist; exact counts
are optional and should not require expensive scans on every keystroke.

A result row should contain:

- A title and icon; recognizable activity/category colors where useful.
- A concise subtitle: project/reference/status, article folder/type, event date,
  financial account/amount/currency, or vocabulary readings/category.
- One plain-text snippet or match reason when the title alone does not explain it.
- An explicit Archived, Inactive, Past, Refund, or Work session label where relevant.

Use genuine links and highlight matched text safely. Do not render snippets as
HTML or expand entire records, notes, or documents in the dialog.

**See all** opens a protected `/search` page using the same search service, with a
selected result group and bounded pagination, initially 25 results per page.
Keep filtering and pagination inside this search feature; selecting a global
result must not silently replace saved All Work, Calendar, or Finance filters.

### Navigation and unsaved work

Use the existing record detail pages. Global search does not need another task
side panel, financial editor, or Knowledge preview implementation.

The existing draft guard listens to real link clicks. Keyboard activation must
use that same guarded link path, not bypass it with an unconditional
`router.push()`. If navigation is cancelled, keep search open and preserve the
underlying form. Close search only after navigation succeeds. Opening/closing
search alone must not unmount the current page or reset its draft.

Do not assume every detail page accepts `returnTo=/search`: the task page
currently validates that parameter against `/todos`. Initially, existing Back
buttons retain their module behavior; browser Back and reopening search provide
return paths. Any new explicit return-to-search links need deliberate internal
URL validation in the affected detail pages.

## 4. Search coverage and canonical destinations

| Area | Searchable content | Result and destination |
| --- | --- | --- |
| Tasks | Title, description, `TASK-` reference; later current notes and useful task text | One task result at `/todos/[id]`, with status, project and deadline context |
| Projects | Name, objective, `PROJECT-` reference; later current project notes/stage or milestone names | `/projects/[id]`, with a match reason for nested content |
| Knowledge | Title, summary, Markdown body, tags and folder context | `/knowledge/[id]`; use current published content |
| Calendar events/work sessions | Title and available descriptive text; linked task/project context | `/events/[id]`, labeled Event or Work session |
| Holidays/birthdays | Selected holiday name/source label or saved birthday name | Existing occasion page with a valid occurrence date, using `occasionHref()` |
| Finance | Description, notes, merchant/counterparty metadata, income source, account/category, relevant statement reference, linked reimbursement person | One canonical activity at the destination returned by `activityHref()` |
| Statement imports | Saved filename, account and statement period; available identifying metadata | `/finance/imports/[id]`, marked Draft or Saved |
| People | Name, organization, email, phone and notes | `/settings/people?person=[id]`, with the focused-person behavior described below |
| Japanese vocabulary | English, Japanese, primary hiragana and all additional readings; category context | `/japanese/vocabulary/[id]` |
| Navigation/settings | A small curated list of page names and aliases | Existing pages such as `/settings/people` or `/weekly-report` |

Apply ownership checks to both the primary record and joined relationships.
Matching a person or category must never pull another owner's related records
into the results.

### People destinations

People currently has a directory page rather than individual profile pages.
Add explicit `person=<id>` focus support to that existing page: fetch the owned
person, ensure their card is visible even if it is outside the current directory
page, highlight it, and scroll it into view. Retain the existing Edit action.
Do not depend on a name-based filter, since names can repeat or change. Missing
or inaccessible IDs should produce a safe not-found state.

### Tasks, dates and recurring records

Preserve the application's distinctions:

- A task deadline or follow-up is metadata on a task, not a separate event result.
- A project target or milestone match can open the project with a match reason.
- A work session is a real scheduled calendar record and may appear separately
  from its linked task, clearly labeled.
- Default task results include unarchived Done and Cancelled tasks. Here,
  **active means not archived**, not only unfinished work.
- Collapse repetitive occurrences by recurrence series in the dialog, with the
  next relevant saved occurrence and an indication that it repeats. Expanded
  results can show individual saved occurrences with their dates.
- Search must not materialize more recurring tasks/events. The current task
  search/list and calendar-feed services can call `ensureOccurrences()`; extract
  their read-only predicates instead of calling those services blindly.
- Query saved holiday/birthday selections and compute a bounded next valid date
  through the existing annual-date helpers. Do not create Event rows for them or
  assume that every holiday has a fixed month/day.

Persisted past events remain findable and are labeled Past. Global search should
not inherit the Calendar sidebar's upcoming-only restriction. Do not generate an
unlimited history of virtual annual or recurring occurrences to search it.

### Finance and reimbursements

Use `FinancialTransaction` as the monetary activity identity. Receipts, income
metadata, statement matches, and reimbursements can explain a match, but must not
turn the same activity into several result rows.

- Show an expense with its receipt metadata once; show an income deposit with its
  income/pay-stub metadata once.
- Show one economic transfer, including both account names, rather than both legs.
- Refunds/reimbursements stay labeled as incoming refunds, not employment income.
- Search both the linked People name and the saved reimbursement-name snapshot.
  Opening a matching expense/refund must keep its current reimbursement workflow.
- Retain existing rules for hidden fully excluded duplicates and counted amounts.
  Reuse decimal-safe formatting and always display currency. Do not add totals
  across unrelated search results or infer account balances from them.
- Import matches and CSV lines do not create extra financial activity results.
  An import itself can appear once as a statement metadata result.
- Receipt/pay-stub contents and uploaded PDF/image bytes are outside this scope.
  Opening their normal parent record preserves existing private file access.

### Notes and Knowledge organization

Add current, non-removed task/project notes as a later enrichment. A matching task
note returns its task once, with a snippet. The project's combined task-note feed
must not cause that same note to be indexed again as a separate project note.
Direct project notes return the project. Revision history and removed notes are
excluded from ordinary search.

Knowledge archived-folder inheritance matters: an article inside an archived
ancestor folder is archived for this purpose even if its own `archivedAt` is null.
Search across all current folders, independently of the open Knowledge folder.
Article links do not make every related record a match automatically; each
result must match its own fields or an explicitly supported owned relationship.

### Vocabulary

Query only the required vocabulary/category fields. The existing vocabulary API
loads practice statistics and verb-form relationships for its own screens; the
search adapter should not invoke that full calculation on every keystroke.

Return the base vocabulary once, including all saved readings. If conjugated-form
matching is added, resolve a matched form to its parent vocabulary and label the
matched form instead of listing every conjugation as a separate word.

## 5. Scope, ranking and matching rules

Default to all enabled groups, current published records, unarchived work and
active people. Provide an **Include archived/inactive** option. Financial records
do not gain an artificial archive status, and old expenses stay searchable.

Use deterministic ranking within each group:

1. Exact task/project reference or exact title/name/word.
2. Title/name prefix, then title/name substring.
3. Structured matches such as a person's name, category or tag.
4. Summary/body/current-note matches.
5. A relevant date or updated time, then a stable ID, to break ties.

Do not compare raw Knowledge full-text scores directly with task substring
scores. Keep groups predictable; optionally surface an exact reference match
above the groups. Deduplicate with `(canonical kind, canonical ID)` and combine
match reasons for the same result.

Begin with Unicode-normalized, case-insensitive matching, literal substring
fallbacks, and the existing PostgreSQL `simple` text-search approach for prose.
Search all Japanese reading values explicitly: Western word-tokenization rules
alone are insufficient for kanji/kana and short technical fragments.

Parameter binding is mandatory. If using LIKE/ILIKE, escape literal `%`, `_`, and
backslashes deliberately; bound parameters alone do not remove wildcard behavior.
Accent-insensitive matching, kana/width folding, typo tolerance and romaji search
need separate decisions/tests and are not assumed to work in the initial release.

## 6. Proposed implementation structure

The following paths are proposed additions, not files already implemented:

| Component | Responsibility |
| --- | --- |
| `src/components/search/SearchProvider.tsx` | Shared open state, current in-memory query/scope and shortcut handling |
| `src/components/search/SearchTrigger.tsx` | Desktop and mobile triggers |
| `src/components/search/SearchDialog.tsx` | Accessible dialog, loading/error states and grouped results |
| `src/components/search/SearchResults.tsx` | Shared result rows/group presentation for dialog and full page |
| `src/app/search/page.tsx` | Protected expanded results page |
| `src/app/api/search/route.ts` | Owner authorization, bounded request validation and private responses |
| `src/lib/search/types.ts` | Result kinds, validated scopes and response contract |
| `src/lib/search/server.ts` | Bounded orchestration, deduplication and result assembly |
| `src/lib/search/adapters/` | Small read-only queries and mapping for each domain |

Mount the provider/dialog once in `AppShell.tsx`, under the existing settings and
snackbar providers. Add the triggers through `SideMenu.tsx` and its shared mobile
controls. Do not remount the app shell, music player, or current page to search.

Reuse the Prisma client, owner policy, selected timezone, date/money formatters,
canonical link helpers and existing dialog patterns. Extract reusable query
predicates where practical, while keeping module-specific list filters and
response formats intact. A shared search endpoint should call server functions
directly, not make loopback HTTP requests to seven other API endpoints.

Each result should carry a stable key, kind, canonical ID, title, safe internal
href, plain-text snippet/match reason, and limited display metadata. Return
archived/inactive labels and pagination information explicitly. Send only the
fields needed by the UI, not entire ORM records or attachment metadata blobs.

The dialog requests all enabled groups with small per-group limits. Expanded
results query one selected group at a time, with a stable ordering and validated
pagination. If cursors are used, bind them to the query/scope and validate their
shape; changing the query resets pagination. Results reflect current records,
not an immutable historical snapshot across multiple pages.

## 7. Privacy, authorization and state

Use **POST `/api/search`** with a small JSON body containing the query, validated
scope, archived flag and pagination. Keep query text out of the request URL.
The endpoint must call `requireOwner(request)` before parsing input or reading
records and derive ownership from `OWNER_DATABASE_USER_ID`, never a client ID or
an unguarded assumption about user 1.

Use `Cache-Control: private, no-store`; keep the PWA service worker's current
policy of not caching authenticated APIs/pages. Cap body bytes, query length,
page size, database work and returned snippet lengths. Validate result types and
sort options against server-owned enums.

Keep query/results in provider memory only, following the existing memory-only
view-state convention. Reopening search or using browser Back can reuse that
state while the authenticated shell remains mounted; revalidate results before
relying on them. Clear it on explicit Clear, logout, loss of authorization or
owner change. Abort in-flight requests when the overlay closes.

The expanded page uses `/search` with optional non-sensitive type/scope flags.
Its query comes from the shared provider, not a URL parameter. A hard refresh or
new browser tab starts with an empty input; a copied search URL does not share
its query. Explain this behavior during implementation rather than silently
adding local storage or search-history persistence. Keep the page title static.

Do not log search terms, bodies, snippets, Prisma exception objects or financial
values. Verify proxy/APM/database logging as well: POST alone does not prevent a
configured logger from capturing a request body or SQL parameters. No search
analytics, persisted query history, or query strings in telemetry are needed.

Render snippets as text. Build highlighting from safe text segments; do not use
raw Markdown HTML, database-generated markup or `dangerouslySetInnerHTML`.
Construct internal result destinations from validated kinds/IDs. Destination
pages and document endpoints must still authorize independently.

## 8. Database, performance and hosting

Use the existing PostgreSQL database and Prisma. The initial implementation
needs no new container, hosted search subscription, AI service, or duplicated
search-record table. Costs stay within the existing server/database workload.

Start with selective projections, bounded results, existing owner indexes and
small domain queries. Reuse Knowledge's existing substring/full-text SQL ideas;
its current code already combines these approaches. Do not download every table
into the browser or calculate Japanese practice/report totals to find a title.

Limit concurrent adapters to a small number, initially three, to avoid exhausting
the shared Prisma pool. Set a bounded database execution budget. A client-side
AbortController stops stale UI updates but does not by itself guarantee that a
running PostgreSQL query was cancelled.

Measure realistic data volumes using query plans and timings, including misses,
one-character Japanese queries and long Knowledge bodies. Aim for results to
arrive within roughly one second after debounce on a warm production build, but
record actual latency rather than promise it before testing on the NAS.

If measurements justify indexes, add narrowly scoped migrations: suitable
full-text GIN expression indexes and/or `pg_trgm` indexes for substring fields.
Ensure the query expressions match their indexes. Short Japanese queries may
need their own bounded path; a trigram index does not make every one-character
query efficient. Check extension availability/permissions before relying on it.

Index migrations must preserve records and IDs. Review locks and deployment
behavior; concurrent index creation, if selected, needs a migration compatible
with its transaction restrictions. Start without a background indexing worker.
Reconsider a dedicated index only if measured dataset growth requires it.

## 9. Loading, failures and stale records

Use clear states: initial navigation shortcuts, searching, results, no matches,
partial failure, and complete failure. Preserve input and scope on retry.

If Finance fails while Knowledge succeeds, keep Knowledge results and mark the
Finance group **Unavailable — Retry**. Do not display **No matches** for a failed
group. Authorization failure is different: clear all private results immediately
and follow the application's sign-in/access-denied flow.

A deleted or archived record can disappear between search and opening it. The
destination must handle that safely, and reopening search must refresh results.
Do not retain search result bodies as permanent cached copies of deleted data.

## 10. Implementation order

1. **Search foundation:** provider, desktop/mobile triggers, shortcut handling,
   dialog, result contract, owner-protected POST API and static page shortcuts.
2. **First useful search:** tasks, projects and Knowledge; exact references,
   archive rules, snippets, grouped limits, expanded results and draft-safe links.
3. **People and Japanese:** directory focus-by-ID support, shared-contact matches,
   multiple readings, short Japanese queries and vocabulary detail navigation.
4. **Calendar and finance:** events/work sessions, selected annual occasions,
   canonical financial activities, import metadata and reimbursement-person links.
   Verify recurring-read behavior and financial deduplication before release.
5. **Current notes and polish:** parent-record note matches, responsive/keyboard
   improvements, performance measurements and only the indexes those justify.

Each step should be independently reviewable. Keep the feature marked partial
until the promised groups work; avoid empty headings suggesting an adapter is
already implemented. Do not bundle unrelated data-model cleanup or change local
module search behavior simply to introduce the global feature.

## 11. Verification and acceptance criteria

Before implementation is considered complete, verify:

- Owner authentication and denial of anonymous/non-owner API access before body
  parsing or database calls; cross-owner rows and joined records remain absent.
- Opening, typing, filtering, paging and closing leave row counts, revisions,
  recurrence occurrences, financial totals and practice status unchanged.
- Exact `TASK-`/`PROJECT-` references, partial titles, Knowledge body/tag matches,
  archived ancestor folders, inactive people, and unarchived completed tasks.
- Multiple kanji readings, one-character kanji, kana, English, IME composition,
  accented names and literal wildcard characters.
- One expense with receipt metadata, one income/deposit result, one transfer
  instead of two legs, refunds, fully excluded duplicates, and reimbursement
  contact/snapshot-name matches without extra activity rows.
- Holiday/birthday destinations carry valid occurrence dates; timed values use
  the selected timezone while date-only finance/annual dates do not shift.
- Fast typing cannot reveal stale results; group failures and 401/403 responses
  have the intended distinct behavior; pagination stays bounded and deterministic.
- Result snippets/highlights cannot execute HTML/script; URLs are internal;
  queries and private data are absent from logs and persistent browser storage.
- Desktop shortcut, arrow/Enter navigation, Escape/outside close, focus trapping,
  screen-reader labels, phone/PWA keyboard resizing and no horizontal overflow.
- Cancelled draft-discard prompts preserve both the current editor and search;
  successful navigation keeps music playing and uses existing detail pages.
- Query plans and warm production-build timings with realistic records, plus
  current local search, navigation, finance and recurrence regression checks.

The outcome should be simple: from any page, find the existing thing you remember
and open it confidently, without changing its data or needing to guess its module.
