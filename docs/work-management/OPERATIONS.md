> Current-code note: this file records each implementation phase. Old browser commands for inline task capture, contexts, rewards and task key dates are historical; those fixtures were removed during cleanup. Use the current browser-test mapping in [README.md](README.md#current-cleanup-and-verification). Applied migrations and historical preservation evidence remain necessary.

# Work-management operations and compatibility

Use CONTEXT.md and the assigned phase as the execution boundary. These commands
are development/disposable procedures, not permission to operate on production.
Never combine the standalone work-test Compose file with production Compose.
The completed architecture, cumulative rehearsal, compatibility limits and future
deployment checklist are in [HANDOVER.md](HANDOVER.md). Opt-in isolated examples
are in [SYNTHETIC_EXAMPLES.md](SYNTHETIC_EXAMPLES.md). Earlier sections below retain
their phase-specific history; PROGRESS.md records what actually ran.

## Current task-page and reward behavior

The subsequent usability redesign retired task XP/coin rewards. Completion and
reopening now leave User balances and historical applied-reward snapshots alone.
Nonzero reward configuration is rejected; zero-valued old requests remain
compatible. Quest rewards are unchanged; Japanese practice now has separate
per-session XP/gold rewards. This supersedes the original
phase-specific payout/reversal behavior described below; historical migrations
and baseline evidence must not be rewritten to remove the old columns.

Current task layout, combined management routes and display settings are described
in [Display and navigation](../DISPLAY_AND_NAVIGATION.md). Task details prioritize
description, files and notes; relationships are a single typed scrolling list,
and project/stage selection is compact. The later Japanese practice reward fields
require the additive
`20261115120000_japanese_practice_rewards` migration. Task closure now archives
automatically; reopening returns the task to active work. Completed history and
project progress retain closed tasks. Inline session scheduling uses the existing
event command and supports the saved display timezone and clock changes.

Task scheduling and focus now live in the task header. Deadline/follow-up cards
are directly below the title; edits use centered dialogs with backdrop/Escape
cancellation. Sessions/events remain an always-open list below relationships.
Notes only now includes resolved follow-ups, with owner-scoped SQL pagination
across both record types and no duplicated note writes. Task key-date commands
are retired (410), old records stay intact, and project milestones retain their
own calendar layer. See the display/navigation document for current UI behavior.

## What changed

- `src/lib/work-management/server.ts` owns the current seven-status task/event/
  checklist commands. Every writer takes the same PostgreSQL transaction-scoped
  owner lock (namespace 62019, stored owner user 1), then reads/validates/writes.
- `validation.ts` handles IDs, bodies, values, revision/replay headers and sanitized
  errors. `client.ts` sends guarded requests and retains replay keys when a network
  response is lost or unreadable. Existing URLs and response record shapes remain.
- The additive `20261109120000_work_mutation_safety` migration adds task/event/
  checklist revisions, task reward-accounting state and WorkMutationReceipt. No
  original field, timestamp, status, priority, link or User balance is rewritten.
- Phase 02 adds task statuses, contexts, metadata, closure/archive and automatic
  activity. Task dates, projects and work documents remain later phases.
- Base development Compose no longer seeds automatically. Existing demo seeding
  is an explicit operator action; never run it against restored user data.

## Reward baseline decision

Existing rows are labelled `LEGACY_BASELINE`. Existing Done rows use their current
reward amounts as the compatibility reversal baseline; other rows start at zero.
This preserves the previous intended reopen behavior without claiming that an
historical payout occurred. Migration does not credit/debit User balances or invent
payout events. Actual historical payouts remain unknown and were not reconstructed.

After cutover, entering Done applies the server-side configured reward once in the
task transaction and stores that amount. Reopening reverses that stored amount
once; editing a Done task's configured reward does not rewrite the applied amount.
Task deletion keeps previously earned balances, matching prior delete behavior.
Negative balances are not silently clamped or repaired. Arithmetic is checked for
the database integer range before applying a transition.

The old board was the only source caller of `/api/users/rewards`; it no longer
calls that endpoint. The endpoint now returns 410 to prevent old clients replaying
separate task balance adjustments. Quest reward code is not replaced.

## API compatibility

- Owner checks remain the first action in every handler. All task/event and
  relationship lookups are scoped to `OWNER_DATABASE_USER_ID = 1`, explicitly
  mapped independently from the pinned GitHub identity. Foreign records are not
  reassigned or disclosed through related-record serialization.
- Mutations require `Idempotency-Key: <UUID>`. Editing/deleting records additionally
  requires `If-Match: "<revision>"`. Checklist creation uses the parent task version;
  checklist edits/deletes use that checklist row's version and increment its parent.
- Missing versions/keys return 428; stale versions/conflicting keys return 409;
  invalid input returns 400; inaccessible/missing owned records return 404.
  Reload old browser tabs after cutover. Anonymous/non-owner requests still return
  401/403 before parsing input or touching data.
- Identical committed retries return the recorded result, including after deletion.
  Reusing a key for another command is rejected. Keep receipts for now: deleting
  them casually can allow an old create request to be executed again. Receipts are
  technical replay results, not an editable activity feed or historical payout log.
- Omitted dependency is unchanged; explicit null clears it. Status checks validate
  the resulting prerequisite. Existing invalid edges stay reviewable; new edges
  cannot create/join cycles, including concurrent opposite-edge requests.
- Event deletion only deletes that event. Task deletion is rejected if another
  task depends on it; otherwise checklist deletion and owned event unlinking are
  atomic. Linked events survive and receive a new revision when unlinked.
- A repeated create-linked-todo operation reuses the existing owned link, never
  overwrites it, and never infers a deadline from the event date.

## Read-only inventories

`npm run work:inventory -- --output <private-file> [--compare <before-file>]`
requires explicit `DATABASE_URL`, `WORK_MANAGEMENT_INVENTORY=1`, and a nonproduction
NODE_ENV. It uses a read-only repeatable-read transaction. Full canonical rows
(including exact SQL decimal/timestamp text), original column definitions, FKs,
indexes, enum values and migration checksums are stored privately. Console output
contains counts/issues only. Output is exclusive-create, mode 0600, outside public/;
use unique filenames. Container-created private files may need to be read through
the container because host/container user mappings differ; do not make them public.

Default comparison permits Phase 01 technical additions. Phase 02 requires a fresh
format-2 baseline and `--phase 02`; it permits only the reviewed Phase 02 columns,
catalog/activity tables, enum additions and future status default while checking
every original column, row ID, relation, timestamp, balance, FK and index.
New WorkActivity must be empty immediately after migration. Unknown owners/statuses/
priorities, orphan/cross-owner links, negative legacy rewards, cycles, failed or
checksum-mismatched migrations are reported for review. Exit 2 means review/diff;
exit 1 means capture failed. No repair or mapping is applied by inventory.

Example against the existing DEVELOPMENT container, before any migration:

```sh
docker compose -f docker-compose.dev.yml exec -T -e WORK_MANAGEMENT_INVENTORY=1 dashboard node scripts/work-management-inventory.mjs --output /app/private/work-management/before-unique.json
```

Inventories contain private data across the app and are ignored by Git under
private/. The additional schema-to-Prisma-model diff during Phase 01 reported one
pre-existing difference: ActivityVocab.lastPracticed exists in migration/database
history but not the current Prisma model. It was preserved, not dropped or repaired.
Do not use db push/reset to eliminate it.

## Isolated restore and migration rehearsal

`docker-compose.work-test.yml` is standalone: its own PostgreSQL database/volume,
no published DB port, explicit disposable credentials/URL, no production env_file,
separate .next/node_modules volumes, and no seed or automatic migration. It uses
the existing `dashboard-dashboard` development image; build that image first if
absent. Do not use a production image that lacks test/source files.

Choose a fresh project name for a new rehearsal; do not restore over an existing
database. The example project used for Phase 01 was dashboard-work-test.

```sh
docker compose -p dashboard-work-test -f docker-compose.work-test.yml up -d work-db
docker compose -p dashboard-work-test -f docker-compose.work-test.yml exec -T work-db psql -U work_test -d work_test -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public'"
```

Only restore if that count is zero. Stream a custom-format development pg_dump to
a unique ignored private file using umask 077 (container-side storage may be needed
for mapped permissions), then pg_restore it into work-db with --no-owner --no-acl
--single-transaction. Do not use --clean or a database reset. The dump includes
the whole database, not a selection of work tables. Keep the source development
database unchanged during the copy.

```sh
docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm runner node scripts/work-management-inventory.mjs --output /app/private/work-management/copy-before-unique.json --compare /app/private/work-management/before-unique.json
docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm runner npx prisma migrate deploy
docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm runner node scripts/work-management-inventory.mjs --output /app/private/work-management/copy-after-unique.json --compare /app/private/work-management/copy-before-unique.json
docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm runner node --test tests/work-management.integration.mjs
docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test tests/event-completion.integration.mjs
```

Re-running prisma migrate deploy must be a no-op; do not manually re-execute the
SQL file. The guarded work integration test only writes to work-db/work_test with
WORK_MANAGEMENT_DISPOSABLE=1 and cleans its synthetic records/balance changes.
For the restored legacy baseline check, also pass
`-e WORK_MANAGEMENT_MIGRATION_BASELINE=/app/private/work-management/copy-before-unique.json`
to the work integration runner before editing original tasks in that copy.
Sequence values may advance during tests; IDs of original records never change.

To compare against the current Prisma model read-only (exit 2 reports a diff):

```sh
docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm runner sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code'
```

The Phase 01 rehearsal verifies database restore/preservation, not recovery of
original finance document files. A complete application recovery also needs the
existing private financial-file backup. No new work upload root is added in Phase
01; document storage and its restore checks belong to Phase 04.

## Development cutover without seed

After a successful disposable rehearsal, capture a fresh development inventory,
apply only the reviewed additive migration explicitly, compare again, and recreate
the development app with the no-seed override. The base development command now migrates without seeding; use the override
when migrations must also remain explicit for baseline/preservation work.

```sh
docker compose -f docker-compose.dev.yml exec -T dashboard npx prisma migrate deploy
docker compose -f docker-compose.dev.yml exec -T dashboard npx prisma generate
docker compose -f docker-compose.dev.yml -f docker-compose.work-dev.yml up -d --force-recreate --no-deps dashboard
```

No production deployment is performed by these procedures. For a later authorized
deployment, use the reviewed migration and a complete verified backup. Selected
original columns remain readable, but a legacy client cannot interpret new task
statuses. General old-app reads are not guaranteed, and it MUST NOT accept writes
through its old reward protocol: it would desynchronize accounting state. Use a
maintenance/read-only window while resolving a failed cutover. Restoring an old
backup after new writes loses those writes unless they are recovered separately;
do not recommend an automatic blind restore.

## Verification commands

```sh
node --test tests/*.test.mjs
node tests/work-management.test.mjs
```

The optional browser test uses the isolated app on localhost:3002, its local test
secret and browser-only API fixtures; it does not save test activity to development.
Start it with `docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm -d --name dashboard-work-browser -p 127.0.0.1:3002:3000 -e NODE_ENV=development runner npm run dev`.
With Playwright/Chromium available, run
`RUN_WORK_MANAGEMENT_BROWSER_TEST=1 node tests/work-management.browser.mjs`;
NODE_PATH/PLAYWRIGHT_BROWSERS_PATH may point to a temporary installation. Stop the
temporary browser app when finished. Never publish it on all interfaces.

Keep exact executed evidence and outstanding checks in PROGRESS.md. Later phases
are not started by completing these operations.


## Phase 02 compatibility and lifecycle

`20261109130000_work_status_values` must commit before
`20261109130100_canonical_task_foundation` uses New as the future default.
Use `prisma migrate deploy`; never replay raw SQL or edit applied migration files.
Phase 02 rehearsal used project `dashboard-work-phase02` and fresh format-2
inventories. Add `--phase 02` to the after-versus-before comparison above. A
comparison never classifies legacy rows or repairs unsupported values.

- Canonical `Todo.priorityLevel` is Urgent/High/Normal/Low; raw `Todo.priority`
  remains preserved historical input. Migration maps 1/2/3/null to
  Low/Normal/High/Normal; other values stay unknown for review. API DTO `priority`
  projects 1/2/3/null (Urgent has no legacy equivalent); `legacyPriority` exposes
  the original value. An old numeric write maps to the named field without
  rewriting history; conflicting aliases are rejected. A legacy null write to an
  Urgent task returns 409 instead of silently downgrading it.
- New capture defaults New/Normal/Task and visibly selected Personal. Existing
  tasks retain original status, unknown context/kind and unknown closure dates.
  Work, School and Personal definitions do not authorize sample task seeding.
  If Personal is inactive, capture defaults to Unclassified. Contexts can be
  created, renamed, deactivated and reactivated, not deleted through normal APIs.
- `GET /api/todos` excludes archived records. `?archived=all` includes them;
  direct task URLs continue to work. Cancelled tasks remain accessible through
  the board's closed section. Archive neither completes a task nor changes rewards,
  checklists, dependencies or independent event associations. Restore before
  changing an archived task's status. Cancelled prerequisites do not count Done.
- Entering Done sets a server completion time; Cancelled sets a cancellation time.
  Legacy Done keeps unknown completion time on ordinary metadata edits. Explicit
  reopening clears the current closure fields, while audit retains previous facts.
  Accepted-workaround closure requires persisted/supplied workaround, explicit
  confirmation and a completion explanation. Summary is optional otherwise.
  Do not erase required workaround evidence while a task remains closed that way.
- Automatic WorkActivity is written in the same locked transaction as tasks,
  rewards and replay receipts. No normal update/delete audit API exists. Privileged
  DB maintenance remains possible; this is application append-only history, not
  tamper-proof storage. Deleting a task preserves facts and its TASK-0001 reference
  while detaching the nullable FK. Context rename does not rewrite old snapshots.
  Recent changes exposes the latest 100 entries; full notes/timeline is later work.
- New guarded endpoints: `/api/work-contexts` GET/POST,
  `/api/work-contexts/[id]` PATCH, `/api/todos/[id]/activity` GET. All require owner
  authorization; context writes use the same revision/replay protocol.
- Title-only capture remains available. Metadata controls are a foundation;
  full list/detail redesign and contacts belong to Phase 03. Existing calendar
  events stay independent and no task deadline is inferred from an event.

Additional guarded tests:

```sh
node tests/work-foundation.test.mjs
docker compose -p dashboard-work-phase02 -f docker-compose.work-test.yml run --rm runner node --test tests/work-foundation.integration.mjs
RUN_WORK_FOUNDATION_BROWSER_TEST=1 node tests/work-foundation.browser.mjs
```

The foundation browser test writes/cleans synthetic zero-reward tasks in the
isolated app only. Audit facts intentionally survive their deletion there. The
migration edge-case test requires a separate restored `work_legacy_fixtures` DB
and `RUN_WORK_FOUNDATION_MIGRATION_TEST=1`, as guarded in its source; do not run it
against the primary development DB. Stop temporary browser/DB containers after
verification, keeping volumes and private evidence for review.


## Development Prisma cache after schema changes

The development singleton in `src/lib/prisma.ts` intentionally survives hot reload.
After changing/generated Prisma models, the running process may therefore still
use its previous client. `docker compose up -d` can leave an unchanged container
running; it does not guarantee a fresh process. Symptoms include task/context GET
500 responses while fresh-process database reads work correctly.

After explicit migration and `prisma generate`, force-recreate the development
app with the no-startup-mutation override as above. For an already-running app
that already uses that override, `docker compose -f docker-compose.dev.yml restart dashboard`
also clears the cached client without running migrations or seeds. A restart
uses the container's current startup command, so inspect that command first if
its origin is uncertain. Never remove database volumes to resolve a client cache.

Run the live owner check afterward, not just anonymous-denial checks:

```sh
docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs
```

This checks authenticated task lists, contexts and (when a task exists) details and
activity, as well as the other access-control checks. All requests are read-only
or preview-only; it does not create test tasks in the primary development DB.

## Phase 03 — All Work and contacts

`20261109150000_work_contacts` adds WorkContact, TodoAffectedContact and nullable
requester/waiting-contact links. Run the same whole-DB inventory/restore/rehearsal
procedure with a fresh project (Phase 03 used `dashboard-work-phase03`). Use fresh
format-2 inventories and `--phase 03` for the after/before comparison. It allows
only these additions, requires the new tables to be empty at migration cutover,
and checks cross-owner people links. No old people/text fields are inferred.

After a successful rehearsal, inventory development, deploy explicitly, compare,
generate the client and force-recreate with the no-mutation override. Verify owner
reads with the live auth regression. Do not rely on `up -d` to refresh a running
Prisma singleton. The documented maintenance/read-only rollback rules still apply.

### Reading and filtering

- `/todos` is All Work; default list and optional board share one result page.
  `/todos/[id]` remains the canonical full-page URL. `?task=<id>` opens the same
  content in a desktop panel/phone full-screen dialog. Full-page return links
  accept only `/todos` and its query string, never an arbitrary external URL.
- `/api/work-items` GET returns `{items,total,page,pageSize}` with 30-row pages,
  deterministic ID tie-breaks and page clamping. It is read-only and owner-scoped.
  Both UI modes use exactly these results. The original `/api/todos` array API
  remains available to existing callers; it was not silently changed to an envelope.
- URL/API filters: `q` (reference/title/description), `context` (ID or `none`),
  `company`, `course`, `system` (case-insensitive contains), `tag` (exact stored tag),
  `person` (contact ID in requester/affected/waiting roles), `kind`, `status`,
  `priority`, `sort` (updated/created/priority/title) and `page`.
  `kind=none`/`priority=none` expose unknown legacy values. No date/project filter
  is implemented before the authoritative models exist.
- `view=active` is unarchived open work; `history` is unarchived Done/Cancelled;
  `archived` includes archived tasks of any status; `all` includes every unarchived
  status. API criteria combine explicitly. The UI moves a selected open/closed
  status into the corresponding view when necessary; switching views clears status.
- Quick capture defaults to the selected active context, otherwise active Personal;
  Unclassified stays selectable. A filtered inactive context defaults capture to
  Unclassified rather than silently assigning inactive data. Title alone suffices.
  Task details retain personal rewards; no separate reward writer was added.

### Contacts and people

- WorkContact has a name, optional company, active flag, owner, revision and server
  timestamps. Contacts are organizational records, not app users/assignees/tenants.
  Name collisions are allowed; company and ID distinguish people.
- `/api/work-contacts` GET searches/paginates 30 contacts; POST creates.
  `/api/work-contacts/[id]` GET reads and PATCH edits/deactivates/reactivates.
  No DELETE route exists; restrictive FKs protect task associations. All handlers
  check the owner before parsing, searching or mutating. Writes use replay/version
  protection and the same owner lock as tasks.
- Task writes accept nullable `requesterId`, nullable `waitingOnContactId` and
  `affectedContactIds` (unique IDs, up to 30). Omitted fields preserve associations;
  null/empty explicitly unlinks. Existing inactive associations may be retained or
  unlinked, but new inactive or foreign assignments are rejected. Contact labels
  remain visible on old tasks. Free-text `waitingOn` remains available for shipments
  or other things, independently from a waiting contact.
- People replacements, task revisions, reward state, automatic audit and replay
  receipts are atomic. Renaming a contact does not rewrite earlier activity
  snapshots. Explicit task deletion unlinks its affected people while preserving
  contact rows and recorded activity facts. No contact seed/backfill is run.

### Drafts, navigation and verification

Explicit close/link actions and full reloads guard unsaved forms. Next browser
Back cannot reliably be stopped by a page-level popstate listener; task drafts are
instead kept in browser memory and restored when reopened. They retain the old
revision, so an intervening server change still causes a conflict rather than
silently overwriting it. Quick-capture and contact drafts also survive client
navigation, with pending creation retry keys retained. Save/discard clears drafts.
Nothing is written to localStorage or to the DB until a real command succeeds.
A confirmed hard reload or tab/browser close loses browser-memory drafts.

Run existing regressions plus:

```sh
node tests/work-all.test.mjs
docker compose -p dashboard-work-phase03 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-management.integration.mjs tests/work-foundation.integration.mjs tests/work-all.integration.mjs tests/event-completion.integration.mjs
RUN_WORK_ALL_BROWSER_TEST=1 node tests/work-all.browser.mjs
```

Browser tests require the isolated app/secret on localhost:3002 and temporary or
existing Playwright/Chromium paths; never point them at the primary dev app.
Synthetic zero-reward tasks are deleted through guarded APIs after normal test
completion; audit facts remain. Synthetic contacts are deactivated and retained
inside the disposable DB because normal APIs intentionally cannot delete them.
Interrupted tests may leave synthetic fixtures there. No test data is seeded into
the primary development DB. Full production migration approval is a later phase.

## Phase 04 — Notes, activity and private attachments

Migration `20261109170000_work_notes_and_attachments` adds WorkNote,
WorkNoteRevision and WorkAttachment, plus an optional WorkActivity FK to a note
revision. Existing task rows and automatic history are not rewritten. Rehearse on
a whole-database restore using fresh format-2 inventories and `--phase 04`.
Comparison allows only these additions and requires the new tables to be empty at
cutover. Inventory also flags cross-owner supporting records and cross-task note
activity associations.

### Notes and history

- Notes are separate from description/next action and need no attachment. New
  recorded timestamps/actors come from the server. Optional occurred-at accepts an
  explicit-offset ISO timestamp; the UI labels entry in your browser's local time
  and displays history in Toronto time. Occurred-at never determines feed ordering
  or replaces created-at.
- Current note, immutable revision snapshot, automatic activity and replay receipt
  commit atomically under the existing owner lock. Meaningful edits increment the
  note revision and retain earlier content/links/occurred-at. No-op saves do not
  fabricate another revision or activity entry. Notes do not increment the parent
  task revision or overwrite a concurrent task metadata draft.
- Notes only shows one current note/tombstone per note; All activity also shows
  automatic changes and each recorded note version. Both paginate at 20 entries,
  with stable recorded-time/ID ordering. Revision history paginates at 20 versions.
  Automatic entries and previous versions have no normal edit/delete APIs.
- Remove note is a soft removal, not secure erasure. The current body/links are
  cleared and a tombstone/version is added; earlier text remains accessible in
  revision history. The confirmation states this. Privileged permanent redaction
  would need a separate reviewed maintenance procedure; none is implemented.
- Rendering uses escaped multiline plaintext and explicit HTTP/HTTPS links, up to
  10 links of 2,048 characters and 50,000 note characters. Embedded credentials,
  active URI schemes, malformed dates and writable recorded timestamps are
  rejected. External links use no-referrer/noopener; nothing fetches their content.
- Tasks with any note or attachment records must be archived rather than hard
  deleted. Restrictive FKs and the task service preserve revision/audit chains,
  including removed-note/removed-file history. Task deletion remains available
  when it has no supporting records and passes the existing dependency checks.

### Private files and lifecycle

- `WORK_UPLOAD_DIR` defaults to `private/work`; Compose uses `/app/private/work`
  with its own persistent volume (`work_files_dev` / proposed `work_files`). It
  must not overlap finance storage or public files, including filesystem aliases.
  New production Compose/environment changes are proposed deployment artifacts;
  Phase 04 did not deploy them. Development storage was mounted during cutover.
- `src/lib/documents/private-files.ts` provides bounded reads, byte/type checks,
  opaque keys and private filesystem access; the work adapter maps actionable
  errors. Finance upload/storage services remain unchanged. The passive PDF canvas
  renderer is shared through `src/components/documents/PrivatePdfPreview.tsx`;
  financial record/download authorization is not reused for work documents.
- Images/PDFs: at most 15 MB; JPEG/PNG/WebP/single-frame GIF, at most 40 megapixels.
  SVG/HTML, unsupported formats, corrupt images and declared MIME mismatches are
  rejected. HEIC must be exported as JPEG. PDFs require a supported header and
  coherent final xref/EOF structure; this is structural validation, not a malware
  scan or a guarantee that every third-party PDF variant is supported. Preview is
  passive PDF.js canvas rendering, not an embedded executable document viewer.
- Original bytes are retained without image conversion; names are stripped of
  paths/control/directional characters and bounded to 200 characters. UUID file
  keys are server-generated. Directories/files are 0700/0600; reads reject
  symlinks, non-files, traversal and size/hash mismatches. Responses are owner-
  checked, no-store, MIME-protected and sandboxed, with no-referrer/same-origin
  protection. Finance files cannot be selected by storage key through work APIs.
- Replacement writes/validates the new file before committing the new pointer,
  revision, activity and obsolete-key list. Only after commit are old bytes
  removed. A failed DB command cleans an unreferenced staged file; an ambiguous
  commit is checked before deleting anything. An unreachable DB leaves a private
  orphan for maintenance rather than risking an active original.
- Removal first commits a tombstone and durable pending-deletion keys, then unlinks
  bytes. Failed unlink/cleanup keeps a retryable record and visible Retry file
  cleanup action. Cleanup only touches obsolete/removed keys, never an active
  original. Repeating the confirmed command does not duplicate activity or files.
  Replacement/removal does not retain old file bytes indefinitely; back up first
  if you need previous originals. Filename/hash change facts remain in history.
- A crash can leave an orphan between file and DB commits. Keep all storage roots
  private and include all files in backup. During maintenance, quiesce writers and
  compare files with current storageKey and pendingDeletionKeys before considering
  any orphan removal. Do not delete unfamiliar UUID files blindly. No scheduled
  orphan purge or external document service is introduced.

### APIs, drafts and operations

All routes below require the GitHub owner before parsing or accessing data; parent
and child IDs are checked together, including downloads and revision history:

- `/api/todos/[id]/notes` POST; `/notes/[noteId]` PATCH/DELETE (soft removal).
- `/notes/[noteId]/revisions` GET; `/timeline?filter=notes|all&page=...` GET.
- `/attachments` GET/POST; `/attachments/[attachmentId]` PATCH (replacement)/DELETE.
- `/attachments/[attachmentId]/file` GET (`?download=1` for original download).
- `/attachments/[attachmentId]/cleanup` POST for pending physical cleanup.

Creates use Idempotency-Key; note edits/removals and attachment replacement/
removal/cleanup also use the child If-Match revision. Uploads use a file-only
multipart form; notes use bounded JSON with body/documentationUrls/occurredAt.
Selected files/note drafts survive client Back navigation in memory, with retry
keys preserved; explicit exits/reload warn about unsaved work. Confirmed reload or
closing the tab loses unsaved drafts. Save note and Upload attachment are separate
commands; neither is implied by the task metadata Save button.

Work task/contact search URLs are excluded from Next development access logging,
like finance. Errors log fixed descriptions, not note bodies, filenames, paths,
tokens or real contact details. Reverse-proxy/host log policy must independently
omit sensitive query strings on work/finance routes.

For storage cutover, stop the DEVELOPMENT app after inventory, run the reviewed
migration/generate explicitly using the development configuration, then recreate
with the no-startup-mutation override and compare inventories. This prevents
uploads between schema change and mounting the new root. Do not use these commands
against production without a separately approved deployment:

```sh
docker compose -f docker-compose.dev.yml stop dashboard
docker compose -f docker-compose.dev.yml -f docker-compose.work-dev.yml run --rm --no-deps dashboard sh -c 'npx prisma migrate deploy && npx prisma generate'
docker compose -f docker-compose.dev.yml -f docker-compose.work-dev.yml up -d --force-recreate --no-deps dashboard
```

### Combined backup and isolated recovery

The existing NAS `scripts/backup-database.sh` remains a whole-database-only backup;
notes/history are included automatically, but original uploads are outside the DB.
For a database plus all private original files, use the host-side combined tool:

```sh
node scripts/finance-backup.mjs backup docker-compose.dev.yml /secure/backups/dashboard-new-unique-directory
node scripts/finance-backup.mjs verify /secure/backups/dashboard-new-unique-directory
```

Version 2 manifests include all public-table fingerprints, the entire DB dump,
finance `documents/` and work `work-documents/`, with original size/SHA-256 checks.
The tool briefly stops the identified app container and restarts it if previously
running. Pause other writers too, use persistent volumes, and check app health
when finished. It refuses an existing destination; a directory without a completed
manifest is incomplete. Restore verification uses a fresh network-isolated
PostgreSQL container and temporary file directories, never a live DB/volume.

For a real recovery restore into new empty volumes using the matching app/PG
version, restore `documents/` under FINANCE_UPLOAD_DIR and `work-documents/` under
WORK_UPLOAD_DIR with application ownership and 0700/0600 permissions. Verify before
exposing traffic or running later migrations. Version 1 manifests still verify
older finance-only backups; they do not provide work-file coverage. Configuration/
secrets, encrypted off-host copies and scheduling remain separate responsibilities.
See [finance maintenance](../FINANCE_MAINTENANCE.md) for the full recovery procedure.

The isolated Phase 04 rehearsal used `BACKUP_PROJECT=dashboard-work-phase04`,
`BACKUP_APP_CONTAINER=dashboard-work-phase04-browser` and
`BACKUP_DB_SERVICE=work-db` with the standalone test Compose. These optional
selectors are for choosing an explicitly matching environment, not permission to
mix an app from one project with a DB from another. Normal deployments retain
service defaults dashboard/dashboard-db and read upload paths from the selected
container without printing its environment. Never point test scripts at production.

Additional guarded checks:

```sh
node tests/work-support.test.mjs
docker compose -p dashboard-work-phase04 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-support.integration.mjs tests/work-all.integration.mjs tests/work-foundation.integration.mjs tests/work-management.integration.mjs tests/event-completion.integration.mjs
RUN_WORK_SUPPORT_BROWSER_TEST=1 node tests/work-support.browser.mjs
```

Browser tests use localhost:3002 and the isolated test secret. They retain archived
synthetic tasks/notes/attachments so recovery can be tested; no fixtures are added
to the primary development DB. Test work/finance volumes are persistent and remain
separate from real uploads. Physical phone camera hardware and production recovery
have not been tested. Phase 05 is not started by these procedures.

## Phase 05: canonical relationships and child tasks

`Todo.parentId` links independent tasks; existing `Subtask` rows remain checklist
items, with the same IDs, timestamps and endpoints. No checklist promotion runs.
Direct child progress counts Done/total, including archived children. Parent
closure checks every unfinished descendant (Cancelled is unfinished), records the
explicit acknowledgement and leaves every child untouched. No effort estimate or
implicit dependency is inferred from hierarchy. Reopen a closed ancestor before
attaching unfinished work beneath it. To remove a relationship from an archived
child, restore that child first.

`TodoDependency` is authoritative, directed dependent → prerequisite. Only Done
resolves a prerequisite. Waiting, workaround information, cancellation and archival
are independent. `TodoRelation` stores the smaller task ID first and is symmetric,
nonblocking and unique. Foreign keys use Restrict: unlink explicitly or archive;
hard deletion never cascades through tasks. Cross-context links are permitted.

All ordinary graph writes are in `graph.ts`, reached through the same owner lock,
version and idempotency policy as other work commands. Both linked tasks receive
new versions and activity. Parent edits also update old/new parents. Cycle checks
use iterative traversal and run after acquiring the lock; competing opposite-edge
or hierarchy requests cannot both succeed. New links cannot join a flagged legacy
path. Graph edits on an owned dependent can remove its preserved foreign legacy
prerequisite without exposing or changing the foreign task.

Compatibility:

- The retained database `Todo.dependsOnId` is a derived mirror: sole prerequisite
  when exactly one exists, null when zero or multiple exist. Readers use canonical
  edges, never synchronize on read. Omitted legacy PATCH leaves edges unchanged;
  explicit ID/null uses the graph writer only with at most one current edge.
  More than one always returns 409 rather than truncating the graph.
- The additive migration copies all non-null legacy tuples in the same direction,
  without touching original tasks/checklists/events/rewards/notes or inventing user
  activity. Existing self, cross-owner and cycle-path edges are preserved with
  `origin=LEGACY` and `legacyReviewReason`; they remain blocked until reviewed.
  Remove an invalid link explicitly, then re-add any valid link through the UI.
  A missing endpoint causes the FK/migration to fail rather than erase a tuple;
  investigate and restore before retrying. Never bypass constraints to deploy.
- The backfill's conflict-safe INSERT is tested twice on legacy fixtures; it
  is a migration operation, not an ongoing synchronization job. Do not schedule it.
- Explicit demo seeding no longer rewrites a task's dependency. Use the UI to add
  sample relationships; never run demo seeds on restored real data.

APIs (owner authentication first; all responses no-store):

- GET `/api/todos/:id/relationships?section=children|blocked-by|blocks|related&page=1`
  returns 20 links/page, stable IDs, totals and minimal navigation/status records.
- POST/DELETE that route accepts `{ kind, targetId }`, with kind `parent`, `child`,
  `blocked-by`, `blocks` or `related`, and the root's If-Match/Idempotency-Key.
- Creating a child through POST `/api/todos` includes `parentId` and the parent's
  current `parentRevision`; a stale parent cannot accept an unnoticed new child.
  PATCH cannot reparent; use the relationship command.
- GET `/api/todos/:id/transition?status=IN_PROGRESS|DONE|CANCELLED` returns a current
  review, task version and fingerprint. PATCH uses that version and
  `transitionToken`. A blocked transition also requires `allowBlocked: true` and
  `overrideReason`. Parent closure with unfinished descendants additionally needs
  `allowUnfinishedChildren: true`. These decisions get immutable activity entries.
  Recompute under the lock before rewards; changes to graph, prerequisite versions,
  descendant versions or the root invalidate the review, including ABA changes.
  Refresh review and explicitly acknowledge again after a 409. No silent override.
- Adding an unresolved prerequisite to already started/closed work is rejected.
  Move back to To do, add the link, then explicitly review start/closure.

Task details now offer separate Checklist and Relationships sections. Relationship
search includes closed tasks, optionally archived tasks, and paginated results.
Children open their own original task URL. Relationship drafts use browser memory
and the existing leave/discard guard, retaining the original revision; they are
not persistent work and a stale draft is not silently rebased. Metadata editing
and relationship submission are kept separate to avoid overwriting local edits.

Guarded checks (fresh disposable copy only):

```sh
node --test tests/work-relationships.test.mjs
docker compose -p dashboard-work-phase05 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-relationships.integration.mjs tests/work-support.integration.mjs tests/work-all.integration.mjs tests/work-foundation.integration.mjs tests/work-management.integration.mjs tests/event-completion.integration.mjs
RUN_WORK_RELATIONSHIPS_BROWSER_TEST=1 node tests/work-relationships.browser.mjs
```

Migration anomaly test `tests/work-relationships-migration.mjs` requires
`RUN_WORK_RELATIONSHIP_MIGRATION_TEST=1`, the disposable guard and a separately
restored **pre-Phase-05** database named `work_relationship_fixtures`. It refuses
already-migrated databases. Its fixtures intentionally include invalid legacy
edges and must never run on the primary development database.

Use inventory `--phase 05` for this migration: it permits only parentId and the two
graph tables, validates exact backfilled tuple direction, and detects unexpected
parents/relations or historical activity. Inventories additionally report hierarchy
and canonical dependency cycles, foreign links, flagged legacy anomalies and mirror
disagreement. Review issues; inventory does not repair records. A repeat comparison
after cutover should show no differences. No Phase 06 dates or scheduling are added.

## Phase 06: deadlines, follow-ups and informational key dates

The server configuration `APP_TIME_ZONE` defaults to `America/Toronto` in
`src/lib/app-time-zone.ts`. It must be a valid IANA zone; invalid configuration
fails explicitly. The date API supplies the configured zone to browser controls.
No `NEXT_PUBLIC` configuration or browser/server system timezone determines the
meaning of task dates. This phase does not change finance/Japanese date handling
or the existing browser-local optional occurred-at note input.

Storage and boundaries:

- Todo owns the only current deadline: `deadlineDate` is a validated YYYY-MM-DD
  string, or `deadlineAt` is a timestamptz instant paired with
  `deadlineTimeZone`. All three null means no deadline. Database CHECK constraints
  enforce valid exclusive alternatives, real calendar dates and recognized zones.
  Calendar dates are never stored as fabricated UTC-midnight deadline instants.
- A date-only deadline becomes overdue after that date ends in APP_TIME_ZONE.
  An exact deadline becomes overdue strictly after its instant. Undated tasks have
  no due/overdue state. Closed/archived tasks have historical dates without an
  outstanding-action indicator. States are derived on reads, not stored flags;
  refresh a page to recompute when crossing a clock/day boundary.
- Entered exact times are wall time plus named zone. The server round-trips
  candidate offsets: a spring-forward gap is rejected, while a repeated fall-back
  time requires explicit earlier/later choice. Rendering includes the stored zone
  and GMT offset so repeated times are distinguishable. No silent DST adjustment.
- Follow-up date-only values become due on their configured local date; timed
  values at their instant. A follow-up is a next check, not a deadline/reservation.
- `WorkKeyDate` is informational: label and one date-only/exact value, with an
  ordinary required Todo foreign key. No generic parent ID or unattached records.
  Phase 08 can make todoId nullable and add projectId with a separate FK and XOR
  parent constraint. No project table or fake project parent is introduced now.

Lifecycle and preservation:

- `WorkFollowUp` keeps the original date, reason, creation time and resolved
  outcome. A partial unique index allows at most one ACTIVE row per task.
  Commands share the existing owner transaction lock, root task If-Match and UUID
  replay receipt. Two simultaneous creates/completes/snoozes cannot both apply.
- Complete/cancel resolves only the active follow-up. Snooze resolves it as SNOOZED
  and creates a linked replacement (`previousId`) in the same transaction. It can
  be explicitly rescheduled to a chosen calendar date/time; no hidden duration or
  automatic recurrence is inferred. Past dates are allowed for manual recording.
  Existing dates/outcomes remain in the paginated history and immutable activity.
- Closing or cancelling the task retires its active follow-up as CANCELLED with
  outcome TASK_CLOSED, atomically with closure, audit and rewards. Reopening never
  reactivates completed/cancelled/snoozed follow-ups or manufactures a reminder.
  Schedule a new one explicitly. The original deadline remains and is re-evaluated.
- Archival preserves an active follow-up but suppresses its action indicator;
  restoring an open task reveals its retained due state. Dates on archived tasks
  cannot be edited until restore. Informational key dates survive closure.
- Key-date removal is soft removal; old/new values remain in task activity.
  Tasks with any follow-up/key-date history require archival rather than permanent
  deletion. No linked calendar time or child task date is changed by these commands.

API and UI:

- GET `/api/todos/:id/dates?page=1&keyPage=1` returns deadline state, independently
  selected active follow-up, and separate 20-item pages of follow-up history and
  active key dates. Owner lookup precedes access; responses use no-store.
- POST the same route with existing root `If-Match` / `Idempotency-Key` and
  `{ action, ... }`. Actions: `deadline`, `followup-create`, `followup-complete`,
  `followup-snooze`, `followup-cancel`, `key-create`, `key-edit`, `key-remove`.
  A date is `{kind:"DATE",date:"2026-11-10"}` or
  `{kind:"TIME",local:"2026-11-01T01:30",timeZone:"America/Toronto",occurrence:"later"}`.
  Only deadline accepts null to clear. Resolve/edit/remove uses the owned record
  `id`; key dates use `label`, follow-ups an optional `reason`/outcome note.
- Task details offer progressively disclosed date forms and labelled phone inputs,
  independent informational key dates, and follow-up history near Waiting/status
  information. Browser-memory drafts preserve the original root revision, survive
  client Back, and participate in existing discard guards. Stale saves retain the
  draft; discard and Reload task before retrying a newly based edit.
- All Work supports deadline overdue/today/upcoming/none, follow-up due/active/none,
  inclusive deadline-from/through dates, and earliest deadline/follow-up sorting.
  Date ranges are interpreted in APP_TIME_ZONE even for a record with a different
  exact-time display zone. Action filters omit closed/archived tasks; date ranges
  can retrieve history through the existing history/archive views. Priority remains
  independent, and Urgent with no deadline remains searchable.
- Mixed date-only/exact sorting uses semantic instants (end of local date for
  deadlines; start for follow-ups), missing dates last and ID tie-breaking. It
  loads only matching ordering scalars before the one bounded full-record page.
  This personal-dashboard approach is not a large multi-tenant query benchmark.

Migration `20261110180000_task_dates` uses an explicit transaction, adds only
nullable deadline fields and empty lifecycle/key-date tables, and does no backfill.
It never infers dates from event links, titles or updatedAt. Inventory `--phase 06`
checks all original fingerprints/IDs/edges/timestamps/balances and rejects guessed
historical dates or records. It also detects duplicate active follow-ups, closed
active reminders and cross-task/invalid predecessor links. Production is untouched.

Development/disposable verification:

```sh
node --test tests/work-dates.test.mjs
docker compose -p dashboard-work-phase06 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-dates.integration.mjs tests/work-relationships.integration.mjs tests/work-support.integration.mjs tests/work-all.integration.mjs tests/work-foundation.integration.mjs tests/work-management.integration.mjs tests/event-completion.integration.mjs
RUN_WORK_DATES_BROWSER_TEST=1 node tests/work-dates.browser.mjs
```

Use a fresh restored disposable DB, never production or primary development, for
writing tests. Run DB and browser suites sequentially: whole-DB rollback assertions
are invalid if another suite writes concurrently. Existing backup/recovery and
private-volume rules still apply. A failed transactional migration must be reviewed
and recovered from the private pre-migration snapshot into a fresh isolated DB;
never reset real data or deploy an older Prisma client against a changed schema.
The known unrelated ActivityVocab.lastPracticed drift is not a reason to drop data.

No calendar projection, event conversion, work-session UI, notification job or
external calendar is implemented here. Those calendar features remain Phase 07.

## Phase 07: existing calendar, work layers and explicit conversion

The existing `/events` calendar remains the only calendar. `Todo` deadlines,
active `WorkFollowUp` records and nonremoved `WorkKeyDate` records are projected,
not copied into Event. Their typed IDs (`deadline:42`, `followup:8`, `keydate:9`)
open `/todos/:id#task-dates`; actual `event:15` opens the original event URL.
Deadline/follow-up changes use those existing source forms and their versioned
history. They are point markers, never implicitly reserved day-long work blocks.

### Authoritative event links and timing

`EventTaskLink` is authoritative. All application relationship writes go through
`event-core.ts` (`writeEventLinks`, legacy adapter, removal/detachment helpers).
`Event.linkedTodoId` is a compatibility mirror: the sole task ID when exactly one
link exists, otherwise null. Do not write it directly from SQL, seeds or new API
code. The legacy scalar API delegates to the same writer, rejects ambiguous
multi-link edits and cannot silently remove a session target. Link changes touch
affected task versions and append audit entries. Existing cross-owner anomalies
remain flagged for review with foreign task details redacted; they are never
silently reassigned, converted or used as session targets.

Event kind is ORDINARY, INFORMATIONAL or WORK_SESSION, separate from ActivityType
label/color. Migrated records remain ORDINARY with availability/timezone unknown.
A session requires start/end, an explicit named zone and exactly one owned
SESSION_TARGET; other links are RELATED. Partial unique and deferred constraint
triggers enforce this at transaction commit. Additional sessions for one task
are separate events. New targets cannot be archived; existing sessions survive
archival/closure. Hard task deletion is blocked for session targets/conversion
history rather than silently deleting a session or ledger. Event deletion removes
its associations, keeps tasks and retains audit/conversion source IDs.

Event.date/endDate remain the sole timed source and preserve the original
Prisma UTC convention in SQL timestamp(3); the migration does not reinterpret
stored values. Explicit all-day events instead use allDayStart/allDayEnd date
strings with an exclusive end (UI asks first/through day). TBD has neither.
Optional busy=true/false means busy/free; null preserves unknown legacy intent.
New controls use the Phase 06 APP_TIME_ZONE configuration and DST gap/fold rules.
Metadata-only edits omit unchanged timing to preserve original precision/instants.

The calendar adds matching installed FullCalendar v6 timegrid and luxon3 plugins:
Week/Day show actual timed sessions; named-zone rendering stays independent of
browser/process timezone. Existing daygrid/interaction behavior is reused.
Session drag/resize immediately reverts the visual proposal, then asks explicit
confirmation and PATCHes only that Event using its revision. The event editor is
the touch/keyboard alternative. Event/session completion never completes a task.
Task closure reviews future linked sessions without cancelling them, and its
preview token includes those session revisions. Closed-task markers are hidden
by default; optional history is muted/nonactionable. Reopen keeps the deadline.

### Read and conversion APIs

All new routes use the existing owner guard and private no-store responses:

- GET /api/work-calendar: explicit offset-bearing start/end, positive range at
  most 370 days, whitelisted layers, context and closed-history filters. At most
  1,000 records per source and 2,500 aggregate items; narrow the query on 422.
  TBD events are separate pages of 30. One repeatable-read snapshot supplies the
  projection. Event contexts derive from explicit related tasks; label names are
  not guessed to be task contexts. Unlinked items have an explicit filter.
- GET /api/todos/:id/calendar: owner-scoped associations, 20 per page.
- GET /api/events/:id/activity: recent owner-scoped event decisions.
- POST /api/events/:id/conversion/preview: read-only choices and token.
- POST /api/events/:id/conversion: UUID idempotency key, If-Match and previewToken.
- POST /api/events/:id/conversion/undo: explicit conversion ID/deadline policy,
  same mutation/version guards.

Conversion choices distinguish a real retained RELATED event from a PLACEHOLDER
whose calendar display is explicitly superseded by an explicitly chosen task
deadline. Exams/meetings are not guessed to be assignments. Choose an existing
task or title/context for a new one. Preview fingerprints source/link/task state;
confirm revalidates under the existing owner advisory lock and atomic mutation
receipt. An active-conversion uniqueness constraint and intent check make retries
or concurrent confirmations reuse one result. `WorkEventConversion` retains source
snapshot, original ID, task, before/after deadline, intent and resulting versions;
`WorkEventActivity` records decisions with owner/actor and server timestamps.

Undo always keeps the task and links. It does not overwrite any event fields.
Restoring the prior deadline is allowed only while the task revision/value still
matches the conversion result. If later task edits occurred, the explicit
alternative restores event display only and keeps the current deadline; both may
then appear until deliberately corrected. Never bulk-restore source snapshots over
later edits. Recurrence was rechecked and remains absent; no engine was added.

### Migration, examples and recovery

Migration 20261111120000_calendar_work_layers is transactional and additive;
linkedTodoId backfills as RELATED/LEGACY, including a review flag for unexpected
ownership. It creates no deadline, session, fabricated activity or conversion.
Run preflight inventories and restore/migrate the full backup on a fresh isolated
DB before cutover. Use inventory --phase 07 and verify original fingerprints and
backfilled pairs. Do not apply a schema-diff DROP for the known unrelated
ActivityVocab.lastPracticed drift. No reset, general seed or production operation
is part of this phase.

Development cutover was completed after a successful whole-DB restore rehearsal.
The private phase07-dev-before.dump, copy/dev inventories and exact comparison
artifacts remain under private/work-management/. Both restored-copy and actual
development migration comparisons had no original differences/issues. Repeated
isolated deployment changed no records. The rebuilt development image and refreshed
anonymous dependency volume are running; named DB/work/finance volumes survived.

The user separately requested richer examples. After proving migration
preservation, the following opt-in command was rehearsed then run in development:

```sh
docker compose -f docker-compose.dev.yml exec -T -e ALLOW_WORK_EXAMPLES=1 dashboard npm run seed:work-examples
```

Do not run it on production. It requires NODE_ENV=development and the explicit
opt-in; the underlying fixture helper also permits guarded disposable tests.
Per-month deterministic UUID receipts persist completed steps and original sample
snapshots, resume partial failures and make a completed run a no-op even after
user edits. There is no automatic monthly job or startup seed. Do not delete its
receipts to force a repeat. Inspect existing records and receipts before correcting
a partial failure, then rerun the same command.

It added 14 labelled zero-reward tasks and nine new events, with children,
checklist/dependency, synthetic contacts/note, deadline/follow-up/key-date,
closed/cancelled and undated Urgent examples. Nine old verified samples were
updated; two verified deadline placeholders were explicitly converted with their
IDs/snapshots retained. Eligibility requires the exact original seed title,
description, type, start/end, completion and no existing links. Any nonmatching
row stays unchanged. The original calendar demo seed recognizes the manifest and
will not recreate superseded/renamed placeholders. Exact post-example checks
preserved every original non-example row and balance; a repeated run changed
nothing. This authorized fixture operation is not part of migration backfill.

For failure recovery, stop app writes, retain the failed environment and receipts,
and restore the full backup into a fresh isolated DB for diagnosis. Preserve
private-file volumes alongside DB backups according to the existing combined
backup rules. Do not reset development/production, auto-undo schema, run an older
client, or overwrite newer real records with a pre-example dump. Application undo
handles individual conversions safely. Any production deployment/recovery still
requires a separate reviewed procedure.

### Executed verification and repeat commands

Writing tests below require a disposable restored DB and must run serially with
browser suites stopped. Never point them at primary development or production.

```sh
node --test tests/*.test.mjs
docker compose -p dashboard-work-phase07 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-calendar.integration.mjs tests/work-dates.integration.mjs tests/work-relationships.integration.mjs tests/work-support.integration.mjs tests/work-all.integration.mjs tests/work-foundation.integration.mjs tests/work-management.integration.mjs tests/event-completion.integration.mjs
docker compose -p dashboard-work-phase07 -f docker-compose.work-test.yml run --rm -e RUN_WORK_EXAMPLE_TEST=1 runner node --test tests/work-examples.integration.mjs
RUN_WORK_CALENDAR_BROWSER_TEST=1 node tests/work-calendar.browser.mjs
docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs
```

The browser command uses the existing isolated app at localhost:3002, disposable
auth secret, Playwright/Chromium and its documented temporary library environment;
those test credentials are not production credentials. Seven work browser suites
passed sequentially across four sizes. Final calendar reruns additionally checked
pointer moves, native all-day entry, marker keyboard navigation and metadata-only
legacy instant preservation. Physical phones/Safari were not tested. The final
28 unit files, 68 DB checks, examples test, live 128-handler authorization checks,
isolated production build, development image build, TypeScript and targeted lint
passed. The existing CommonJS seed passes syntax validation but retains its
pre-existing require-import lint errors; whole-repository lint is not clean.
No dependency upgrade/security audit, production recovery, external calendar,
notifications, recurrence, project or My Work implementation is claimed here.

## Phase 08: projects, stages and informational milestones

Projects are optional owner-managed groups, not tasks. `WorkProject` retains a
stable ID/reference (`PROJECT-0001`), name, objective, current summary, optional
context and planning start/target calendar dates. Its lifecycle is ACTIVE,
COMPLETED or CANCELLED, with independent archival and versioned activity for
closure/reopen/restore. These planning dates never change task deadlines or
reserve calendar time. No project hard-delete API exists; archive preserves its
supporting records and history.

`WorkProjectStage` organizes project tasks with name, sort position and active
state. Requirements, Implementation, Testing and Launch are initial stages of an
explicitly created project only. Stages are not task statuses. Stages can be
renamed, ordered or deactivated; inactive stages retain existing members and
cannot receive new assignments. Up to 100 stages are supported; equal positions
sort by immutable ID. No bulk move or hidden cascade is implemented.

### Membership, counts and closure

Todo.projectId and stageId are nullable; all original tasks migrate standalone.
A single project column enforces at most one primary project. The compound
(projectId,userId) FK enforces ownership, (stageId,projectId) enforces the correct
stage, and a CHECK prohibits a stage without a project. One dedicated membership
writer validates task revision, owner, active project/stage and explicit removal.
It changes that task only, bumps affected project versions and records both task
and project activity in the shared owner-lock transaction. Parent/child/project
membership is independent; children, dependencies and symmetric related links
can cross projects. Original IDs, references, URLs, checklist rows, dates, notes,
rewards, relationships and event times remain untouched by a membership move.

New tasks can explicitly name a project/stage in the normal creation command;
creation and membership are atomic. Existing task PATCH callers must use the
dedicated membership endpoint instead of writing those fields directly. Explicit
legacy task deletion keeps project deletion history and advances its version;
tasks with supporting/session/graph history retain earlier deletion safeguards.

Counts consider directly assigned tasks, independently of parent hierarchy:

- Denominator: nonarchived tasks whose status is not Cancelled.
- Completed: Done tasks within that denominator.
- Unfinished: denominator minus Done.
- Cancelled and archived rows are shown separately, excluded from the denominator;
  an archived Cancelled row is counted in archived only.

These are completed/total task counts, not effort percentages. Milestone reached
state is separately explicit and never marks tasks or the project complete.

Complete, cancel and archive require a fresh read-only closure review. Its token
includes project state plus all member task IDs/revisions/status/archive state.
Unfinished work, including archived unfinished members outside the progress
denominator, requires explicit acknowledgement to keep those tasks open. A
member's status or other edit invalidates the review even if the project revision
has not changed. Reopen and restore preserve all tasks and sessions. Closure never
pays/reverses task rewards, completes children or deletes future sessions. Closed
projects stay searchable; new assignments require an active unarchived project.
Tasks already in a closed project remain independently editable/movable.

### Reused notes, attachments, history and dates

WorkNote, WorkAttachment and WorkKeyDate now have nullable task/project parents,
with a database CHECK requiring exactly one. Their original task IDs/values and
FKs are preserved. Shared support commands accept either the legacy numeric task
ID or an explicit `{projectId}` parent. Every lookup checks the selected parent,
owner and record together; a project ID cannot be substituted into a task URL.
Project support ownership is also checked by database triggers. Note revisions,
soft removal, server timestamps, occurrence dates, safe documentation links,
private byte validation, original download headers, replacement and cleanup reuse
the existing implementation. Drafts and upload retry keys include the parent API
path, so matching numeric task/project IDs do not share a draft or upload intent.

WorkActivity retains task references after a permitted task deletion. Project
activity instead carries projectId and a null todoReference; its CHECK prevents
mixing task/project identity. Automatic activity remains append-only through the
application. Project timelines use the same Notes only / All activity and revision
views. Original task/finance attachment namespaces and permissions are unchanged.
No new storage environment variable, root, volume or dependency is required.

Project milestones reuse WorkKeyDate with an exclusive project parent and optional
completedAt reached state. Up to 100 nonremoved milestones are supported per
project. DATE/TIME/DST validation is the same as task key dates. The existing
calendar projects them as stable `milestone:<id>` informational markers within
its Key dates layer. They open `/projects/:id#project-milestones`, are never busy
or draggable, and create no Event. Closed-project milestones require historical
view; archived-project markers are hidden. Reached markers are labelled/muted.
Moving a milestone changes only its WorkKeyDate via the source editor.

### UI, search and endpoints

`/projects` and `/projects/:id` use ProtectedLayout and the existing navigation.
List search is paginated (30) with context, active/history/archive/all filters.
Project detail reuses AllWork's shared paginated queries, list/board, status
controls, task panel/full-page links and filters; optional stage filtering stays
organizational. Capture shows the project context default and creates one original
Todo. Existing tasks are assigned using Project membership in task details.
All Work and Calendar have searchable/paginated project pickers, including
standalone work. Calendar filtering derives event membership from owned linked
tasks, not copied Event project fields. Context and project predicates both apply.
`/events?project=:id` provides a project-calendar entry point.

All new API handlers authenticate first and return private no-store responses:

- GET/POST /api/projects; GET/PATCH /api/projects/:id.
- GET/POST /api/projects/:id/transition (read-only review then explicit action).
- POST /api/projects/:id/stages (root project revision governs stage changes).
- GET/POST /api/projects/:id/milestones.
- PATCH /api/todos/:id/project (task revision governs membership).
- Project-scoped timeline, note create/edit/remove/revisions, attachment list,
  upload/replace/remove/cleanup/original routes mirror the existing task routes.

Mutations use UUID request keys, If-Match as appropriate, owner-scoped transaction
lock, server validation and atomic audit/receipt writes. Conflicts retain the
user's draft and require deliberate reload/review. Completed creation forms remain
locked while navigating to prevent a second submission. New project search URLs
are excluded from development request logging alongside private work/finance URLs.

### Migration and recovery

Migration 20261112120000_work_projects is transactional and additive: empty
project/stage tables, nullable Todo membership, exclusive shared-support parents
and a nullable milestone reached timestamp. It relaxes the original support
parent NOT NULL columns only to allow an explicitly exclusive project FK; old
values and relationships are unchanged. No project, membership, historical date,
note or activity is inferred. Use inventory --phase 08 for the exact comparison;
it allows only these additions/nullability changes and rejects fabricated project
rows or membership. Inventory also checks ownership, stage and support-parent
consistency. Original calendar conversion/session rules remain in force.

The pre-migration whole-development backup and inventories are private files under
private/work-management/phase08-*. The migration was first applied to a full
restored disposable copy, comparing original fingerprints, IDs, FKs, enum values,
timestamps and balances. Repeat deployment must be a no-op. Read-only schema diff
may still show the known unrelated ActivityVocab.lastPracticed drift; do not apply
its proposed DROP. Existing combined DB/private-file backup rules cover projects
without another storage root. No document bytes are migrated by this schema change.

On failure, stop writes and retain the failed environment/receipts. Restore the
whole backup into a fresh isolated database for diagnosis; do not reset a real
database, blindly restore over later writes, auto-remove the new columns, or run
an older writer against the changed model. Preserve private work/finance volumes
and documents with the matching DB backup. Production cutover/recovery remains a
separately authorized operation, not implied by development verification.

### Verification commands

Use a fresh restored disposable database. Never point writing tests at primary
development or production, and never run DB rollback assertions concurrently with
browser tests or other writers. Stop source edits/server reloads during browser
runs. Browser cleanup closes Chromium even when fixture cleanup reports an error.

```sh
node --test tests/*.test.mjs
docker compose -p dashboard-work-phase08 -f docker-compose.work-test.yml run --rm -e RUN_WORK_PROJECT_DB_TEST=1 -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-projects.integration.mjs tests/work-calendar.integration.mjs tests/work-dates.integration.mjs tests/work-relationships.integration.mjs tests/work-support.integration.mjs tests/work-all.integration.mjs tests/work-foundation.integration.mjs tests/work-management.integration.mjs tests/event-completion.integration.mjs
RUN_WORK_PROJECT_BROWSER_TEST=1 node tests/work-projects.browser.mjs
docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs
```

Browser checks use the disposable localhost:3002 app/secret and the existing
temporary Playwright/Chromium libraries; they are not production credentials.
Actual outcomes, viewport evidence and remaining limits are in PROGRESS.md.
No project examples are seeded into real development records by this phase.
No Phase 09 focus/My Work, resources, budget, time-tracking, recurrence, external
integration or notification feature is introduced.

## Phase 09 — Daily planning and focus

### Sources and write rules

`/my-work` and GET `/api/my-work` are private owner-only projections of canonical
Todo, follow-up and Event records. They accept context/company/course/project
filters plus sessionPage. They do not store report copies or write while loading.
Shared planning-rules.ts predicates also power All Work's `planning` URL filter.
Section counts overlap; the unique active-task header is not their sum. Cards
show up to six priority-ordered tasks, with filtered All Work links for the rest.
Sessions use separate six-event pagination and retain closed/archived target labels.

GET/POST `/api/todos/:id/focus` uses the same owner restriction. POST requires
`{date: "YYYY-MM-DD", active: boolean}`, a UUID request key and the task revision
via If-Match. Only today's application-zone date is writable, checked under the
existing owner lock. A midnight conflict requires reload, not a guessed retry
against yesterday. Retry receipts, focus, task revision and activity commit
atomically. Focus changes never move deadlines, statuses or sessions or pay rewards.

WorkFocus has a unique owner/task/date key, a same-owner compound FK, valid-date
CHECK and active flag. Unpinning retains the row/history. Closing or archiving a
task hides its pin from active sections; same-day reopen/restore exposes the active
pin again. Prior-day pins remain history and never automatically carry over.
Hard deletion refuses retained focus history; archive tasks instead. Reads, date
rollover and reopening do not fabricate focus mutations.

Daily boundaries use APP_TIME_ZONE and the existing calendar helpers. Upcoming is
seven local calendar dates including today; DST days need not be 24 hours. My Work
returns a snapshot clock and next local midnight. The events endpoint still returns
its original array and now includes X-App-Time-Zone for dashboard date rendering.
Do not replace these rules with browser-local YYYY-MM-DD slicing or UTC midnights.

### Migration, backup and recovery

Migration 20261113120000_work_focus is additive and transactional: empty focus
table, indexes, compound owner/task FK and valid-date CHECK. Use inventory --phase
09; it permits these additions but rejects fabricated focus backfill, original
record changes or foreign-owner/orphan focus links. Original development had a
user-created project and four stages when this phase began; do not assume earlier
phases' empty project tables are still empty or erase later user records.

Whole-database backups already include WorkFocus and its audit/retry receipts.
There is no new document root or environment variable. Existing combined private
file backup procedures remain required. Rehearsal and development cutover dumps
and inventories are private phase09-* artifacts under private/work-management.
Do not publish their contents or copy test credentials into production.

Before any further cutover, stop writers, take a fresh whole backup and inventory,
restore/check in isolation, migrate explicitly, compare fingerprints and verify
repeat deployment is a no-op. On failure retain the failed state and diagnose a
fresh isolated restore. Do not reset, auto-drop columns, seed real data, restore
over newer writes or run an incompatible old writer. Production work requires its
own assignment; this development migration does not authorize it. Known unrelated
ActivityVocab.lastPracticed schema drift must not be repaired by applying a
read-only diff's suggested DROP.

### Verification

Use the standalone disposable Compose project; writing suites never target
primary development/production. Do not run browser writers concurrently with
whole-database rollback/fingerprint assertions. Freeze app source while browsers
run so server reloads cannot interrupt a save. Original auth reads can run against
development after migration. Commands supplement prior phases' suites:

```sh
node --test tests/*.test.mjs
docker compose -p dashboard-work-phase09 -f docker-compose.work-test.yml run --rm -e RUN_WORK_FOCUS_DB_TEST=1 -e RUN_WORK_PROJECT_DB_TEST=1 -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-focus.integration.mjs tests/work-projects.integration.mjs tests/work-calendar.integration.mjs tests/work-dates.integration.mjs tests/work-relationships.integration.mjs tests/work-support.integration.mjs tests/work-all.integration.mjs tests/work-foundation.integration.mjs tests/work-management.integration.mjs tests/event-completion.integration.mjs
RUN_WORK_FOCUS_BROWSER_TEST=1 node tests/work-focus.browser.mjs
docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs
```

Browser execution needs the existing temporary Playwright/Chromium setup and a
running disposable localhost:3002 app. Full serial browser regression enables all
nine RUN_WORK_*_BROWSER_TEST flags, not only the focus flag. Tests use UTC server
and Tokyo browser independently of the configured Toronto planning zone. See
PROGRESS.md for actual results and limits. Phase 10 is not started automatically.

## Phase 10 — Reliability and handover

No new model, migration, dependency or storage root is introduced. Historical SQL
stays unchanged. Use HANDOVER.md for the current model/service/route map, statuses,
owner mapping, dates/graph/rewards/focus rules, backup and production checklist.
Use SYNTHETIC_EXAMPLES.md for the separately guarded empty work_examples workflow.
It cannot seed the restored work_test baseline or a real owner's database.

The combined backup now rejects auto-remove source containers, cross-project
app/database pairs and configured DB host/name mismatches **before stopping**.
Choose persistent matching Compose containers; complete both database/file roots.
Work malformed/unexpected responses now also use no-store. Planning-filter/history
navigation and context-catalog retry fixes are covered by four-size browser tests.

The cumulative helper requires a fresh authorized pre-redesign restore and refuses
an already migrated baseline. It creates private exclusive evidence, applies each
historical stage in order, compares originals and repeats each deploy. Do not use
it as a rollback tool. A separate actual interruption test demonstrates rollback,
blocked retry and explicit resolution at the tested transactional point. An old
Prisma enum client cannot read NEW; general old-app rollback is unsupported.
Do not infer safe downgrade from an additive schema or replay separate rewards.

Exact new maintenance checks (standalone disposable project only):

```sh
docker compose -p dashboard-work-phase10 -f docker-compose.work-test.yml run --rm --no-deps \
  -e RUN_WORK_REHEARSAL=1 runner node scripts/rehearse-work-migrations.mjs \
  /app/private/work-management/phase10-chain

docker compose -p dashboard-work-phase10 -f docker-compose.work-test.yml run --rm --no-deps \
  -e RUN_WORK_RELIABILITY_DB_TEST=1 runner node --test tests/work-reliability.integration.mjs

docker compose -p dashboard-work-phase10 -f docker-compose.work-test.yml run --rm --no-deps \
  -e RUN_WORK_REHEARSAL=1 -e RUN_WORK_RECOVERY_TEST=1 \
  -e DATABASE_URL=postgresql://work_test:work_test_local_only@work-db:5432/work_recovery \
  runner node --test tests/work-migration-recovery.mjs
```

The chain output directory must be new. Recovery requires its own **fresh legacy**
restore named work_recovery before running both tests; it deliberately terminates
only a blocked migration backend in that database. Its second test generates a
minimal old-status client in a private scratch directory, proves enum incompatibility,
then removes only its synthetic probe/client. The separate legacy Phase 02/05
fixture tests require their existing pre-phase DB copies; bounded workspaces now
prevent future migrations from leaking into those tests.

Writing tests must never target primary development/production. Volume/rollback
fingerprints and browser writers to the same DB run sequentially. The Phase 10
serial backend batch used all RUN_WORK_FOCUS_DB_TEST, RUN_WORK_PROJECT_DB_TEST,
RUN_EVENT_DB_TEST, RUN_FINANCE_*_DB_TEST, RUN_KANJI_DB_TEST and
RUN_WORK_RELIABILITY_DB_TEST flags appropriate to the 20 files in PROGRESS.md;
the base runner supplies RUN_WORK_MANAGEMENT_DB_TEST. See that record for actual
counts and separate recovery/example/legacy tests. Node unit, TypeScript, targeted
lint and isolated build commands remain unchanged. Browser source must be frozen;
after a real fix, rerun the affected suite and document any failed attempts.

Known unrelated ActivityVocab.lastPracticed drift is left intact. Early migrations
without explicit BEGIN/COMMIT and arbitrary power loss still need real catalog/log
review, not automatic resolve/reset. Physical-device/NAS/production procedures
remain separately unverified. Stop after this handover; no new phase is implied.
