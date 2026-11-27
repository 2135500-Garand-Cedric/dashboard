# Activity log / audit history

Status: implemented November 26, 2026. This file retains the approved design;
see [maintenance and verified coverage](AUDIT_LOG_MAINTENANCE.md) for the implementation,
operational limits and tests.

Reviewed November 25, 2026 against the current schema and mutation code, including
account balance corrections, expense-based reimbursement categories, configurable
income source types, shared People, global search and phone quick actions.
See [Finance maintenance](FINANCE_MAINTENANCE.md),
[search maintenance](GLOBAL_SEARCH_MAINTENANCE.md), and
[email maintenance](EMAIL_MAINTENANCE.md) for current module behavior.

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
  `WorkNoteRevision` additionally preserves note revisions. Keep these histories
  rather than replacing them with global summaries.
- `src/lib/work-management/activity-server.ts` appends task activity through a
  Prisma transaction client. Existing work commands have replay protection through
  `WorkMutationReceipt`.
- `src/lib/auth.ts` uses NextAuth with GitHub, JWT sessions, and owner verification.
  It currently has no sign-in audit event handler. Calling the session callback
  or refreshing a page must not be interpreted as a new sign-in.
- Finance uses canonical `FinancialTransaction` movements, paired transfer legs,
  receipt/income metadata, and statement matches. `FinancialReimbursementPlan`
  and `FinancialReimbursement` track expected repayments and allocations;
  allocated refunds inherit categories from the covered expenses. These links
  change category reports/outstanding amounts without creating another payment.
- `FinancialAccountBalance` stores dated manual balance corrections and a counted
  ledger snapshot; `FinancialAccount.balanceRevision` prevents stale corrections.
  Setting the same date updates its existing checkpoint, so that row alone is
  not a full history of balance edits. Corrections are not ledger transactions.
- `FinancialIncomeSourceType` supplies editable source classifications, linked
  through `FinancialIncomeSource.typeId`. The older `kind` remains a compatibility
  field. Accounts, expense categories, sources and deduction types also have
  owner-managed settings.
- `WorkContact` is the shared People directory for task requesters/affected people
  and reimbursement contributors. A directory person is not an application user.
- `Practice` records session results, XP/gold and a replay-safe session key.
  Knowledge includes folder hierarchies, templates, article/Work links, attached
  files, inline images and temporary image drafts.
- `UserNotification` and `EmailDelivery` retain notification/delivery state.
  The existing worker processes reminders, weekly-report availability and queued
  email. These state records are useful origins, not complete audit histories.
- Several finance/settings handlers still call Prisma directly. Adding hooks
  only to domain services would miss those writes and would not make their audit
  inserts atomic. See the instrumentation map below.
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
| Finance records | Income/expense/refund/transfer creation, edits/deletion, statement saves/matches/unlinks, document changes | Canonical record reference, allowed amount/currency changes, account references; one transfer rather than two legs |
| Reimbursements | Tracking added/edited/removed; contributor changes; payment allocated, allocation edited/unlinked | Expense/payment/plan references, person reference, expected or allocated amount before/after and currency |
| Account balances | Manual balance set/corrected | Account reference, closing date, previous calculated balance and new target balance, currency and balance revision; explicitly not income/expense |
| Finance settings | Account/category/source/deduction and income-source-type creation, edits, activation changes | Setting reference, allowed name/status changes, source type before/after |
| People | Directory person created/edited/deactivated/reactivated | Person reference, safe name/status changes; markers for private contact-field edits |
| Knowledge | Article changes, folder moves/archive, templates, Work/article links, attachments and inline-image changes | Article/folder/template reference, revision or attachment reference; content-changed marker |
| Japanese | Practice saved; vocabulary/readings/verb forms/category or starred-state changes | Saved session reference, activity, weak/good/perfect counts, XP/gold; group generated forms and per-word status/timer writes |
| Settings | Timezone, selected holidays/birthdays, notification preferences/devices, email enable/disable and recipient changes | Setting/entity reference; readable status/date changes and private-field-changed markers |
| Notifications/reports/email | Notification actions, report first available, queued email and meaningful delivery outcomes | Notification/job/report-period reference, system attribution, sanitized outcome code; no message body/PDF |

