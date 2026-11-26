# Finance module maintenance

## Structure and invariants

- `src/app/finance`: owner-protected App Router pages and Finance navigation.
- `src/app/api/finance`: authenticated route handlers. Every exported handler must call `requireOwner(request)` **before** reading input, querying data or accessing documents. Pages inherit `ProtectedLayout` through the Finance layout. This application intentionally supports one GitHub owner, with existing database data under user ID 1.
- `src/lib/finance`: pure validation/money rules; owner-scoped Prisma services; CSV parsing/imports; matching/allocation ledger; reporting; private file storage; CSV export serialization.
- `src/components/finance`: entry forms, history, statement matching, reports, shared document/camera controls and request/error helpers. `useHistoryFilters` retains **applied** transaction/receipt/income filters and page in the URL, including after opening a detail and going back. Unsaved draft fields do not change exported filters. Entry drafts and selected files are held only in memory until saved; refreshing or leaving a form can discard them. URL filters may be retained in browser history; avoid private notes in shared links.
- `prisma/schema.prisma` and additive migrations: financial records, supporting documents, imports, confirmed allocations and immutable matching audit events. Phase 8 changes no database schema.
- `scripts/finance-backup.mjs`: host-side combined database/finance/work-file backup and isolated restore verification using Docker/PostgreSQL 15.
- `tests/finance*`: unit, rollback-only database and browser coverage. Database tests require their explicit `RUN_FINANCE_*_DB_TEST=1` flags; live usability checks only read records. The canonical activity browser test writes fictional records only to the disposable port-3002 environment; read-only report/usability checks must not modify live records.

Keep monetary values as decimal strings at API/CSV boundaries. Database amounts are `Decimal(19,4)`; calculations use Prisma Decimal or integer ten-thousandths. Reports use `sign(amount) × (abs(amount) − excludedAmount)`, never original amounts alone. Documents and payroll metadata add no money movements. Transfers/card payments contribute neither income nor expenses; refunds reduce spending, reimbursements entered as income remain income, and adjustments are separate. Currencies must never be summed together. A partial or uncertain match must remain explicit. Gross/net payroll details and deposit cash are different views of the same underlying earnings.

Finance configuration is grouped under **Finance → Settings** (`/finance/settings`): financial accounts, expense categories, income source types, income sources, and deduction types. Management pages use `/finance/settings/accounts`, `/finance/settings/categories`, `/finance/settings/income-source-types`, `/finance/settings/income-sources`, and `/finance/settings/deduction-types`. Old account/category/combined-income settings redirect aliases have been removed; use the settings URLs directly. Accounts, categories, income sources and deduction types use centered create/edit dialogs; dismissing a dialog discards its unsaved draft. Successful saves update the list in place. Income, expense and transfer history filters start collapsed; expanding/collapsing preserves drafts and applied URL filters. An active-filter count remains visible when collapsed.

## Income, expenses and transfers

### Shared people

**Settings → People** (`/settings/people`) is the shared directory for task
requesters/affected people and expense reimbursements. Each person has a required
name and optional organization, email, phone and notes, plus active/inactive
status. People are owner-managed records, not application login accounts; saving
an email does not send mail or grant access. Management uses card tiles and
centered create/edit/deactivation dialogs. Deactivation preserves existing links
and prevents new assignments. Work and Finance Settings link to this same page.

The existing `WorkContact` model and `/api/work-contacts` handlers remain the shared
implementation, preserving task IDs and the task-details loading bundle. There
is no second finance contact table or duplicate CRUD service. Mutations retain
owner checks, revision conflicts and idempotency keys. The old `/todos/manage`
URL redirects to the canonical Settings page for saved bookmarks; its duplicate
contact manager was removed.

Migration `20261125120000_shared_people` adds the contact fields and links each
reimbursement plan to a contact ID. Unambiguous matching task contacts are reused
within the same owner; missing or ambiguous names get a separate directory entry
instead of guessing an identity. Original plan names remain snapshots even if a
directory name changes later. Amounts, expense/payment IDs, allocations and task
links remain intact. No automatic notifications are sent to people.

Shared-directory verification on 2026-11-25 passed: 10 finance unit tests,
14 database assertions/subtests across finance and task contacts, populated
migration rehearsal, and desktop/phone browser flows for People CRUD,
deactivation, directory selection, persistent headers, equal-height refund cards
and progress graphics. TypeScript, targeted ESLint and production Docker build
passed. Read-only development checks confirmed anonymous directory calls return
401 and the owner can read People and linked finance records. No production
release or real financial record edits were performed.

