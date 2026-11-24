# Weekly report maintenance

The owner-only **Weekly report** page at `/weekly-report` summarizes recorded work,
Japanese practice, Knowledge changes, and finance. It is an on-demand read view;
there is no report table or extra container. The existing notification worker
announces completed weeks and can wake the shared email outbox. Optional one-page
PDF email uses pdf-lib and Resend; see [Email maintenance](EMAIL_MAINTENANCE.md).

## Record and date rules

Weeks start Monday in the saved dashboard timezone. The start is inclusive and
next Monday is exclusive; local calendar boundaries are converted to UTC before
querying timestamps. Only completed weeks are selectable, defaulting to the previous
Monday–Sunday week. The API rejects current/future weeks. Timestamp queries stop at
the following Monday and financial dates at Sunday. No currencies are converted or added
together. The page always requests CAD and all data, with no currency/dataset
selectors or top-right refresh button. Errors still offer Retry. The API retains
explicit validated filters for internal/detail consumers; its defaults are CAD/all.

The page has four visual summary cards: Work, Japanese practice, Knowledge, and
Finance. There are no individual record/session lists or current planning card.
Existing API detail readers, including current attention, remain available for
compatibility but do not appear in the weekly overview. Current planning belongs
in My Work rather than a completed week's retrospective.

Historical work counts distinct retained task identities with COMPLETED, REOPENED,
or CANCELLED activity in the selected week. Notes that change status already
produce canonical task activity; project note copies are not separate completions.
Archived tasks remain in historical counts. Deleted sources keep their retained
reference and have no detail link. Headline completions describe recorded activity,
not the task's current status. Older activity coverage is not reconstructed.

Japanese totals use saved Practice rows and their finish-date convention. Reviews
are repeated word encounters, not unique vocabulary. Durations and measured practice
impact remain unknown when absent; mixed coverage shows a partial indicator. Impact
is the sum of saved session average changes, not net vocabulary-list growth.

Knowledge creation uses article creation dates. Existing-article changes use revision
timestamps and the last applicable revision title/type. Multiple revisions count
once, and newly created articles are excluded from the existing-articles-changed
count. No article body or practice word-result JSON is loaded for these summaries.

Finance uses the same calculation as the overview: canonical movements, duplicate
exclusions, deposits rather than gross earnings, net expenses after refunds, and
cash-flow adjustments. Owned-account transfers are excluded from income/expenses.
Receipts and pay stubs never create extra report amounts. Statement-match coverage
uses canonical transaction/import status and does not depend on document presence.

## Code structure

- `src/lib/weekly-report/calendar.ts`: shared calendar-day arithmetic.
- `period.ts`: validated week/currency/dataset, timezone boundaries, and cursors.
- `work.ts`: distinct task history and current planning/project readers.
- `learning.ts`: saved practice aggregation and Knowledge revision readers.
- `finance.ts`: weekly custom-date filters and canonical finance reuse.
- `server.ts`: independent section snapshots and bounded detail dispatch.
- `http.ts`: timezone context, no-store responses, and safe errors.
- `src/app/api/weekly-report/route.ts`: summary API, guarded before input parsing.
- `src/app/api/weekly-report/items/route.ts`: guarded expanded-list API.
- `src/components/weekly-report/WeeklyReportView.tsx`: responsive cards, controls,
  independent errors, section retry, and stale-summary request cancellation.
- `src/app/weekly-report/page.tsx`: protected page and Suspense boundary.
- `src/components/SideMenu.tsx`: the navigation entry.

Each section runs in a read snapshot, with independent availability. The combined
report is not a single cross-module historical database snapshot. Current records
can be corrected between requests, and older reports recalculate accordingly.

## Pagination and filters

The page displays headline counts and result bars, without preview rows or View all
controls. Japanese summaries no longer query individual session previews. Other
API summary lists retain at most three preview rows for compatibility. Detail requests return at most
20 more rows. Cursors bind the section, week, currency, dataset, timezone, offset,
and captured time. Invalid/mismatched cursors are rejected; after 24 hours the
user must refresh before loading more. Ordering is deterministic. Concurrent source
edits can change a later result; the report does not claim immutable pagination.

The main client cancels stale requests on filter/timezone changes. Controls are
briefly disabled during route transitions so rapid week/currency changes do not
replace one another with old URL values. A failed section shows Retry rather than
zero totals; the other cards remain available. The report does not continuously poll.

The All Work Done filter cannot reproduce recorded completions for a past week.
The headline shows completion activity rather than current task status. For
individual practice sessions, use Japanese Statistics and practice history.

