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
