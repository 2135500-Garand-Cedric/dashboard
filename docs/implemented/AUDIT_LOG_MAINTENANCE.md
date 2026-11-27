# Application audit history

Implemented November 26, 2026. The **Logs** sidebar page shows owner-only activity
recorded after deployment of migration `20261127120000_application_audit_history`.
It does not reconstruct earlier sign-ins, edits or deleted records.

## Structure

- `prisma/schema.prisma`: `AuditEvent` and `User.auditStartedAt`. Sources are stored
  as bounded identifiers, without cascading source foreign keys. Existing Work,
  Knowledge and financial histories remain authoritative and unchanged.
- `src/lib/audit/writer.mjs`: allowlisted snapshots, private-field change markers,
  bounded payloads, owner/event replay keys and retention. It also runs in Node
  workers. Comparison digests are temporary and are never stored in audit rows.
- `server.ts`, `command.ts`, `work.ts`: explicit semantic command integration.
  These are not Prisma interceptors. Nested financial saves use an asynchronous
  command scope to produce one top-level entry rather than one entry per row.
- `auth.ts`: verified GitHub sign-in/sign-out and bounded denial capture.
  `failure.ts`: best-effort recording after failed Work/Finance mutations.
- `delivery.mjs`: terminal push/email state transitions. Savepoints isolate optional
  audit insert failures from externally accepted delivery state.
- `query.ts`, `dates.mjs`: owner domain history plus all-user AUTH security queries, timezone-aware day boundaries,
  cursor validation and canonical source links.
- `/api/logs` accepts read-only POST filters; `/api/logs/[id]` returns a detail.
  Neither exposes a mutation, export, editing, deletion or undo operation.
- `src/components/audit/AuditLog.tsx`: responsive list, collapsed filters,
  30-row cursor pages and a centered read-only detail modal.

## Command coverage

| Area              | Recorded command boundaries                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication    | NextAuth successful account sign-in and explicitly observed sign-out; invitations, linking, setup and member access changes; denied sign-in decisions, capped at 20 per hour                                                                                                    |
| Work and People   | Shared Work mutation commands: task/project lifecycle, directory contacts, checklist items, relationships, membership, stages, milestones, notes, attachments, deadlines, follow-ups and focus                                                                                  |
| Calendar          | Event changes/conversions/links; recurrence settings and grouped generated batches; selected holiday/birthday changes and task links                                                                                                                                            |
| Finance           | Transaction/transfer saves and deletes; expense/receipt and income/deposit saves, notes and documents; statement creation/review/commit/removal; reimbursement plans, allocations and unlinking; account corrections; accounts, categories, income sources/types and deductions |
| Knowledge         | Committed article, folder, template and Work-link changes; attached files and committed inline-image operations                                                                                                                                                                 |
| Japanese          | Vocabulary/readings/starring/category edits, grouped generated verb forms, legacy status-save endpoint and durable practice sessions with result/reward totals                                                                                                                  |
| Preferences       | Display timezone; notification categories, timing/privacy settings and device registration/disable; email permission and recipient-change markers                                                                                                                               |
| Inbox and workers | Created reminders and weekly-report availability; read/unread/dismiss/undo/snooze/read-all; queued email; selected terminal push/email delivery transitions; recurrence generation batches                                                                                      |

A canonical income/expense save logs its outer record once, including a link to its
bank movement. A transfer keeps two ledger legs and produces one entry. A practice
keeps its existing replay key, per-word timers and XP/gold transaction while
producing one session entry. Balance corrections remain checkpoints, never income,
expenses or transfers; their audit entries retain the prior calculated balance,
previous closing date/target and newly chosen balance.

Unchanged saves and successful command replays create no duplicate success entry.
Work and Finance command failures can create a separate, rate-limited failure
entry after rollback. Validation rejected before entering a command is not
universally captured. This is diagnostic history, not guaranteed surveillance.

## Deliberate exclusions

Page views, searches (including failed queries), snippets, polling, log reads,
exports/downloads, previews, unsaved filters, Quick add/menu opening, Knowledge
image drafts/lease cleanup and normal worker heartbeats are not audited. Legacy
standalone quest reward toggles are outside this command coverage. Direct SQL,
direct seed/backfill writes, restores and other uninstrumented maintenance are
outside capture. Scripts that explicitly call instrumented commands inherit their
audit behavior and current owner attribution; they are not general database
auditors. No historical import is performed.