### Expense reimbursements

On desktop, open a saved expense's **Reimbursements** tab and choose **Track
reimbursement**. Phones show the section below the expense. Select a directory person and the
expected amount, which can cover all or part of the expense. Use **Add person**
for additional contributors. Add/edit tracking opens a centered modal with outside-click
dismissal; the person selector does not link away to People management. Their combined expected amounts cannot exceed the
expense. Each person's received/outstanding amounts are tracked independently.
Changing desktop tabs keeps unsaved expense fields mounted. The shared Expense
details header, record status, buttons and desktop tabs remain above both views;
the duplicate description heading and reload action are removed. Create incoming
repayments with **Refund / reimbursement** in Expenses. On the saved refund,
allocate amounts to expenses expecting repayment. One payment can cover multiple
expenses, and several payments can cover one expense. The accounts can differ,
but the currencies must match; no currency conversion is inferred. Unassigned
payment amounts are allowed, including payments received before expenses exist.

The expense detail and history cards distinguish awaiting, partial, and fully
reimbursed expenses. Details show expected, received, still owed, and your cost
so far (original expense less actual reimbursements). An expected repayment is
not money received. Editing or unlinking allocations updates this tracking only.
Allocation editing lives on the refund; unlinking is available on either record.
Reimbursement tracking remains editable after statement matching because it does
not change the bank facts. Linked amounts/currencies/types cannot be changed and
linked records cannot be deleted until reimbursement links/tracking are removed.
Notes continue to use the normal notes editor. Refund details and reimbursement
allocations use equal-height columns under one top bar on desktop and stack on
phones. Reimbursement progress uses an SVG ring with a received/expected ratio,
received amount, outstanding amount and current personal cost. Decimal money
stays exact; only a bounded percentage is converted for drawing. Reimbursement
errors appear only in the snackbar. The card has no manual reload/search or
record-payment shortcut. Deletion and unlink confirmations use centered native
dialogs with Escape/outside-click dismissal while idle.

`FinancialReimbursementPlan` stores one person/expected amount per row, with
multiple rows per expense and a unique expense/contact-ID pair. The person name
is retained as a historical snapshot; new plans require an active owned contact.
`FinancialReimbursement` links a refund payment to an expense with a positive
decimal amount, an explicit plan ID, and a unique plan/payment pair. Owner-scoped services in
`src/lib/finance/reimbursement-server.ts` validate both endpoints, enforce payment
and expense limits, and use a per-owner advisory lock plus retryable serializable
transactions. Stale edits/unlinks return 409. Restrictive foreign keys preserve
the links against accidental ledger deletion. The additive migration
`20261124170000_expense_reimbursements` creates only empty tracking tables; it does
not rewrite existing finance records. Migration
`20261125100000_multiple_reimbursement_people` assigns IDs to existing plans and
backfills every existing allocation's plan ID before requiring it. Existing
amounts, people and ledger IDs remain intact. Whole-database backups include both tables.

The authenticated `/api/finance/activities/[id]/reimbursements` endpoint provides
GET (details/search), PUT (expected repayment), POST (create/update allocation),
and DELETE (unlink, with If-Match). The dropdown lists outstanding expense/person
pairs in the payment's currency; it does not silently hide older unpaid items
behind a search limit. The UI has no expense search field.

Expense/income currencies are derived from the selected payment/deposit account,
including prefilled forms. Their currency selectors have been removed. Income's
deposit-account selector sits beside its pay date. Refund currency also follows
its account, without a separate currency field. Server-side account/currency
validation continues to enforce consistency.

Statement matching still uses the complete signed bank payment and its original
date/account/currency. Allocations create no financial transactions or duplicate
exclusions. Reports retain their cash-date behavior: expenses on payment dates,
refunds on receipt dates. Refunds reduce expenses rather than increasing income.
The refund's selected category still controls its report category; allocations
do not redistribute category/merchant/account charts or rewrite earlier months.
For rent repayments select Rent on the refund. Reimbursements already entered as
income are not converted automatically and continue to count as income.

Verification for this workflow:

```sh
node --test tests/finance-reimbursements.test.mjs tests/finance-transactions.test.mjs tests/finance-reporting.test.mjs
RUN_REIMBURSEMENTS_DB_TEST=1 RUN_FINANCE_ACTIVITY_DB_TEST=1 RUN_WORK_MANAGEMENT_DB_TEST=1 node --test --test-concurrency=1 tests/finance-reimbursements.integration.mjs tests/finance-activities.integration.mjs tests/work-all.integration.mjs
RUN_REIMBURSEMENTS_BROWSER_TEST=1 node --test tests/finance-reimbursements.browser.mjs
```