The finance link carries the identical custom dates, CAD currency, and all dataset. The
existing `buildOverview` and `financeReport` now accept an optional internal
`recentLimit`, defaulting to the previous eight rows. Weekly reporting requests all
compact movement rows in its selected weekly range internally so unmatched totals
and pagination are not accidentally limited to eight. Only bounded previews/details
are returned to the browser. No public finance API exposes that limit parameter.

The canonical finance reader still loads broad source datasets once per request,
including related matches needed across periods. Avoid multiplying this read by
currency. If data volume warrants optimization, preserve all connected matching
records and compare results against the finance overview before changing the query.

## Security and operation

Both APIs call `requireOwner` first and use the permanent database-owner mapping.
Every source and history join is owner-scoped. Private no-store responses, safe
errors, and existing authentication remain in force. No report request acknowledges
notifications, generates recurring work, saves progress snapshots, or changes records.
No document content or financial values are logged.

Normal whole-database backups already contain all report inputs. There is no
report-specific restore process, retention task, storage volume, or deployment
migration. Existing real data is preserved. No production deployment was performed
as part of this implementation.

## Verification

Executed checks:

- All **195 unit tests passed**, including DST weeks of 167/169 hours, Monday/year
  boundaries, current-week cutoff, invalid/future weeks, currency/dataset validation,
  cursor binding, and authentication before service access.
- The rollback-only disposable-database integration passed: repeated completions,
  reopening, deletion, child tasks, foreign histories, overlapping attention reasons,
  archived/closed tasks, project targets, missing practice measurements, revision-based
  article titles, and exact finance reconciliation.
- Finance fixtures included net deposits with supporting income records, attached
  receipts, excluded manual/import duplicates, refunds, adjustments, transfers,
  a separate USD account, and a saved statement with both matched/unmatched rows.
- A write-blocking database proxy detected zero report writes. Supporting Knowledge
  body text was absent from the response. A simulated finance failure left work
  results available and did not expose the internal error.
- Desktop and 390/320-pixel phone browser flows passed: real anonymous/non-owner API
  rejection, invalid parameters, detail error/retry, week/currency/dataset controls,
  isolated section recovery, and no horizontal page overflow. Browser data was mocked.
- Production Docker build and strict TypeScript validation passed. Targeted ESLint
  completed without warnings/errors. The final production image was rebuilt after
  the filter-transition refinement.
- The development owner summary API returned HTTP 200 with all five sections available.

No financial activity or example records were inserted into the development or
production databases for these checks. Database fixtures ran only on `work-db` and
were rolled back. The report is based on available history, not a frozen audit or
proof that all personal financial activity has been recorded.

To repeat checks, use the existing development dependencies and disposable Compose
setup. Never point integration fixtures at production:

```bash
node --test tests/*.test.mjs
RUN_WEEKLY_REPORT_DB_TEST=1 WORK_MANAGEMENT_DISPOSABLE=1 \
  node --test tests/weekly-report.integration.mjs
RUN_WEEKLY_REPORT_BROWSER_TEST=1 node --test tests/weekly-report.browser.mjs
```

The integration test requires database host `work-db`; the browser fixture uses
localhost development authentication and intercepts data requests. Phone acceptance
in an installed PWA can also be checked manually after the usual deployment, but
this report does not require push permission or a new phone service.

## Development preview data

The example script creates data in the current week. With completed-week reports,
these examples become visible after that week ends; this UI change does not move
or alter their dates. The explicitly requested examples are created by
`scripts/seed-weekly-report-examples.mjs`. It requires development mode,
`ALLOW_WEEKLY_REPORT_EXAMPLES=1`, and push disabled:

```bash
docker compose -f docker-compose.dev.yml exec -T \
  -e ALLOW_WEEKLY_REPORT_EXAMPLES=1 dashboard node scripts/seed-weekly-report-examples.mjs
```

It adds labeled example completions/reopenings/cancellations, current attention and
project targets, three vocabulary and two kanji sessions, three new articles and
two illustrative edits to newly created older example articles. Practice history
uses existing word snapshots without changing actual vocabulary statuses, review
timers, progress snapshots, user XP, or gold. Existing tasks/articles are not edited.

Fictional finance records use dedicated example accounts and merge into the
existing Examples manifest. Choose **Examples** or **All** in the finance Data
selector to include them; Personal remains unaffected. They include employment
income with deductions, expenses, a refund, a savings transfer, and statement-matched
versus unmatched records. No fake original documents or push deliveries are created.

All inserts and the manifest update are one transaction. A stable per-week receipt
makes reruns skip existing examples, preserving any subsequent manual edits. The
week is calculated from the saved dashboard timezone. This is a manual development
seed, not a scheduled or production operation.

## Completed-week overview revision

