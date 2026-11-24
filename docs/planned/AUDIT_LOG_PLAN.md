# Activity log / audit history

Status: proposal only. No schema, routes, authentication hooks, or application
behavior are implemented by this document.

## Recommendation

Yes: a **Logs** page would be useful for answering “When did I change this?”,
“Was that income saved?”, or “Was there a sign-in I do not recognize?”. Keep it
as a readable application activity history, with links to the affected records.
It would also help investigate accidental edits and unexpected background work.

Record meaningful actions rather than every SQL statement or changed row. A saved
Japanese practice can update many word statuses, review timers, and rewards; it
should normally produce one session entry. A transfer has two account legs but
represents one transfer. A sign-in is useful to record even though JWT authentication
does not necessarily write a database session.

This is a diagnostic history, not a financial ledger, an undo system, or a backup.
It should never change report totals or replace existing revision histories.

## What the code already provides

The current foundation is useful, but coverage is not application-wide:

- `prisma/schema.prisma` defines `WorkActivity` for task/project facts,
  `WorkEventActivity` for calendar changes, `KnowledgeArticleRevision` for article
  revisions, and `FinancialMatchEvent` for matching decisions. These records have
  different purposes and payloads; none is a complete global audit trail.
- `src/lib/work-management/activity-server.ts` appends task activity through a
  Prisma transaction client. Existing work commands have replay protection through
  `WorkMutationReceipt`.
- `src/lib/auth.ts` uses NextAuth with GitHub, JWT sessions, and owner verification.
  It currently has no sign-in audit event handler. Calling the session callback
  or refreshing a page must not be interpreted as a new sign-in.
- Finance has canonical records, transfers and statement matching. Audit entries
  must describe these actions without becoming additional income or expenses.
- Private documents and article bodies already have their own storage/revisions.
  They should not be copied wholesale into logs.

Implementation should inspect the current mutation services again before adding
instrumentation. Historical records contain facts only for the actions they
actually recorded; do not invent missing financial edit or login history.

## What to record

| Area | Useful entries | Details shown |
| --- | --- | --- |
| Authentication | Successful owner sign-in, explicitly observed sign-out, denied sign-in attempts | Time, outcome, provider and minimal actor identification |
| Work | Task/project creation, editing, deletion, status changes, archive/restore, notes and file changes | Reference, short title, changed fields; status before and after |
| Calendar | Event changes, scheduling and recurrence changes | Event reference, relevant dates, operation; group generated occurrences |
| Finance | Income/expense/transfer creation, edits/deletion, statement saves/matches/unlinks, document changes | Record reference, amount/currency changes where useful, account reference |
| Knowledge | Article creation/editing, moves, links and attachments | Article reference and revision link |
| Japanese | Practice saved, vocabulary created/edited/deleted | Session reference, counts, activity; group changes made by one session |
| Settings/background work | Settings changes and meaningful worker actions | Changed setting names or job summary, actor identified as System |

Do not log every read, page visit, polling request, unchanged save, or routine
worker heartbeat. Record failed save attempts separately from successful changes;
a validation error is not evidence that a database change happened.

Successful sign-in should be recorded through the NextAuth sign-in event. Denials
need a separate bounded path at the authorization decision. Never trust an actor
ID supplied by a client. Session renewal is not a sign-in; closing a browser or
swiping away a PWA does not reliably generate a sign-out event. A sign-in record
also cannot tell whether the owner or somebody using the owner's GitHub credentials
was physically at the device.

## Shared data model

Add one small `AuditEvent` model, rather than one new table per module:

| Field | Purpose |
| --- | --- |
| `id` | Stable event identifier |
| `userId` | Owner whose dashboard the event concerns, enforced server-side |
| `occurredAt` | UTC instant using `timestamptz`, displayed in the dashboard timezone |
| `actorKind`, `actorGithubId` | Owner, system, or unauthenticated attempt; identity may be absent for denied requests |
| `category`, `action`, `outcome` | Validated values such as Work / Task status changed / Success |
| `entityType`, `entityId`, `entityReference` | Stable source identifiers retained even if that source is deleted |
| `summary`, `changes` | Short readable summary and strictly allowlisted field differences |
| `operationKey`, `eventKey` | Correlate one operation and prevent duplicate events on retry |
| `originType`, `originId` | Optional reference to existing activity/revision history |