Do not log every read, page visit, polling request, unchanged save, or routine
worker heartbeat. Record failed save attempts separately from successful changes;
a validation error is not evidence that a database change happened.

### Finance semantics and preserved identity

A 2,000 CAD reimbursement allocated 1,000 to School and 1,000 to Rent remains one
incoming payment. Record the allocation decisions separately, with both payment
and expense references. Do not emit two new income entries or pretend that
changing an allocation changed the bank amount. Editing an expense category can
also change the category attribution of its linked repayments; log the actual
category edit once rather than one event for every recalculated chart value.

Setting a real account balance records a correction event with its own entity
kind. It must not appear as a transfer, expense, income or duplicate transaction.
Capture the previous correction/closing date when one is replaced, as well as the
previous calculated balance. Preserve enough allowed before/after data to explain
a same-date overwrite even after the checkpoint is updated again.

Changing an income source's type or renaming a type can change historical display
labels without changing deposits. Log the setting change once, including the
stable source/type IDs; do not generate fake income edits for every linked record.
Likewise, editing a shared person logs one People action rather than an edit to
every task and reimbursement that displays their name. An actual task assignment
or reimbursement contributor change is a separate domain action.

### Explicit exclusions

- Global-search requests, query text, result snippets, result sets and browser
  query state must never enter audit history. Keep search's memory-only privacy
  behavior; a query is not an action to retain.
- Opening Quick add, expanding phone quick actions, switching tabs, changing
  unsaved filters, previewing a practice and viewing balances/reports create no
  audit entries. Saves use the same server command regardless of their UI entry.
- Do not record Knowledge typing/autosave-like temporary draft updates, repeated
  upload lease/cleanup steps, or every generated verb form as separate user actions.
  Record a meaningful committed article/image action or a bounded maintenance
  summary if that cleanup is explicitly included in coverage.
- Reading/exporting logs and inserting audit rows must not themselves produce
  recursive audit events. Retention deletes do not create one event per row.
- Existing exports and original-document downloads remain authorized reads; they
  are outside initial logging scope. Adding download auditing later requires an
  explicit privacy/volume decision, not an assumption that every read is tracked.

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

Keep entity identifiers as bounded strings so integer IDs and UUIDs are supported.
Use an allowlisted optional related-reference list in `changes` for actions such
as payment-to-expense allocations; it must not become a copy of linked records.
Represent the difference between an intentional signed-out request and a worker;
never attribute a worker to the owner just because both use database owner ID 1.

Keep existing detailed histories authoritative. New commands can write a compact
global entry referencing their existing work activity or article revision, without
copying those full payloads. Do not add a second canonical financial record.

## Recording reliably

Introduce a shared server-only writer used by domain services. For a database
mutation, write its audit entry in the **same transaction**: both commit or both
roll back. Deletion captures an allowed summary before deleting its source.
Retrying the same request should neither repeat the mutation nor duplicate its log.

A unique audit key alone does not make a business mutation idempotent. Reuse the
existing Work mutation receipt, finance request/match identity, practice
`sessionKey`, record revision or worker deduplication key as appropriate. Where
none exists, define the command's retry/conflict behavior before instrumenting it.
An audit key must remain stable across a retry, while allowing a later intentional
repeat of the same kind of change. In particular, do not deduplicate all balance
corrections by checkpoint ID: a same-date correction reuses that ID. The successful
account balance revision can distinguish committed corrections.

Emit events at the semantic command boundary, including supported worker commands.
Avoid a blanket Prisma interceptor: individual row updates lack business context,
can duplicate existing histories, and do not guarantee coverage of raw SQL or
database maintenance. Group bulk operations and recurring occurrence generation.

Some configuration routes currently perform a single direct Prisma write. Move
those writes into a small service transaction or wrap the owned read, meaningful
change comparison, update and audit insert in one transaction. Calling an audit
helper afterward would leave a committed change without its history if logging
fails. Avoid unrelated endpoint rewrites while establishing that boundary.