Database tests require the disposable `work-db` database and
`WORK_MANAGEMENT_DISPOSABLE=1`. The allocation race test creates and cleans up its
own committed fixtures; run it sequentially with rollback-based serializable
tests to avoid shared-owner predicate conflicts. Browser tests use the development
app on port 3000 and mocked finance APIs, without saving real financial records.

Executed on 2026-11-24: all 10 selected unit tests, three sequential database tests
(including the concurrent-allocation case), and the desktop/phone browser workflow
passed. Read-only development HTTP checks verified all four methods reject
anonymous callers and owner history/detail reads succeed. TypeScript, targeted
ESLint, migration deployment to development/disposable databases, and the final
production Docker build passed. No production deployment or financial-data rewrite
was performed.

Refinement checks on 2026-11-25 passed: 10 unit tests, five sequential database
tests (including multiple people, concurrency, and migration of pre-existing
links), desktop/phone browser checks, TypeScript, targeted ESLint, and the
production Docker build. Browser checks cover unsaved edits surviving tab changes,
account-derived currencies, snackbar-only reimbursement errors, centered deletion
and unlink dialogs, and equal desktop refund columns. Authenticated development
history and reimbursement reads also passed without modifying financial records.

### Activity records

The primary pages are `/finance/income`, `/finance/expenses`, and `/finance/transfers`. The internal `FinancialTransaction` ledger remains the source of monetary totals. An income or expense form saves its supporting metadata and account movement together; receipt/pay-stub files are optional. A basic expense has one amount, with an optional subtotal/tax/tip breakdown. A same-account/date/amount conflict offers either reuse of the existing expense or explicit confirmation of a separate real purchase; the latter never bypasses private-document duplicate checks. Income uses a source, positive net amount and deposit account; gross earnings and deductions remain separate payroll details. Refunds are positive movements in Expenses that reduce spending. Transfers create two linked account movements and contribute neither income nor expenses.

History queries include imported movements even before supporting metadata is supplied. Fully excluded manual duplicates are hidden; partially excluded remainders remain visible. Activity histories/exports have a 5,000-movement filtered limit with an explicit error, so narrow account/date filters for larger datasets. Existing ledger IDs, document IDs, statement identifiers and audit events are retained. Old supporting-record list/detail redirect pages have been removed. Current income/expense details resolve their supporting records through ledger associations, including confirmed split allocations. Conflict buttons resolve supporting IDs to a current activity before navigating; they never treat a receipt ID as a ledger ID.

`activity-movement.ts` synchronizes an exclusively owned manual movement with its income/expense details in the same serializable transaction. Existing allocations are audited and recreated for the updated amount. Statement-linked amounts, account/currency changes, and shared payment edits are rejected with a correction message. An imported expense can be categorized without rewriting its bank amount or original CSV description. `activity-server.ts` deletes an unshared manual activity, its supporting details and optional files as a unit. Statement-linked or shared activity cannot be silently erased. Normal activity pages use whole-record deletion. Deleting an optional document retains its financial activity.

The Reconciliation tab/page and general **Matches & corrections** controls have been removed from the UI. Statement rows offer a simple Change match button and matching selector, saved with Save matches. Existing allocation records and audit history remain internal for historical data integrity; removing the controls does not delete or merge financial records. CSV rows link existing income, expenses or either side of an owned-account transfer. Partial matching is supported: saving at least one match marks the statement Saved and leaves remaining rows editable. Repeated saves do not create financial activity. No automatic bank connections, OCR or AI were added.

## CSV and original documents

Income, expense and transfer histories offer **Export CSV** using the applied search/date/account filters, across all pages. The shared list service reads one repeatable-read snapshot and refuses over 5,000 records; the endpoint also rejects outputs over 20 MB. Nothing is silently truncated. Narrow filters for larger histories. Empty selections export a header-only file. Errors preserve filters and allow retry.

Exports are UTF-8 with BOM, CRLF rows, quoted fields and escaped quotes/newlines. Potential formulas in text are prefixed with an apostrophe, including formulas following whitespace/control characters. Amounts remain exact decimal strings without a formula prefix. Spreadsheet programs may display leading apostrophes or round large values: import amount/identifier columns as text to preserve four-place precision. CSV is a viewing/data-transfer export, **not a restorable backup** and not an automatic round-trip import format.