Use a unique owner/event key for replay protection. An operation can emit multiple
intentional events, so its operation key alone should not be unique. Index
`userId, occurredAt, id` and common category/entity lookups for cursor pagination.
Avoid foreign keys that delete audit entries when their source disappears.

Keep existing detailed histories authoritative. New commands can write a compact
global entry referencing their existing work activity or article revision, without
copying those full payloads. Do not add a second canonical financial record.

## Recording reliably

Introduce a shared server-only writer used by domain services. For a database
mutation, write its audit entry in the **same transaction**: both commit or both
roll back. Deletion captures an allowed summary before deleting its source.
Retrying the same request should neither repeat the mutation nor duplicate its log.

Emit events at the semantic command boundary, including supported worker commands.
Avoid a blanket Prisma interceptor: individual row updates lack business context,
can duplicate existing histories, and do not guarantee coverage of raw SQL or
database maintenance. Group bulk operations and recurring occurrence generation.

Authentication is a separate flow. Explicitly define failure handling there: a
failed sign-in audit insert should emit a generic server diagnostic without
revealing credentials or making the site unusable. Do not advertise guaranteed
capture across database outages. Other rejected/failed attempts can be recorded
after the business transaction rolls back, with sanitized error codes and bounded
volume; never persist unfiltered exception messages.

This design covers instrumented application commands. Direct SQL, database restores,
external scripts and uninstrumented code are outside its coverage. If literally
every database write is required later, evaluate PostgreSQL auditing or change
capture separately. That would be substantially noisier and still would not
replace sign-in activity or explain the user's intention.

## Page design

Add **Logs** to the sidebar. Default to the last 30 days, newest first. Each row
should show a small category icon, a clear action, source reference, time, actor
and outcome. For example:

- Task TASK-0042 changed from To do to Waiting — Today, 3:12 pm.
- Expense #1850 created — CAD 42.15 — Today, 12:05 pm.
- Japanese practice saved — 25 words — Yesterday, 8:42 pm.
- GitHub owner signed in — Yesterday, 8:10 am.

Provide collapsible filters for date range, module, action and outcome, plus search
by reference or short summary. Use bounded cursor pagination and responsive rows
or cards. Clicking an entry opens a centered read-only detail modal with allowed
before/after values and an Open record button. Deleted records keep their history
with a clear “Record deleted” state. Existing revision history remains accessible
from its own module.

Do not offer individual log editing/deletion or an Undo button. Explain the
tracking start date and any imported historical coverage so an empty result is
not presented as proof that nothing happened.

## Access, content and retention

Use the current owner-only guards on the page and every API, with server-side
ownership filtering and no public log endpoint. Keep failed non-owner attempts
visible only to the dashboard owner. Do not add a broad read permission merely
because a log links to another record.

Allowlist useful fields such as status, dates, amount and currency. Store only a
“changed” marker for note/body contents; do not duplicate receipt files, pay stubs,
CSV contents, passwords, OAuth tokens, session cookies or environment variables.
Avoid storing IP addresses and full user-agent strings by default. Apply size
limits to summaries and metadata.

A practical initial policy would retain global logs for 180 days, with denied
authentication attempts kept for 30 days and rate-limited to prevent flooding.
Retention must not purge work notes, article revisions, financial matching history,
or source records. Document this distinction and include the new table in the
existing full-database backups. Treat it as append-only through application APIs;
it is not tamper-proof against someone with database administrator access.

## Proposed implementation order

1. Define event names, metadata allowlists, coverage and retention; add the model,
   migration, transactional writer and idempotency tests.
2. Integrate work/calendar activity and authentication hooks, retaining their
   existing histories. Confirm sign-ins are not counted on session refresh.
3. Integrate finance, Knowledge, Japanese and settings commands. Include worker
   and script coverage explicitly, rather than assuming every write is covered.
4. Build the owner-only Logs page and filters. Optionally adapt selected historical
   events, preserving original timestamps and unique origin references.
5. Add a bounded retention job, maintenance instructions and regression checks.

Verify unauthorized access, owner scoping, transaction rollback, retries, deleted
sources, grouped transfers/practices, worker attribution, timezone display,
metadata redaction and pagination. Confirm financial totals and rewards remain
unchanged by logging. No additional container is needed: Next.js, Prisma and
PostgreSQL can host this; retention can use the existing worker/scheduling pattern.