For ordinary database mutations, an audit insert failure rolls back the command
and returns a normal save error. Retain existing locks, expected revisions and
serializable retries. Avoid logging unchanged saves or retries that return an
already-committed result. Keep metadata construction bounded and query existing
transaction state rather than loading whole histories. Measure representative
save latency; do not promise the additional write is always negligible.

Authentication is a separate flow. Explicitly define failure handling there: a
failed sign-in audit insert should emit a generic server diagnostic without
revealing credentials or making the site unusable. Do not advertise guaranteed
capture across database outages. Other rejected/failed attempts can be recorded
after the business transaction rolls back, with sanitized error codes and bounded
volume; never persist unfiltered exception messages.

### Workers and external delivery

Record a weekly report becoming available once per owner/completed period, using
the existing report/notification identity. Reading its page or regenerating a
preview is not a new report-available event. Group recurrence generation under
its series and batch; retries and read-triggered occurrence checks must not
produce repeated "task created" events when no new occurrence was saved.

Email/PWA delivery cannot be included in a database transaction that also
atomically controls the external provider. Reuse the existing queue, claim token
and deduplication keys. Couple an audit entry to the committed delivery-state
transition where practical; do not hold a transaction open across a network send.
A replay or poll must not emit the same transition repeatedly. Audit failures
must not cause a second send of an already accepted message. Preserve uncertain
outcomes rather than retrying blindly or fabricating success.

For email, distinguish **Queued**, **Accepted by provider** (the existing `SENT`
state), **Failed**, and **Unknown**. Provider acceptance does not prove delivery
to the mailbox or that the recipient read it. Apply the equivalent distinction
to push delivery. Record snooze/dismiss/read/preference changes at their command
boundary if included; do not log inbox polling, queue claims, lease refreshes,
every retry counter, or empty worker cycles.

Audit logging must not send email or push notifications of its own. Changing email
permission or the recipient should record allowed setting changes while preserving
the existing permission gate, pending-message invalidation and uncertain-send
handling. Store a recipient-changed marker rather than copying addresses/payloads.

### Instrumentation map

This is the current starting map, not a claim that instrumentation already exists.
Review all supported mutations in each area before declaring that area complete.

| Area | Existing entry points/boundaries | Integration requirement |
| --- | --- | --- |
| Owner authentication | `src/lib/auth.ts`, `src/lib/owner-policy.ts` | Add successful sign-in/sign-out events and bounded denial capture; use verified server identity and the explicit owner mapping |
| Work/projects/calendar | `src/lib/work-management/` command services and `activity-server.ts`; `src/lib/recurrence/engine.mjs` | Reuse existing transaction clients/receipts and activity origins; one semantic event per intended action/batch |
| Finance movements and supporting metadata | `src/lib/finance/transaction-server.ts`, `activity-server.ts`, `receipt-server.ts`, `income-server.ts` | Audit at the user command's outer transaction; suppress nested duplicates when an income/expense save also creates its movement/document |
| Reimbursement tracking and allocations | `src/lib/finance/reimbursement-server.ts` | Instrument plan save/remove, allocation save/unlink under the current owner lock/transaction; capture state before updates/deletes |
| Manual account balances | `src/lib/finance/balance-server.ts` → `setAccountBalance()` | Insert within the existing serializable transaction; retain revision conflicts and keep correction events distinct from ledger movements |
| Statement imports/matching | `src/lib/finance/statement-server.ts`, `fixed-statement.ts`, `matching-ledger.ts` | Distinguish draft/match/save/unlink outcomes; retain confirmed match-event origins and canonical payment IDs; no CSV row payloads |
| Finance configuration | `src/lib/finance/income-settings-server.ts`; `src/app/api/finance/accounts/`, `categories/`, `income-source-types/` | Cover account/category/source/type/deduction changes, including direct Prisma route writes that need transaction wrappers |
| Shared People | Work contact commands in `src/lib/work-management/server.ts` and `/api/work-contacts` handlers | Log the directory entity once, preserve its links, and distinguish directory edits from domain reassignment |
| Knowledge | `src/lib/knowledge/server.ts`, `core.ts`, `folders.ts`, `templates.ts`, `images.ts` | Reuse article/Work-note revisions and command receipts; cover folders/templates/links/files without copying Markdown or draft contents |
| Japanese | `src/lib/japanese/practice-sessions.ts`; `/api/japanese-practice/vocabulary/` and category handlers | Log a committed practice once with result/reward summary; cover readings, categories, starring and generated forms as bounded vocabulary actions |
| User preferences/annual dates | `/api/settings` and its email/holiday/birthday routes; notification settings/device handlers | Preserve timezone and recurrence distinctions; mask private fields; wrap direct writes where necessary |
| Notifications/reports/email | `src/lib/notifications/`, `src/lib/email/preferences.mjs`, `queue.mjs`; `scripts/notification-worker.mjs` | System attribution for generation/delivery, owner attribution for explicit preferences/actions, stable transition keys and separate external-send failure handling |

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
- Reimbursement allocated — CAD 1,000 to Rent from payment #1900.
- Bank balance corrected — CAD 1,250.00 → CAD 1,300.00.
- Income source type changed — Employer / Freelance → Employment.
- Japanese practice saved — 25 words — Yesterday, 8:42 pm.
- GitHub owner signed in — Yesterday, 8:10 am.