Private bodies, descriptions, notes, contact details, readings, email recipients,
CSV contents and document bytes are not copied into logs. Changes to selected
private fields are represented by a changed marker. OAuth/session credentials,
upload storage keys and push endpoint/key values are never persisted in logs.
Practice entries contain counts and rewards, not the practiced word list.

## Failure and delivery behavior

For normal instrumented database commands, the mutation and audit insert use the
same transaction. An audit insert failure rolls back the save. Domain locks,
revision checks and existing replay keys still control the mutation itself.
Audit deduplication alone is not business idempotency.

Authentication and failed-save capture are best effort, with bounded transactions
and generic server diagnostics on outages. Logging cannot prevent owner login.
There is no claim of complete capture during a database outage.

Queued, provider-accepted, failed, skipped and unknown delivery outcomes are
separate. `SENT` means provider acceptance, not mailbox delivery or reading.
Delivery audit failures do not undo accepted state or initiate a resend. Bulk
terminal updates above 100 matching rows produce a bounded summary. Queue claims,
leases and retry counters are not logged. Existing email permission locking and
transport behavior are preserved; logging adds no network send or notifications.

## Deployment, retention and recovery

Use the usual production image and `prisma migrate deploy` workflow. The migration
is additive; it preserves existing record IDs/data and introduces no fabricated
history. Migrate before running the updated web app and worker. No new environment
variables, service, container, document volume or external provider is needed.
The runtime image includes the shared audit and owner-identity modules.

The existing notification worker prunes up to 500 eligible audit rows across all users once
per hour. Ordinary entries expire after 180 days; denied authentication attempts
after 30 days. A backlog drains over successive passes. Retention does not touch
Work notes/revisions, financial matches/checkpoints, source records, files,
notifications or delivery state. Keep the existing worker running even if push
sending is disabled; stopping it also stops automatic retention. Monitor generic
`Audit: retention unavailable.` diagnostics and database growth.

The existing full-database backup scripts include `AuditEvent` and the coverage
start date automatically, without table-list changes. Document backups remain
necessary for original uploads, which are not stored inside this history. See
[Finance maintenance](FINANCE_MAINTENANCE.md) and the database-backup instructions
in the project README. A restore itself does not generate historical audit events.
An isolated full custom-format `pg_dump`/`pg_restore` rehearsal preserved a test
audit row and the Japanese, Finance and Work tables; production data was not used.

Audit rows are append-only through app APIs, not tamper-proof against a database
administrator. The application retains the existing permanent owner mapping to
GitHub ID 89470930 / database user 1. Invited Japanese members use their own subject user ID and the USER actor kind; owner
administration records identify the affected member and owner actor. Only the owner
can read Logs, including AUTH security events across users. Member security source links
lead to User management; private domain records remain owner-scoped. See
[Multi-user maintenance](MULTI_USER_MAINTENANCE.md).

## Verification

Automated checks live in `tests/audit-log.test.mjs`,
`tests/audit-log.integration.mjs` and `tests/audit-log.browser.mjs`.
The database test requires `RUN_AUDIT_DB_TEST=1`,
`WORK_MANAGEMENT_DISPOSABLE=1` and the `work-db` disposable host; the browser test
requires `RUN_AUDIT_BROWSER_TEST=1` and local Playwright tooling. Never redirect
these mutation tests at production.

Executed checks cover atomic rollback, replay/no-op suppression, transfer grouping,
private-field redaction, owner/related-source isolation, deleted records, retention,
DST/date-only handling, auth/session behavior, accepted-delivery audit failure,
phone/desktop sizing, filters, pagination and modal/error states. Existing fixed
statement, finance balance/reimbursement, Knowledge, search, recurrence, holidays,
notification inbox, email permission and practice reward regressions were also run.

On this local disposable database, representative saves including audit took about
37 ms for task creation, 32 ms for a transfer and 28 ms for a practice save. These
are fixture measurements, not an audit-only overhead comparison or production
latency guarantee. Large statement edits retain their existing bounded row limit;
monitor their latency separately with representative files.

When adding a mutation, pass the existing transaction client to the audit boundary,
add an explicit public/private field policy and replay/no-op test, and update the
coverage table. Keep search and normal reads outside recording. Never add a blanket
ORM hook or copy an arbitrary request/exception into metadata.