Transaction history/export collapses each owned-account transfer into the outgoing entry plus destination columns, matching the UI; both currencies and counted amounts are retained. Exclude transfer rows when reproducing report income/expense totals, apply the same date/account/category/currency selection, and use **Counted amount**. Unresolved duplicates remain counted and require reconciliation. Receipt/income exports contain allocation JSON and relative owner-authenticated original-document download URLs; these are supporting metadata, not extra expenses/income. These CSV files do not contain file bytes, passwords, storage keys or full payment identifiers.

Receipt/pay-stub details offer **Open original** and **Download original**. Imports offer their original CSV download. Authentication, owner-scoped document associations, no-store, MIME protection and sandbox headers apply to these requests. Bulk original files are included with database backups below.

## File and log handling

- Keep `FINANCE_UPLOAD_DIR` outside `public`, with directory mode 0700 and files 0600. Both Compose environments have dedicated persistent file volumes, separate from PostgreSQL. Back them up together. Never use `docker compose down -v` on data you intend to retain.
- Image/PDF originals: at most 15 MB; actual bytes checked, declared MIME checked, images decoded by Sharp, at most 40 megapixels, single-frame JPEG/PNG/WebP/GIF. PDF header/end marker validation is not a full malware scan; previews run locally with PDF.js and original responses are sandboxed. HEIC must be exported as JPEG. Phone controls expose camera capture separately from photo/PDF selection, reject oversize/unsupported choices promptly, and retain the previous selection on failure. Server validation remains authoritative.
- Statement CSVs: at most 2 MB/1,000 rows, validated encoding/delimiters/structure, no executable spreadsheet evaluation. Multipart streams are bounded before parsing, independent of Content-Length.
- Private reads reject invalid storage keys, symlinks, non-files, empty/oversize originals and public-directory aliases. Missing originals produce an actionable 404 while financial metadata remains intact. Replacement and database save are coordinated, but abrupt termination can leave an orphan file. Do not delete files merely because their names are unfamiliar; inspect document references first.
- Prisma query logging is disabled, and Next development access logging excludes Finance pages/API URLs. Finance error logs contain fixed operation descriptions, not bodies, filenames, queries or raw Prisma errors. Configure reverse-proxy/hosting/access logs to omit query strings for `/finance` and `/api/finance`; application code cannot enforce external logging policy. Never log sessions or export contents.
- Keep authentication secrets, database credentials and backups out of source control. Review dependency security updates regularly, especially Next/Auth.js, Prisma, Sharp and PDF.js.

## Simple whole-database backup on the NAS

```sh
sudo sh scripts/backup-database.sh /volume1/backups/dashboard
```

This Docker-only command backs up every database table, including Japanese and all other dashboard data, without stopping the app. It writes a unique dated custom-format PostgreSQL dump and checks the archive with `pg_restore --list`. A failed dump is removed. This validates archive readability, not a complete recovery. Original uploads and `.env` are outside the database; use the combined procedure below when you also want the uploaded files. No backups are deleted automatically.

## Backup and restore rehearsal

Run from the repository on a host with Docker access, the matching Compose environment and a pre-existing **private parent directory**. Example paths below must be outside public files and the live upload directory. Backups include the **entire dashboard database**, not just finance, and all original finance and work files. They contain sensitive information. Use an encrypted filesystem/archive and an off-host encrypted copy with restricted access and a retention policy. The script sets restrictive permissions but does not perform encryption or scheduling.

```sh
node scripts/finance-backup.mjs backup docker-compose.dev.yml /secure/backups/dashboard-2026-11-07
node scripts/finance-backup.mjs verify /secure/backups/dashboard-2026-11-07
```

For production backups, substitute `docker-compose.prod.yml` and the production project's actual Compose settings. The script defaults to service names `dashboard` and `dashboard-db`, with upload roots read from the selected container (FINANCE_UPLOAD_DIR and WORK_UPLOAD_DIR; defaults `/app/private/finance` and `/app/private/work`). Optional BACKUP_PROJECT/BACKUP_APP_SERVICE/BACKUP_DB_SERVICE/BACKUP_APP_CONTAINER selectors support explicitly matching alternate environments; do not mix projects. Use the same Compose project environment that created the containers. The destination must not already exist.