The revised client shows task totals, practice statistics and result bars, article
counts, and recorded cash flow. Practice impact uses percentage points (pp); its
meaning and missing-measurement indicators are unchanged. Reopened/cancelled work
are separate counts, not subtractions from historical completions. Finance retains an unmatched count and a link to the same weekly range, using
CAD/all data.

Executed verification for this revision:

- Four weekly-report unit tests passed in the development container, including DST,
  completed-week rejection, local Monday rollover and API authorization.
- Browser checks passed at 1440, 390 and 320 pixels: summary-only content, completed
  week navigation, finance filters, independent error recovery and no horizontal
  page overflow. No item-detail requests were issued.
- ESLint for changed report code and the full TypeScript no-emit check passed.

No database migration or production data change was made. Earlier verification
entries describe the original implementation scope; the database integration
suite was not rerun for this presentation/date-selection revision.


## Weekly availability notification

Migration `20261124120000_weekly_report_notifications` adds the enabled-by-default
`NotificationSettings.weeklyReports` preference and extends the existing inbox and
push-delivery source constraints. It preserves existing reminders and preferences.
Deploy it before restarting the application/worker on the new code. Development
received this migration; production was not deployed by this change.

`src/lib/notifications/weekly-report.mjs` describes the most recently completed
local Monday–Sunday week. It uses that week's Monday as its stable source ID and
links to `/weekly-report?week=YYYY-MM-DD`. The report itself remains an on-demand
read; notification creation does not calculate or freeze its totals.

The existing worker creates an inbox entry on Monday at the configured **Time for
date-only items** (09:00 by default), in the dashboard timezone. The normal lead-time
setting does not move this reminder into the unfinished week. A **Weekly report
ready** category toggle controls both inbox and push. Push additionally requires
global opt-in, configured VAPID keys and an enrolled device. Inbox creation still
works when push is disabled. No amounts or financial details appear in the payload.

Existing retry leases, device/generation uniqueness, snoozing, privacy settings,
retention and owner guards apply. Old report links remain resolvable. Enabling a
category/device does not replay earlier pushes. Existing seven-day inbox catch-up
and 15-minute push grace apply: after longer downtime the latest reminder can
appear in the inbox without a late push. No years of past weekly alerts are created.

Verification executed for this change:

- 18 unit tests passed across report periods, weekly reminder sources, inbox and
  push rules, including local week rollover and daylight-saving behavior.
- 14 rollback-only integration tests passed on the isolated work-test database,
  including the new weekly reminder's delivery, deduplication, snooze, opt-out,
  next-week creation and owner scoping. Sends used a fake sender.
- The new migration applied successfully on the disposable database; a second
  deploy found no pending migrations. It also applied successfully in development.
- Report browser checks passed at 1440, 390 and 320 pixels with CAD/all data, no
  selectors/refresh button, completed-week navigation and section error recovery.
- Prisma validation, ESLint and TypeScript no-emit checks passed.

The later optional PDF/Resend implementation is documented below.


## One-page PDF and shared email

See [Email maintenance](EMAIL_MAINTENANCE.md) for production `.env` setup, sender
verification, shared API contracts, scheduling and failure recovery. The dedicated
`pdf.mjs` renderer consumes the same report summary with CAD/all data. It refuses
an unavailable Work, Knowledge, Japanese or Finance section instead of emailing
misleading zeros. The protected `/api/weekly-report/pdf` endpoint also works without
enabling email; it always returns a private attachment, not a public file URL.

Migration `20261124140000_shared_email_delivery` adds a shared `EmailDelivery`
outbox. All other email infrastructure is template independent. The existing
worker calls `/api/email/process` with its separate worker secret; Next.js owns
report calculation and rendering, so no TypeScript runtime or new container is
needed. Development Compose has a separate opt-in and remains off by default.

Executed verification for the email implementation:

- 23 unit tests passed across email transport/worker authentication, PDF layout,
  completed-week boundaries, inbox/push behavior and API authorization. The final
  email subset was rerun after adding Resend concurrent-request handling.
- Two rollback-only email database tests passed with fake senders: stable retries,
  deduplication, distinct feature templates, bounded uncertain outcomes, retention,
  owner scoping, weekly scheduling and suppression of incomplete reports.
- A live development HTTP test passed: anonymous/non-owner rejection, worker
  authentication rejection, malformed-week handling, private owner PDF download,
  and delivery status without message payloads.
- PDF.js rendered the sample PDF and verified its visible text/amounts; the result
  was inspected visually and is exactly one A4 page.
- The new migration applied on the disposable and development databases. Schema
  validation, ESLint, TypeScript no-emit and the production Docker build passed.

No real Resend email was sent, no credentials were created/rotated, and production
was not deployed. Sender DNS verification and actual mailbox arrival require the
owner's Resend configuration.
