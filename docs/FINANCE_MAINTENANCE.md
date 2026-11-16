# Finance module maintenance

## Structure and invariants

- `src/app/finance`: owner-protected App Router pages and Finance navigation.
- `src/app/api/finance`: authenticated route handlers. Every exported handler must call `requireOwner(request)` **before** reading input, querying data or accessing documents. Pages inherit `ProtectedLayout` through the Finance layout. This application intentionally supports one GitHub owner, with existing database data under user ID 1.
- `src/lib/finance`: pure validation/money rules; owner-scoped Prisma services; CSV parsing/imports; reconciliation ledger; reporting; private file storage; CSV export serialization.
- `src/components/finance`: entry forms, history, matching workspace, reports, shared document/camera controls and request/error helpers. `useHistoryFilters` retains **applied** transaction/receipt/income filters and page in the URL, including after opening a detail and going back. Unsaved draft fields do not change exported filters. Entry drafts and selected files are held only in memory until saved; refreshing or leaving a form can discard them. URL filters may be retained in browser history; avoid private notes in shared links.
- `prisma/schema.prisma` and additive migrations: financial records, supporting documents, imports, confirmed allocations and immutable matching audit events. Phase 8 changes no database schema.
- `scripts/finance-backup.mjs`: host-side combined database/finance/work-file backup and isolated restore verification using Docker/PostgreSQL 15.
- `tests/finance*`: unit, rollback-only database and browser coverage. Database tests require their explicit `RUN_FINANCE_*_DB_TEST=1` flags; live usability checks only read records. Existing entry-form browser tests mock financial mutations.

Keep monetary values as decimal strings at API/CSV boundaries. Database amounts are `Decimal(19,4)`; calculations use Prisma Decimal or integer ten-thousandths. Reports use `sign(amount) × (abs(amount) − excludedAmount)`, never original amounts alone. Documents and payroll metadata add no money movements. Transfers/card payments contribute neither income nor expenses; refunds reduce spending, reimbursements entered as income remain income, and adjustments are separate. Currencies must never be summed together. A partial or uncertain match must remain explicit. Gross/net payroll details and deposit cash are different views of the same underlying earnings.

Finance configuration is grouped under **Finance → Settings** (`/finance/settings`): financial accounts, expense categories, income sources, and deduction types. Management pages use `/finance/settings/accounts`, `/finance/settings/categories`, `/finance/settings/income-sources`, and `/finance/settings/deduction-types`. Old account/category URLs redirect to their new pages; the old combined income settings URL redirects to the settings index. Accounts, categories, income sources and deduction types use centered create/edit dialogs; dismissing a dialog discards its unsaved draft. Successful saves update the list in place. Income, expense and transfer history filters start collapsed; expanding/collapsing preserves drafts and applied URL filters. An active-filter count remains visible when collapsed.

## Income, expenses and transfers

The primary pages are `/finance/income`, `/finance/expenses`, and `/finance/transfers`. The internal `FinancialTransaction` ledger remains the source of monetary totals. An income or expense form saves its supporting metadata and account movement together; receipt/pay-stub files are optional. A basic expense has one amount, with an optional subtotal/tax/tip breakdown. A same-account/date/amount conflict offers either reuse of the existing expense or explicit confirmation of a separate real purchase; the latter never bypasses private-document duplicate checks. Income uses a source, positive net amount and deposit account; gross earnings and deductions remain separate payroll details. Refunds are positive movements in Expenses that reduce spending. Transfers create two linked account movements and contribute neither income nor expenses.

History queries include imported movements even before supporting metadata is supplied. Fully excluded manual duplicates are hidden; partially excluded remainders remain visible. Activity histories/exports have a 5,000-movement filtered limit with an explicit error, so narrow account/date filters for larger datasets. Existing ledger IDs, document IDs, statement identifiers and audit events are retained. Earlier unmatched receipt/income records remain available under `/finance/expenses/documents` and `/finance/income/records`; saving one creates or links its movement without automatically backfilling historical money. Legacy transaction/receipt links redirect to the appropriate current record.

`activity-movement.ts` synchronizes an exclusively owned manual movement with its income/expense details in the same serializable transaction. Existing allocations are audited and recreated for the updated amount. Statement-linked amounts, account/currency changes, and shared payment edits are rejected with a correction message. An imported expense can be categorized without rewriting its bank amount or original CSV description. `activity-server.ts` deletes an unshared manual activity, its supporting details and optional files as a unit. Statement-linked or shared activity cannot be silently erased. Low-level historical supporting-record APIs retain their metadata-only deletion semantics; normal activity pages use whole-record deletion instead.

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