Provide collapsible filters for date range, module, action and outcome, plus search
by reference or short summary. Use bounded cursor pagination and responsive rows
or cards. Clicking an entry opens a centered read-only detail modal with allowed
before/after values and an Open record button. Deleted records keep their history
with a clear “Record deleted” state. Existing revision history remains accessible
from its own module. Build canonical links through existing helpers where
available: `activityHref()` for financial movements and `occasionHref()` with a
valid occurrence for holiday/birthday records. People link by directory ID;
balances and source-type events can open their Finance settings page. Historical
entries must survive renames/deletions without relying on a still-existing source
foreign key. Do not mark a merely archived source as deleted.

Keep the responsive sidebar/mobile navigation conventions. Logs does not need an
additional phone quick-action icon or another Quick add action. Date-only closing
and financial dates must remain date-only; audit timestamps use the selected
dashboard timezone. Do not add Logs to global-search result adapters initially:
that is a separate scope decision, and search itself must remain unlogged.

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
For People, contact email/phone/notes edits use field-changed markers; do not
copy the directory's private contact details. Practice entries use counts and
reward totals, not the full practiced word list. Email entries use job/status
references, not recipients, PDFs or message bodies. Search content is excluded
entirely. Do not persist failed form bodies while recording a rejected attempt.
Avoid storing IP addresses and full user-agent strings by default. Apply size
limits to summaries and metadata.

A practical initial policy would retain global logs for 180 days, with denied
authentication attempts kept for 30 days and rate-limited to prevent flooding.
Retention must not purge work notes, article revisions, financial matching history,
or source records, balance checkpoints, reimbursement allocations, notification
state or email delivery state. Document this distinction and include the new table in the
existing full-database backups. Treat it as append-only through application APIs;
it is not tamper-proof against someone with database administrator access.

## Proposed implementation order

1. **Contract and foundation:** finalize the per-command coverage matrix, event
   names, allowlisted metadata, actor/owner rules, failure behavior and retention.
   Add the additive model/migration, shared server-only writer and cursor contract.
   Preserve all existing IDs and histories. Test transaction rollback and replay
   keys before enabling recording.
2. **Work/calendar and authentication:** integrate existing transactional commands
   and activity origins, shared People, annual-date/recurrence operations, and
   authentication hooks. Confirm renewal/page refresh does not create sign-ins
   and unchanged occurrence checks do not create events.
3. **Finance:** cover movements/documents/imports and every configuration mutation,
   including reimbursement tracking/allocations, account balance corrections and
   source types. Add transaction boundaries to direct-write handlers. Verify
   category attribution, statement matching, ledger totals and balances are
   unchanged by enabling logging.
