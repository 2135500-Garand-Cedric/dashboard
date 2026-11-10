# Work-management operations and compatibility

Use CONTEXT.md and the assigned phase as the execution boundary. These commands
are development/disposable procedures, not permission to operate on production.
Never combine the standalone work-test Compose file with production Compose.

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
deployment, use the reviewed migration and a complete verified backup. The old app
can read original columns during an additive rollback, but MUST NOT accept writes
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