The backup command briefly stops the app, records table fingerprints and document metadata, runs a custom-format `pg_dump`, copies the stopped container's mounted uploads, checks every referenced file's size/content hash, and writes a completion manifest. Version 2 also fingerprints every public database table and copies private work files into `work-documents/`, checking all active work originals against their metadata. Finance files remain under `documents/`. Both upload roots must be persistent and separate. It attempts to restart an app that was running even when backup fails; confirm service health afterward. Pause **all other writers**, including ad hoc scripts and database tools, while backing up: stopping the app alone cannot quiesce external writers. Plan for this maintenance window and sufficient disk space. A failed folder without `manifest.json` is incomplete and must not be used as a backup.

`verify` checks dump/document SHA-256 checksums, creates a disposable PostgreSQL 15 container with **no network and no host data mounts**, restores the dump, and compares counts and deterministic row fingerprints for every public table in version 2 backups, including all 15 finance tables, Japanese data and work records. It restores finance and work original files into separate temporary directories and validates them against the restored database. Version 1 manifests remain supported for older finance-only verification, but do not provide work-file recovery. It removes the temporary container/volume and files afterward. It never restores into live data. Checksums detect accidental changes, not malicious tampering with a manifest; verify only trusted backups. A failed verification leaves the original backup intact.

A Phase 8 development rehearsal successfully restored all 15 finance tables and all 12 then-referenced original files, including private examples. Reporting/database regression tests independently compare summaries to SQL ledger totals. This confirms that the tested snapshot can be restored; it does not prove that future backups or production recovery will work without rehearsals.

For an actual recovery:

1. Keep the damaged environment intact for investigation. Restore into **new empty PostgreSQL and upload volumes**, isolated from traffic, using the matching app revision and PostgreSQL major version.
2. Restore `database.dump` with `pg_restore --no-owner --no-privileges --exit-on-error` into the empty database under the deployment's database user. Restore `documents/` at FINANCE_UPLOAD_DIR and, for version 2, `work-documents/` at WORK_UPLOAD_DIR with restrictive permissions and the application's filesystem ownership. Do not overlay or merge a backup into a newer live database.
3. Verify the backup manifest and restored table/file fingerprints with a rehearsal first. Run `prisma migrate deploy` only after confirming which app revision and schema are being recovered; later migrations may change data.
4. Start the restored app privately and check owner login, original downloads, sample import/reconciliation history, exact report totals and counts before directing traffic to it.
5. Retain the former volumes until recovery is accepted. Record recovery time, snapshot age and any lost post-backup entries.

Keep database connection configuration, authentication secrets, Compose configuration and app revision backed up through a separate secure configuration process. The database dump/file copy does not include those secrets or guarantee point-in-time recovery.

## Simplification and remaining work

Phase 8 removes the unused Phase 1 `FinanceLanding` component and uses one `FinanceDocumentPanel` for receipt and pay-stub capture/preview/download. Existing Sharp (byte validation), PDF.js (private preview), Recharts (reports) and framework/ORM dependencies are still used; no new runtime dependencies were added. Avoid replacing these with separate upload/export frameworks without a concrete need.

Recommended operational improvements: encrypted scheduled off-host backups and regular restore drills; external log policy and TLS review; periodic dependency updates; orphan-file audits after crashes. If history grows substantially, add streaming/cursor exports and bounded database-side report aggregation. Exports currently cap at 5,000 records, reporting reads owner history into memory, and backup checksums read files into memory. Optional future hardening includes malware scanning and signed backup manifests. None of these imply AI, OCR, Outlook ingestion or new financial modules.


## Work-management Phase 04 backup extension

The combined tool now protects notes, revision/activity history and work attachment
metadata as part of the whole database, plus the separate work original-file root.
The database-only NAS command remains unchanged; it does not include upload bytes.
New development/production Compose artifacts declare a dedicated work file volume.
The production artifact has not been deployed by Phase 04.

An isolated Phase 04 rehearsal successfully restored all 39 then-existing public
tables and verified 12 finance originals plus 4 work originals by size and content
hash. Finance originals were copied read-only into isolated test storage for that
rehearsal; live finance files/data were not changed. The backup stopped/restarted
only the disposable app and verification used a new container with no network or
live mounts. This evidence does not replace a future production restore drill.

Work attachments use independent records, storage authorization and lifecycle;
finance receipt/pay-stub permissions are never borrowed for work. The neutral
private PDF canvas renderer is shared with its existing finance wrapper. Work
removal/replacement can leave explicit pending file cleanup or a private orphan
after interruption; do not remove unknown files without checking metadata while
writers are stopped. See [work operations](work-management/OPERATIONS.md) for
limits, mutation semantics and complete work-root recovery instructions.