4. **Knowledge, Japanese and preferences:** cover folders/templates/images/links,
   committed vocabulary/reading edits and saved practices with XP/gold. Instrument
   settings changes and explicitly selected notification actions. Keep drafts,
   previews, global search and normal reads outside capture.
5. **Workers and delivery:** instrument report availability, recurrence batches and
   selected queue outcomes with existing deduplication/lease semantics. Keep
   external delivery and authentication failure behavior separate from ordinary
   transactional saves. Document covered scripts; treat other scripts/restores as
   outside coverage until explicitly instrumented.
6. **Logs interface:** build the owner-only page, filters and read-only detail
   modal with canonical links and missing/deleted states. Display coverage start
   dates per area if integrations were enabled at different times. Optional
   historical adapters must retain original timestamps and unique origins, and
   identify imported entries; never reconstruct missing past changes from current
   balances, links or mutable settings.
7. **Operations and completion:** add bounded retention, full-database backup/
   isolated-restore verification, maintenance instructions and final regressions.
   Keep the feature marked partial until the coverage checklist is satisfied.

## Acceptance checklist

- Owner guards run before input/data access; primary and related entities remain
  owner-scoped. Denied authentication attempts are visible only to the owner.
- A failed database mutation/audit insert rolls back both. An intentional new
  command gets a new event; retry/replay of the same committed command does not.
  Unchanged saves, revision conflicts and validation failures do not claim success.
- Task/project/event IDs, notes, dependencies, recurrence identities and existing
  detailed histories remain intact. A generated batch has bounded entries.
- One transfer produces one semantic event and preserves its two ledger legs.
  An income/expense plus its supporting record does not generate duplicate
  top-level creation events from nested helpers.
- A 2,000 CAD payment allocated to two 1,000 CAD expenses keeps one bank movement.
  Allocation edit/unlink records reference both endpoints and preserves amounts,
  statement links and the expected category/outstanding calculations.
- Multiple contributors and partial payments retain their original identities.
  Removing a plan/link captures allowed before-state before deletion.
- A manual balance correction does not become a financial transaction. Two
  intentional same-date corrections produce two audit events even though they
  share a checkpoint ID. Stale revisions produce no successful audit entry.
  Same-day/backfilled activity and per-currency balances still calculate correctly.
- Income-type rename/reassignment/deactivation logs the actual setting change;
  existing deposits and history remain intact. Shared People changes are not
  repeated for every linked task/expense.
- A retried Japanese session logs once and awards XP/gold once. Word statuses,
  review timers, multiple readings and generated forms retain current behavior.
- Knowledge article revisions remain accessible. Folder/template/link/inline-image
  actions are covered without storing bodies, draft content or original files.
- Email/push outcomes distinguish provider acceptance, failure and uncertainty.
  Retries and audit failures do not duplicate delivery. Disabled email permission
  remains effective; logging does not itself send any email or push message.
- Searches, previews, quick-action menu clicks, page visits, polling and log reads
  create no audit entries or persisted search text. Test successful and failed
  search requests for this exclusion.
- Summaries, allowed differences, canonical links and pagination are bounded;
  snippets render as text. Masked fields, sanitized errors and deleted sources
  cannot leak private content or create unsafe navigation.
- Desktop and phone layouts support collapsed filters, modal dismissal/focus,
  date-only values and dashboard-timezone instants without horizontal overflow.
- Retention deletes only eligible global audit rows, using the shorter denial
  policy, and never recursively logs each deletion. Domain histories, checkpoints,
  files and delivery state survive. New audit rows survive a full-database
  backup/isolated restore.
- Measure representative task, finance and practice saves with realistic data;
  confirm grouped entries, bounded inserts and no unnecessary history scans.
  Do not assert performance or test success without executing the checks.

No additional container is required: Next.js, Prisma and PostgreSQL can host
this. Bounded retention can use the existing worker/scheduling pattern. The
implementation must not introduce another email provider, search service or
financial ledger. Implementation was authorized separately by the owner.