`scripts/normalize-finance-data.mjs` is a one-time **development-only** adapter for the earlier example/legacy records. It links existing supporting records, adds missing income/expense details, converts only tracked example adjustments, and adapts existing statement reviews. It verifies that every original monetary amount, account and currency remains unchanged. Dates for old statements are inferred from their earliest/latest source rows. Uncertain conversions are reported and block application. Non-example source files stay unchanged; tracked example files may be refreshed. File changes are restored if the database transaction fails. Back up the full database **and private documents** before applying; never run this against production.

```sh
# Preview: transaction rolls back; sequence gaps are harmless.
docker compose -f docker-compose.dev.yml exec -T dashboard node scripts/normalize-finance-data.mjs

# Apply only after reviewing the preview and backing up database and documents.
docker compose -f docker-compose.dev.yml exec -T dashboard node scripts/normalize-finance-data.mjs --apply --backup=/app/backups/path/to/database.dump
```

The November 14 development conversion has database and private-file backups in `backups/finance-statement-redesign/` (ignored by Git). It adapts the current records without recreating the dataset. Re-running the preview after conversion should report no further changes. Fresh older example datasets can use the same preview/apply procedure after seeding.

## Statement-matched record protection and notes

Income, expense and refund details become read-only once their movement has a confirmed statement match. Supporting-record edits, document replacement/deletion, and financial-field changes are rejected by owner-scoped services, not just disabled in the interface. Remove or correct the statement match before changing financial facts. Notes remain editable through owner-only `PATCH /api/finance/activities/[id]`: the request accepts only `notes`, uses `If-Match` with the movement version, updates the movement and its directly linked supporting notes atomically, and never changes money or matching links. Matched cards use View / notes. Positive statement rows may select Refund as well as Income or Transfer.

The development-only `scripts/remove-legacy-finance-examples.mjs` removes imported movements explicitly tracked in `FinancialExampleDataset`, never untracked personal entries. Its default mode previews and rolls back. Applying requires `--apply --backup=/path/to/database.dump`; also back up the private originals first. Cleanup records unlink decisions, preserves parsed statement/audit history, resets affected statement rows to unmatched, releases duplicate exclusions, removes only exclusively attached tracked example details/documents, and verifies every retained movement's original amount/account/currency. The November 15 cleanup removed 97 obsolete imported examples, including #1786. Database and original-file backups are under ignored `backups/finance-matched-lock-cleanup/`. Do not apply this cleanup to production. Older fixture generators retain historical cases for regression tests; the current seeded dataset's manifest records the cleanup and repeat seeding reuses that dataset.

## Current finance overview

The overview follows Income / Expenses / Transfers / Imports. Three headline totals show recorded income, net expenses (purchases less refunds), and net cash flow. Transfers/card payments and supporting documents do not add income or expenses. Legacy adjustments are identified separately when present. Gross income and deductions remain optional pay details, not extra cash. All monetary totals use exact counted ledger amounts after confirmed duplicate exclusions; only chart coordinates and bar widths use floating-point values.

`src/lib/finance/overview.ts` builds workflow summaries from the same repeatable-read snapshot as the report totals. It counts owned-account transfers once using their transfer ID. Matching uses saved import-row associations or confirmed statement links, never receipt coverage or the old IMPORTED origin flag. Both transfer legs must be matched for full confirmation; one leg is partial. Cash records may remain unmatched. Statement rows use their bank dates within the selected account/currency/date/dataset scope; Saved statements can still have unmatched rows. Draft selections are not confirmations.

`FinanceOverview.tsx` provides month/year/custom ranges, previous/next period, currency and collapsible account/example-data filters retained in the URL. Charts switch between the selected period and twelve months. Spending switches between category and account; income shows source names and types. Recent activity links directly to income, expense/refund or transfer details. Retired receipts/reconciliation navigation is removed. Dates are written calendar dates; the default current month uses the configured timezone. Partial-period comparisons are labelled and neutral, and example-data inclusion remains visible. Pay details remain available on individual income pages.

Pure workflow tests are in `tests/finance-reporting.test.mjs`; SQL/ledger reconciliation and ownership checks use `tests/finance-reporting.integration.mjs`; read-only live browser checks in `tests/finance-reporting.browser.mjs` verify exact displayed totals, retained filters, visible charts, empty states and 320–1920px layouts. Legacy report API fields remain available for compatibility; the overview uses the new `overview` summary. Viewing the overview changes no financial records and needs no migration.