## Fixed statements and development data conversion

New imports select an account and inclusive statement dates. CSV headers must be `date,ref #,description,amount`, with `YYYY-MM-DD` dates and signed dot-decimal account-currency amounts. Selected rows explicitly link an existing same-account, same-currency, same-signed-amount income, expense or transfer. Unmatched rows can remain. Save matches confirms selections immediately; at least one confirmed row changes the import from Draft to Saved. Saved statements remain editable for adding, changing and removing row matches, with serializable writes, revision checks and audit events. No financial movement is created by importing. Confirmed statement links drive the green matched badges; draft selections do not. A record may occur in overlapping statements, but cannot be selected twice in one statement. History counts confirmed and unmatched rows independently of the legacy status name `COMPLETED`, which now means Saved for matching-only imports. No schema migration is needed for this status interpretation. Keep source references stable and unique per statement.

The `20261118120000_statement_period_and_matching` migration is additive. Historical general-format service support remains for stored imports; their original CSVs are not assumed to have the new headers.

The completed development conversion scripts have been removed. Their historical results and pre-conversion backups remain in ignored `backups/finance-statement-redesign/`; normal startup and seeding never rerun those conversions.

## Statement-matched record protection and notes

Income, expense and refund details become read-only once their movement has a confirmed statement match. Supporting-record edits, document replacement/deletion, and financial-field changes are rejected by owner-scoped services, not just disabled in the interface. Remove or correct the statement match before changing financial facts. Notes remain editable through owner-only `PATCH /api/finance/activities/[id]`: the request accepts only `notes`, uses `If-Match` with the movement version, updates the movement and its directly linked supporting notes atomically, and never changes money or matching links. Matched cards use View / notes. Positive statement rows may select Refund as well as Income or Transfer.

The completed imported-example cleanup script has also been removed. Its database/original-file backups remain under ignored `backups/finance-matched-lock-cleanup/`. Historical imported rows, matching decisions and source files that still support financial records are retained.

## Current finance overview

The overview follows Income / Expenses / Transfers / Imports. Three headline totals show recorded income, net expenses (purchases less refunds), and net cash flow. Transfers/card payments and supporting documents do not add income or expenses. Legacy adjustments are identified separately when present. Gross income and deductions remain optional pay details, not extra cash. All monetary totals use exact counted ledger amounts after confirmed duplicate exclusions; only chart coordinates and bar widths use floating-point values.

`src/lib/finance/overview.ts` builds workflow summaries from the same repeatable-read snapshot as the report totals. It counts owned-account transfers once using their transfer ID. Matching uses saved import-row associations or confirmed statement links, never receipt coverage or the old IMPORTED origin flag. Both transfer legs must be matched for full confirmation; one leg is partial. Cash records may remain unmatched. Statement rows use their bank dates within the selected account/currency/date/dataset scope; Saved statements can still have unmatched rows. Draft selections are not confirmations.

`FinanceOverview.tsx` provides month/year/custom ranges, previous/next period, currency and collapsible account/example-data filters retained in the URL. Charts switch between the selected period and twelve months. Spending switches between category and account; income shows source names and types. Recent activity links directly to income, expense/refund or transfer details. Retired receipts/reconciliation navigation is removed. Dates are written calendar dates; the default current month uses the configured timezone. Partial-period comparisons are labelled and neutral, and example-data inclusion remains visible. Pay details remain available on individual income pages.

Pure workflow tests are in `tests/finance-reporting.test.mjs`; SQL/ledger reconciliation and ownership checks use `tests/finance-reporting.integration.mjs`; read-only live browser checks in `tests/finance-reporting.browser.mjs` verify exact displayed totals, retained filters, visible charts, empty states and 320–1920px layouts. Legacy report API fields remain available for compatibility; the overview uses the new `overview` summary. Viewing the overview changes no financial records and needs no migration.

## Code and schema retirement

The code cleanup removes unused supporting-record histories, redirect-only aliases, the old standalone reconciliation API/scoring workspace and completed development conversion scripts. `ExpenseEditor.tsx` is the single expense editor; `IncomeEditor.tsx` is the single income editor. `matching-ledger.ts` retains the actual allocation/capacity/duplicate-exclusion logic used by activity writes and statements. Expense file downloads use `/api/finance/expenses/[receiptId]/document`; exports use that same canonical endpoint.

