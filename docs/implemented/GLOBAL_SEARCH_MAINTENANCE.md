# Global dashboard search

Implemented November 25, 2026. The [design plan](GLOBAL_SEARCH_PLAN.md) records
scope and decisions; this guide describes the delivered code.

## Using search

Select **Search dashboard** below the desktop sidebar heading, or the magnifying
glass inside the top-right **Quick actions** menu on a phone. Use Ctrl+K / Command+K
outside text editors and other dialogs. Search does not replace Dashboard Quick add.

The dialog searches Tasks, Projects, Knowledge, Calendar, Finance, People and
Japanese vocabulary. Empty input shows page shortcuts without querying the database.
Latin searches need two characters; a single kana/kanji is supported. Results have
context and optional archived/inactive, past, refund, recurrence or work-session
labels. Choose Include archived/inactive when needed. Arrow keys and Enter open
results through the same links and draft-discard confirmation as mouse clicks.

Each group shows up to three records. **See all** opens `/search?type=<group>` with
25 results per page, bounded at 200 pages. Search scope and paging do not change
saved filters in other modules. Current records can change between pages.

Query text lives only in the mounted application's memory. Reopening search or
returning through browser Back retains it, but **refreshing, opening a new tab or
copying the search URL does not carry the query**. Clear removes the query/results;
logout or rejected authorization removes private state. Results revalidate when
reopening. Opening search preserves the current page/draft and music-player instance.

## Structure

- `src/components/search/`: shared provider, triggers, native dialog, full-page
  content, keyboard handling, safe highlighting and abortable/debounced requests.
- `src/app/search/page.tsx`: owner-protected expanded results.
- `src/app/api/search/route.ts`: authenticated POST, streamed body-size cap and
  bounded validation, selected timezone and private responses.
- `src/lib/search/types.ts`: input/result contract and local navigation shortcuts.
- `src/lib/search/server.ts`: bounded adapter orchestration and canonical result
  destinations/date/amount formatting.
- `src/lib/search/adapters/`: parameter-bound PostgreSQL read queries. Static SQL
  composition never interpolates request values into SQL text.
- `PeopleManager.tsx` and Settings People page: `person=<owned ID>` fetches and
  highlights the correct person even outside the directory's current page.

On phones, `MobileQuickActions.tsx` groups notifications, Quick add and search
behind one top-right button, with staggered transitions and reduced-motion support.
The hidden action row is inert. Search close restores focus to that shared button.
Search trigger markers use explicit string attributes for stable server hydration.

No dependency, migration, new table, index, container or background worker is
required. The existing application and PostgreSQL perform searches.

## Record rules

Tasks include unarchived Done/Cancelled records. Deadlines and follow-ups remain
task metadata; saved work sessions remain distinct calendar results. The dialog
collapses matching saved recurring task/event occurrences by series, preferring
the next occurrence. Expanded results show the saved occurrences individually.
Search never calls recurrence-generation or write-capable list services. Annual
holidays/birthdays use existing bounded date helpers and valid occasion URLs.

Current non-removed task notes match their task; direct project notes match their
project. Task-note rollups are not indexed again as project notes. Knowledge
searches current title, summary, Markdown, tags and folder path, respecting archived
ancestor folders. Article links do not implicitly match all related records.

Finance returns one canonical monetary activity, including receipt/income metadata,
source, linked reimbursement person/saved name, account/category and statement
reference. Fully excluded duplicates are hidden; confirmed duplicate metadata can
match the retained target. Transfers return one outgoing leg with both accounts
and references from either leg. Refunds remain refunds. Amounts use the existing
decimal-safe formatter and currency, with excluded amounts removed. Statement
metadata has its own result; CSV rows, receipts and pay stubs are not extra expenses
or income results. Uploaded document contents are not searched.

Vocabulary searches English, Japanese, primary hiragana, every saved reading and
category without loading practice calculations or enumerating conjugated forms.

## Security, privacy and limits

The endpoint runs `requireOwner(request)` before reading a body or private data.
Primary records and owned related records are constrained by the server's existing
owner policy; the client cannot specify an owner. Shared activity/vocabulary
categories follow their existing global schema. Destination APIs/pages independently
retain their authorization.

Responses use `Cache-Control: private, no-store`; the existing service worker does
not cache pages or APIs. Search text is sent only in POST JSON, never URLs, local or
session storage, page titles or analytics. Highlighting uses React text segments,
not HTML. Internal links are built from known entity kinds and database IDs.

Input is capped at 4,096 bytes and 120 Unicode characters, validated against fixed
scope/view enums. Wildcard characters are literal. Case/Unicode normalization,
substring and PostgreSQL `simple` text search are supported; accent removal,
romaji conversion, kana/width folding and typo tolerance are not promised.

