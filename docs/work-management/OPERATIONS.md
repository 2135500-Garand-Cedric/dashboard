# Phase 01 operations and compatibility

Use CONTEXT.md and the assigned phase as the execution boundary. These commands
are development/disposable procedures, not permission to operate on production.
Never combine the standalone work-test Compose file with production Compose.

## What changed

- `src/lib/work-management/server.ts` owns the current three-status task/event/
  checklist commands. Every writer takes the same PostgreSQL transaction-scoped
  owner lock (namespace 62019, stored owner user 1), then reads/validates/writes.
- `validation.ts` handles IDs, bodies, values, revision/replay headers and sanitized
  errors. `client.ts` sends guarded requests and retains replay keys when a network
  response is lost or unreadable. Existing URLs and response record shapes remain.
- The additive `20261109120000_work_mutation_safety` migration adds task/event/
  checklist revisions, task reward-accounting state and WorkMutationReceipt. No
  original field, timestamp, status, priority, link or User balance is rewritten.
- No new task statuses, task dates, contexts, projects or work documents exist yet.
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

Comparison permits only this phase's technical columns/new receipt table while
checking existing row hashes/counts and retained schema. Unknown owners/statuses/
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
docker compose -f docker-compose.dev.yml -f docker-compose.work-dev.yml up -d dashboard
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

Keep exact executed evidence and outstanding checks in PROGRESS.md. Phase 02 is
not started by completing these operations.