Retain `FinancialTransaction`, `FinancialTransfer`, `FinancialReceipt`, `FinancialIncomeRecord`, `FinancialDocument`, imports/entries, matches/events and income deductions. They contain ledger movements, breakdowns, payroll details, private file metadata, source provenance or financial audit facts. A null direct transaction ID does not prove an unused record: a supporting record can be connected through several confirmed allocations. In the audited development data, two income deposits share one income record and several expenses use split/shared receipt allocations. Do not flatten or delete them as a cleanup.

Historical migrations and their preservation/rehearsal tests are deployment assets, not obsolete application screens. Keep applied migration checksums intact. The work metadata retirement migration archives old task values/context definitions before removing ten task columns, project context linkage and the context table. No finance monetary records, document bytes or Japanese data are removed by that migration.

The source reachability regression (`tests/source-reachability.test.mjs`) checks that every handwritten source module is reachable from a Next entry point; ambient type declarations and generated Prisma files are intentionally excluded. Generated files are also excluded from handwritten-code linting. No runtime package was removed: FullCalendar/Luxon, Recharts, Sharp, PDF.js, authentication and ORM packages all still have active uses.

Superseded browser fixtures for the old inline capture/context editor, task key dates and reward API were removed. Their current replacements are `work-all.browser.mjs` (phone/desktop creation, details, view toggle and contacts), `project-classification.browser.mjs`, `calendar-project-controls.browser.mjs`, and the task dialog/loading/details tests. Canonical command integration suites retain ownership, concurrency, retry, lifecycle and graph checks. Historical phase documents remain records of the implementation at that time.

Cleanup verification (development and disposable copies only): 38 unit-test files passed; TypeScript including unused locals/parameters passed; handwritten-source ESLint passed with nine existing hook/image warnings; production build passed. Work/calendar integration checks passed 49 tests; finance activity, fixed-statement, private expense-document and reporting checks passed. Desktop/phone finance workflow, All Work, project classification and calendar/project controls passed. The live auth check verified 147 protected API handlers, anonymous page access, rejected identities and owner reads. The restored-copy comparison verified all retained tables and metadata archives; the timestamp guard also rejected a nonempty temporary fixture. Production was not deployed or modified.

The final schema-diff check returned an empty migration after removing the unused all-null practice timestamp. All 42 migrations also applied successfully from an empty database. The updated work showcase seed/retry and exact-manifest archive test passed in a separately guarded empty example database; it does not add examples to the real development database.

The combined follow-up regression run also passed 49 project/relationship/note/attachment/date/reliability checks, including concurrent edits and a 1,000-task synthetic workload. Temporary browser/fixture services were stopped after verification; their isolated volumes and the pre-cleanup backup were retained.

Correction to the initial cleanup assessment: `ActivityVocab.lastPracticed` is required for Japanese per-activity review scheduling and has been restored by `20261118122000_restore_activity_review_timers`. Its former lack of callers was missing behavior, not an obsolete feature. Exact saved-session word history restores known timers; unknown dates stay due for review. The field is now written on practice save and used for 14-day review selection without changing ratings, borders or averages.


## Finance refinements — account balances and expense-based reimbursements

Implemented November 2026. Migration
`20261126120000_finance_balances_and_source_types` is additive: it creates balance
checkpoints, adds an account balance revision, creates configurable income source
types, and links existing sources to the six corresponding default types. It does
not create transfers, rewrite monetary transactions, change statement links or
invent starting account balances. Apply it through the normal `prisma migrate
deploy` deployment step. It has been applied locally in development and to the
isolated test database; production deployment was not performed.

### Reimbursement reporting

Refund/reimbursement records remain one incoming bank movement. Their entry form
no longer assigns a single expense category. Each allocation inherits the category
of its covered expense. A single 2,000 CAD payment allocated 1,000 to School and
1,000 to Rent reduces those category totals by 1,000 each, while cash flow and
statement matching still see a single 2,000 payment. Unallocated payment amounts
appear as **Unallocated refunds**. Old standalone refund category values do not
determine the new category breakdown. Editing/unlinking an allocation recalculates
the breakdown without changing the bank amount or creating more transactions.

Reports attribute refunds on the payment date, even when the covered purchase was
in an earlier month. Category filters use the allocated portion; unfiltered record
counts continue to count the payment once. Expense-history category filters also
find the single payment through its covered expenses and open its original record. Overall refunds, account/merchant
breakdowns and cash flow retain the original ledger identity. Global search and
refund cards use covered expense categories rather than the payment's old category.