At most three adapters run concurrently. Each uses a database-enforced read-only
transaction, 1,500 ms SQL statement timeout, 2,400 ms transaction timeout and
1,200 ms pool-acquisition timeout. One failed group leaves other groups available;
all failed groups produce a complete-failure state. Retries preserve input and
repeat the current request. Closing or superseding a request aborts its browser
fetch; a query already received by PostgreSQL can finish within its server limits.
Snippets are capped at 220 characters and projections contain only result metadata.

The implementation does not log queries, result contents or Prisma exceptions;
the shared Prisma client already disables query logging. Local production-container
logs contained zero synthetic search markers during verification. Disposable
PostgreSQL settings were `log_statement=none`, `log_min_duration_statement=-1`,
`log_min_error_statement=error`, `log_parameter_max_length_on_error=0`.
**Production NAS proxy/APM/database logging was not inspected.** Keep request bodies
and SQL bind parameters out of those logs, especially when enabling diagnostics.

## Verification performed

Tests use synthetic fixtures and a disposable database, never production records.

- Search unit tests: four passed, covering input/body limits, Japanese queries,
  canonical references, owner denial before body/database access, group failures
  and the concurrency/read-only contract.
- PostgreSQL integration: passed across all seven groups, ownership of records and
  joined data, removed notes, archived ancestors/inactive people, exact references,
  literal `%`, multiple readings/one-character Japanese, valid holiday/leap-birthday
  URLs, display timezone, financial deduplication, reimbursement identities and
  deterministic bounded paging. Before/after snapshots remained equal; real SQL
  runs inside read-only transactions.
- Dataset check: 1,000 extra tasks and 60 approximately 8 KB Knowledge bodies.
  All-group service calls took 77–78 ms; the long-body page took 46 ms; task SQL
  `EXPLAIN (ANALYZE, BUFFERS)` execution was about 78 ms. A local production image
  on the isolated database returned all seven groups in 91, 89 and 86 ms after
  warm-up. These are local measurements, not NAS latency guarantees. No additional
  search indexes were justified by this baseline; profile again as data grows.
- Production HTTP: anonymous 401 and non-owner 403, owner 200, private/no-store,
  Knowledge body matching and protected expanded-page rendering passed.
- Chromium browser: desktop 1440×1000 and phone 390×844 passed, including IME,
  rapid-query cancellation, partial/complete failure, retry, keyboard links,
  Escape/outside close, focus restoration/trapping, smaller viewport, pagination,
  People focus-by-ID, authorization loss, safe snippets, no horizontal overflow,
  private query omission from URLs/storage, cancelled/confirmed unsaved-form
  navigation and preserved music-player instance.
- Mobile actions follow-up: fresh SSR produced no hydration warnings; three
  actions, reduced-motion styling, notification preview and modal focus passed.
  Quick add saved through all five creation flows at 1440, 390 and 320 pixel widths.
- TypeScript, changed-file ESLint and the production Docker build passed.
- The related regression run passed 32 of 33 tests. One existing authentication
  test fails because it requires `requireOwner()` as the first statement in every
  API, including `/api/email/process`, which uses `authorizedEmailWorker()` with a
  worker token. Search-specific owner checks passed; this task did not alter the
  email worker or relax its authentication.

Physical iPhone/PWA keyboard behavior, VoiceOver/other screen readers, production
NAS performance and proxy/APM logging still need deployment/device verification.
The browser test simulates a phone viewport and verifies player identity; it does
not claim uninterrupted real YouTube playback in an iPhone background app.

## Running checks

From the repository in an environment with installed/generated dependencies:

```bash
node --test tests/global-search.test.mjs
npx tsc --noEmit
npx eslint src/lib/search src/components/search src/app/search src/app/api/search
```

Use the existing disposable work-test Compose project after applying migrations
there. Never point these fixture tests at development or production data:

```bash
docker compose -p dashboard-recurring-work -f docker-compose.work-test.yml run --rm \
  -e RUN_GLOBAL_SEARCH_DB_TEST=1 --entrypoint node runner \
  --test tests/global-search.integration.mjs
```

The test additionally requires `WORK_MANAGEMENT_DISPOSABLE=1` and a `work-db` host,
cleans up its own synthetic records and accepts an optional
`RUN_SEARCH_PRODUCTION_URL=http://dashboard-search-production-check:3000` only for
an isolated production container on that same test network, using the disposable
Compose credentials/secret. It never starts a production worker or sends email.

Browser tests need Playwright/Chromium available outside application dependencies,
a running local development app at `http://localhost:3000` and its local auth
secret. They mock domain APIs; they do not submit records:

```bash
RUN_GLOBAL_SEARCH_BROWSER_TEST=1 node --test tests/global-search.browser.mjs
```

Re-run ownership/canonical-result tests when schemas, activity links, recurrence
semantics or archive rules change. Recheck query plans and warm production timings
before adding indexes or increasing limits. Keep original record editors and
module filters separate from search.
