# Finance module maintenance

## Structure and invariants

- `src/app/finance`: owner-protected App Router pages and Finance navigation.
- `src/app/api/finance`: authenticated route handlers. Every exported handler must call `requireOwner(request)` **before** reading input, querying data or accessing documents. Pages inherit `ProtectedLayout` through the Finance layout. This application intentionally supports one GitHub owner, with existing database data under user ID 1.
- `src/lib/finance`: pure validation/money rules; owner-scoped Prisma services; CSV parsing/imports; reconciliation ledger; reporting; private file storage; CSV export serialization.
- `src/components/finance`: entry forms, history, matching workspace, reports, shared document/camera controls and request/error helpers. `useHistoryFilters` retains **applied** transaction/receipt/income filters and page in the URL, including after opening a detail and going back. Unsaved draft fields do not change exported filters. Entry drafts and selected files are held only in memory until saved; refreshing or leaving a form can discard them. URL filters may be retained in browser history; avoid private notes in shared links.
- `prisma/schema.prisma` and additive migrations: financial records, supporting documents, imports, confirmed allocations and immutable matching audit events. Phase 8 changes no database schema.
- `scripts/finance-backup.mjs`: host-side backup and isolated restore verification using Docker/PostgreSQL 15.
- `tests/finance*`: unit, rollback-only database and browser coverage. Database tests require their explicit `RUN_FINANCE_*_DB_TEST=1` flags; live usability checks only read records. Existing entry-form browser tests mock financial mutations.

Keep monetary values as decimal strings at API/CSV boundaries. Database amounts are `Decimal(19,4)`; calculations use Prisma Decimal or integer ten-thousandths. Reports use `sign(amount) × (abs(amount) − excludedAmount)`, never original amounts alone. Documents and payroll metadata add no money movements. Transfers/card payments contribute neither income nor expenses; refunds reduce spending, reimbursements entered as income remain income, and adjustments are separate. Currencies must never be summed together. A partial or uncertain match must remain explicit. Gross/net payroll details and deposit cash are different views of the same underlying earnings.

## CSV and original documents

Transaction, receipt and income history offer **Export CSV** using the applied search/date/account/status filters, across all pages. The shared list service reads one repeatable-read snapshot and refuses over 5,000 records; the endpoint also rejects outputs over 20 MB. Nothing is silently truncated. Narrow filters for larger histories. Empty selections export a header-only file. Errors preserve filters and allow retry.

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

Run from the repository on a host with Docker access, the matching Compose environment and a pre-existing **private parent directory**. Example paths below must be outside public files and the live upload directory. Backups include the **entire dashboard database**, not just finance, and all original finance files. They contain sensitive information. Use an encrypted filesystem/archive and an off-host encrypted copy with restricted access and a retention policy. The script sets restrictive permissions but does not perform encryption or scheduling.

```sh
node scripts/finance-backup.mjs backup docker-compose.dev.yml /secure/backups/dashboard-2026-11-07
node scripts/finance-backup.mjs verify /secure/backups/dashboard-2026-11-07
```

For production backups, substitute `docker-compose.prod.yml` and the production project's actual Compose settings. The script uses the fixed service names `dashboard` and `dashboard-db` and standard file path `/app/private/finance`; if deployment names/path change, update the procedure first. Use the same Compose project environment that created the containers. The destination must not already exist.

The backup command briefly stops the app, records table fingerprints and document metadata, runs a custom-format `pg_dump`, copies the stopped container's mounted uploads, checks every referenced file's size/content hash, and writes a completion manifest. It attempts to restart an app that was running even when backup fails; confirm service health afterward. Pause **all other writers**, including ad hoc scripts and database tools, while backing up: stopping the app alone cannot quiesce external writers. Plan for this maintenance window and sufficient disk space. A failed folder without `manifest.json` is incomplete and must not be used as a backup.

`verify` checks dump/document SHA-256 checksums, creates a disposable PostgreSQL 15 container with **no network and no host data mounts**, restores the dump, and compares counts and deterministic row fingerprints for all 15 finance tables. It restores original document files into a separate temporary directory and validates them against the restored database. It removes the temporary container/volume and files afterward. It never restores into live data. Checksums detect accidental changes, not malicious tampering with a manifest; verify only trusted backups. A failed verification leaves the original backup intact.

A Phase 8 development rehearsal successfully restored all 15 finance tables and all 12 then-referenced original files, including private examples. Reporting/database regression tests independently compare summaries to SQL ledger totals. This confirms that the tested snapshot can be restored; it does not prove that future backups or production recovery will work without rehearsals.

For an actual recovery:

1. Keep the damaged environment intact for investigation. Restore into **new empty PostgreSQL and upload volumes**, isolated from traffic, using the matching app revision and PostgreSQL major version.
2. Restore `database.dump` with `pg_restore --no-owner --no-privileges --exit-on-error` into the empty database under the deployment's database user. Restore the `documents/` contents at the configured private upload root with restrictive permissions and the application's filesystem ownership. Do not overlay or merge a backup into a newer live database.
3. Verify the backup manifest and restored table/file fingerprints with a rehearsal first. Run `prisma migrate deploy` only after confirming which app revision and schema are being recovered; later migrations may change data.
4. Start the restored app privately and check owner login, original downloads, sample import/reconciliation history, exact report totals and counts before directing traffic to it.
5. Retain the former volumes until recovery is accepted. Record recovery time, snapshot age and any lost post-backup entries.

Keep database connection configuration, authentication secrets, Compose configuration and app revision backed up through a separate secure configuration process. The database dump/file copy does not include those secrets or guarantee point-in-time recovery.

## Simplification and remaining work

Phase 8 removes the unused Phase 1 `FinanceLanding` component and uses one `FinanceDocumentPanel` for receipt and pay-stub capture/preview/download. Existing Sharp (byte validation), PDF.js (private preview), Recharts (reports) and framework/ORM dependencies are still used; no new runtime dependencies were added. Avoid replacing these with separate upload/export frameworks without a concrete need.

Recommended operational improvements: encrypted scheduled off-host backups and regular restore drills; external log policy and TLS review; periodic dependency updates; orphan-file audits after crashes. If history grows substantially, add streaming/cursor exports and bounded database-side report aggregation. Exports currently cap at 5,000 records, reporting reads owner history into memory, and backup checksums read files into memory. Optional future hardening includes malware scanning and signed backup manifests. None of these imply AI, OCR, Outlook ingestion or new financial modules.