**Awaiting reimbursements** in the overview shows the current remaining expected
repayments, expense count, people and links to the five largest outstanding
expenses. This includes older expenses, rather than hiding debt from earlier
months. The card is explicitly current, honors currency/account/dataset filters,
and excludes future-dated payments/expenses. Expected repayments are not added to
income or account balances. Direct expense tracking add/edit dialogs and payment
allocation/unlink workflows keep their existing version/conflict checks.

### Account balances and manual corrections

The overview and Finance Settings → Financial accounts show current balances.
`GET /api/finance/balances` reads an owner-scoped consistent snapshot. Amounts are
calculated with integer ten-thousandths, including income, expenses, refunds,
legacy adjustments and both account-transfer legs, less confirmed duplicate
exclusions. Future-dated records are excluded until their date in the dashboard
selected timezone. Accounts/currencies are kept separate. Negative credit-card
balances mean money owed; a positive card balance is a credit.

Without a manual correction, an account is marked **Balance not yet verified**:
its recorded net activity is not assumed to be its actual bank balance.

**Set balance** opens a centered modal. Enter the real signed balance and closing
date, up to today, with at most two decimal places; zero is allowed. The service
stores `FinancialAccountBalance.amount` and a snapshot `ledgerAmount` of counted
activity through that date. The current balance is:

```
real balance at latest correction
+ current counted ledger activity through today
- counted ledger snapshot stored with that correction
```

This also handles new same-day records and edits/backfilled older records: those
changes affect the calculated balance, rather than being silently ignored. If
backfilling history changes it, use Set balance again after finishing the backfill
to reconcile with the real bank balance. Corrections do not change income,
spending, transfer totals or statement matching. They are included in full-database
backups automatically.

`POST /api/finance/accounts/[id]/balance` validates ownership, money, the date and
`expectedRevision`, increments `balanceRevision`, and upserts the dated checkpoint
in a serializable transaction. Stale saves return 409 instead of overwriting a
newer correction. A newer date retains earlier checkpoints; correcting the same
date replaces that checkpoint. New corrections cannot predate the latest one.
Account currencies cannot change once checkpoints or other financial history exist.

The overview balances are current, separate from its selected cash-flow period.
Financial account cards expose the same control in Settings for every currency.

### Configurable income source types

**Finance Settings → Income source types** provides create/edit/deactivate dialogs.
Income sources select an active owned type. Renaming a type updates its display
where the source is used, including income details, history, overview and CSV
export. Existing source assignments remain visible after deactivation; deactivated
types cannot be assigned to a different source. Types are deactivated, not deleted.

`FinancialIncomeSourceType` holds the editable names/status. The migration backfills
`FinancialIncomeSource.typeId` from existing classifications. The older `kind`
classification remains for compatibility with existing tooling and source records
without a type link; it is no longer the form's fixed list of type choices.
Changing the type of a source with income history is allowed and changes its
classification, never its existing deposit amounts or associations.

### Verification

- Exact-money unit and regression tests cover combined/partial/unallocated
  reimbursements, category/total consistency, current outstanding debt, balance
  snapshots, same-day/historical edits, future dates, duplicate exclusions,
  configurable type validation, refund validation, and authorization before input
  or database access.
- Rollback-only PostgreSQL tests verify split payments still count once, account
  transfers change both balances, a manual correction creates no ledger activity,
  stale saves/foreign accounts and foreign/inactive type assignments are rejected,
  used source types can be changed, and income deposits remain intact.
- A read-only schema comparison found no differences for the new finance models.
  Pre-existing Calendar/Birthday/Recurrence foreign-key update-action differences
  remain outside this finance change.
- TypeScript, targeted ESLint, 25 unit/regression tests, database suites and the
  production Docker image build passed.
- Browser tests cover large-monitor and phone list widths, balance dialogs,
  configurable type create/edit/selection, account-derived transfer currency and
  two-decimal input, the overview, plus the existing reimbursement workflows with
  centered add/edit tracking and outside-click dismissal.

New tests: `finance-refinements.test.mjs`, `finance-refinements.integration.mjs`
(`RUN_FINANCE_REFINEMENTS_DB_TEST=1` in the existing disposable `work-db` setup),
and `finance-refinements.browser.mjs`
(`RUN_FINANCE_REFINEMENTS_BROWSER_TEST=1`, Playwright and the local dev app).
Database fixtures roll back; browser mutations are mocked. No real income,
expense, transfer or balance was created for verification. Physical iPhone testing
and production NAS performance remain manual checks.
