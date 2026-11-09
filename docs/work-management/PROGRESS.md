# Work management progress

## Current position

Updated: 2026-11-09 (America/Toronto).

Phase 01 is implemented and verified in development. Production is untouched.
Next assignment: Phase 02,
which has not started. The architecture is not a production migration approval.

| Phase | Status | Evidence |
| --- | --- | --- |
| 00 | Discovery recorded; migration rehearsal not performed | Chat discovery summarized in phases/00-architecture-and-migration-plan.md |
| 01 | Verified in development | See Phase 01 evidence below and OPERATIONS.md |
| 02 | Not started | — |
| 03 | Not started | — |
| 04 | Not started | — |
| 05 | Not started | — |
| 06 | Not started | — |
| 07 | Not started | — |
| 08 | Not started | — |
| 09 | Not started | — |
| 10 | Not started | — |

## Discovery evidence from Prompt 0

These checks ran during the preceding discovery task, not during documentation
creation:

- `node tests/auth-security.test.mjs`: 6 tests passed.
- `node tests/event-dates.test.mjs`: 7 tests passed.
- In-memory probes of the existing task PATCH handler reproduced clearing a
  prerequisite on status-only updates and validating the old prerequisite when
  status and dependency are changed together. No database writes were involved.
- Schema, relevant routes/components, migration history, authentication, private
  finance upload patterns, development startup and existing tests were inspected.

Not verified: production contents or schema drift; actual historical task reward
payouts; browser/touch behavior; task migration; isolated restore. No production
connection, seed, deployment or data mutation was performed for discovery.

## Documentation delivery

- Added the roadmap, shared acceptance checklist, this tracker and numbered phase
  files. CONTEXT.md remains unchanged.
- No application, schema, migration or user-data changes belong to this delivery.
- Document verification results are reported in the accompanying chat. They do not
  constitute implementation acceptance for any phase.

## Phase completion record template

Append an entry for each assigned phase; preserve prior entries.

```text
Phase:
Date:
Status: in progress / implemented but unverified / verified / blocked on stated issue

Prerequisites checked:
Actual repository findings and conflicts:
Files changed:
Migrations added (including ordering/commit requirements):
Data mappings, defaults, compatibility and reward decisions:
Data environment used (disposable/dev; never include secrets):
Before/after preservation evidence:
Exact checks executed and outcomes:
Required checks not run and why:
Acceptance IDs verified / still pending:
Manual acceptance steps and results:
Known risks and recovery instructions:
Next phase (not started automatically):
```

## Phase 01 — Preservation and mutation safety

Date: 2026-11-09 (America/Toronto).

Prerequisites: CONTEXT, Phase 00, Phase 01, progress, acceptance and actual code
reviewed. No expanded statuses, contexts, contacts, projects, task dates, notes or
work attachments were implemented. The pre-existing AppShell development-banner
change was left intact.

### Changes and decisions

- Added `src/lib/work-management/{server,validation,client}.ts`: owner-scoped
  task/event/checklist operations, revision checks, replay receipts, sanitized
  errors, shared transaction owner lock and reliable client retries.
- Replaced task/event API implementations with guarded service calls; safe delete,
  resulting-dependency validation, cycle protection and atomic linked-task creation.
  Calendar type deletion also uses the shared lock and increments affected owned
  event versions. Existing task/event URLs and original fields remain.
- Board no longer separately increments rewards. Task transition applies/reverses
  server-derived reward amounts in the same transaction. Only the old board called
  `/api/users/rewards`; it now returns 410 for stale callers. Quest logic unchanged.
- Added accessible task status controls, keyboard card opening, loading/error/retry
  feedback, retained failed-save drafts, narrow-screen fixes and record-load guards.
  Checklist writes preserve task drafts without adopting unrelated metadata edits.
- Centralized the explicit stored owner mapping in OWNER_DATABASE_USER_ID = 1.
  Development inventory confirmed one User and no unexpected task/event owners.
- Legacy reward policy: existing Done amounts become a labelled LEGACY_BASELINE
  for future reversal, not a claim about historical payouts. Existing balances are
  untouched. New completions track applied amounts; later reward edits do not
  change reversal amounts. Deleting a task preserves earned balances as before.
- Added `scripts/work-management-inventory.mjs`, `npm run work:inventory`, isolated
  `docker-compose.work-test.yml`, no-startup-mutation `docker-compose.work-dev.yml`,
  and OPERATIONS.md. Base development Compose no longer seeds automatically.
  Inventories are read-only snapshots with private exact row data, counts/hashes,
  schema metadata and enum/migration/owner/graph checks; output never prints rows.
- Tests: new work-management unit, disposable integration and browser files; adapted
  event-completion integration to guarded commands and the app's ES2017 target.
  README and roadmap link the operations/compatibility/recovery instructions.

Migration: `20261109120000_work_mutation_safety`. Additive Todo/Event/Subtask
versions, Todo reward state/basis, technical WorkMutationReceipt and lookup indexes.
No enum additions or historical migration edits. No original timestamps or User
balances changed. No payout-history backfill or fake activity entries.

### Preservation and restore evidence

- Source: DEVELOPMENT dashboard-db-dev only. Initial snapshot showed 3 Todo,
  5 Subtask, 17 Event, 1 User, no owner/cycle/legacy-value/checksum issues.
- Created a private whole-database custom-format development dump, restored it into
  separate work-db/work_test under project dashboard-work-test, without seeding or
  production connections. Private artifacts live under ignored
  `private/work-management/` and were not committed.
- `phase01-dev-before.json` -> `phase01-copy-before.json`: no differences across
  original records, including finance/Japanese data.
- Applied migration on the copy; `phase01-copy-before.json` ->
  `phase01-copy-after.json`: no original record/schema differences. Original ID
  sets, relations, values, timestamps and balances retained; new receipt table empty.
- Repeated `prisma migrate deploy`: no pending migrations. Repeat-before/after
  inventories reported no differences, including original indexes and FKs.
- After rehearsal, captured fresh DEVELOPMENT cutover-before/after inventories,
  applied the same migration there, compared all original rows/columns/FKs/indexes:
  no differences. Recreated only dashboard-dev with the no-seed override.
- Full schema-to-Prisma-model diff returned exit 2 for one pre-existing Japanese
  column: ActivityVocab.lastPracticed is in migration/database history but absent
  from the Prisma model. It was preserved, not removed or silently synchronized.
- Original private finance files were not changed. This phase verified DB restore,
  not restoration of finance document bytes; full file restore remains separate.

### Exact checks executed

- `node --test tests/*.test.mjs`: all 22 test files passed, including existing
  auth, finance, Japanese, backup, event-date and time-manager unit coverage.
- `node tests/work-management.test.mjs`: 5 tests passed (headers/validation,
  inventories, preservation comparison, sanitized errors and lost-response retries).
- `docker compose -p dashboard-work-test -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 -e WORK_MANAGEMENT_MIGRATION_BASELINE=/app/private/work-management/phase01-copy-before.json runner node --test tests/work-management.integration.mjs tests/event-completion.integration.mjs`: 12 TAP checks passed, including 10 work scenarios,
  the parent test and event completion. Covers actual restored baseline fields,
  concurrent cycles/completions, failed-write accounting/receipt rollback, late
  delete rollback, independent event deletion, replay/conflicts, linked-task races,
  ownership/checklist versions and unchanged event times/completion semantics.
- `docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs`: passed against the live dev app;
  96 protected API handlers plus redirects, denied identities, forged cookies,
  owner reads and read-only practice preview verified.
- `RUN_WORK_MANAGEMENT_BROWSER_TEST=1 node tests/work-management.browser.mjs`
  with temporary NODE_PATH/Chromium/runtime-library paths: passed at 390x844,
  844x390, 1440x900 and 2560x1440. Uses isolated app localhost:3002, mocked writes,
  real keyboard events and emulated touch taps. Checks conflict drafts, checklist
  drafts, reward-request protocol, status controls, event controls and width fit.
- `npx tsc --noEmit -p /tmp/work-tsconfig.json`: source type check passed; temporary
  config includes current source without stale development .next route types.
- Targeted ESLint over work-management library, task/event APIs/pages/components,
  activity-type detail route, reward route and owner policy: passed with no warnings.
- `npm --prefix /tmp/dashboard-work-build run build`: isolated production build
  passed again against the final source, including type validation and static page
  generation. The four-viewport browser check also passed again after the final
  load/conflict-handling changes.
- `git diff --check`: passed. Validated local links/fences in all 16 work-management
  Markdown files. Both standalone test Compose and dev + no-seed override passed
  `docker compose ... config --quiet`. `npx prisma validate` passed.
- Stopped dashboard-work-browser and the separate work-db after verification;
  development dashboard-dev stays running. Disposable volumes/private evidence
  were retained, not destroyed.

Initial integration failure exposed PostgreSQL integer/bigint advisory-lock
parameter resolution; explicit integer cast fixed it and all work tests passed.
The adapted legacy event test initially transpiled Error subclasses to ES5 and
misclassified validation errors; matching the application ES2017 target fixed the
harness and that regression passed. Neither failure was represented as a pass.

### Acceptance, limits and manual review

Verified for Phase 01 scope: A01–A05, A06 event deletion, A16 legacy dependency
safety, A29 applicable regressions, A31. Archival/new relationship/calendar features
remain pending their later phases, not accepted early.

Manual review steps (automated emulation passed; physical-device review optional):

1. Reload old tabs, open an existing task, and change its status using the selector.
   Existing dependency remains; an unfinished prerequisite prevents start/Done.
2. Edit reward amounts, complete/reopen a synthetic disposable task, and confirm
   exactly one server-side adjustment/reversal. Do not alter real tasks just to test.
3. In two tabs, save the same task: the stale tab shows a conflict and retains its
   draft. Checklist edits retain unsaved task text and do not heal stale metadata.
4. Delete a disposable linked event: its task/checklist/other links remain. A task
   with dependents cannot be deleted and retains checklist rows.
5. Repeat create-linked-todo on a disposable event: its existing task is reused.

Unverified/limits: production contents/migration/deployment, historical actual
payouts, physical mobile hardware and complete application file recovery. The
known Japanese schema/model difference is documented. Old app writers cannot be
safely re-enabled after cutover without maintaining the new accounting protocol;
use maintenance/read-only recovery, not an unreviewed rollback or blind old dump.
Receipts currently have no automatic retention cleanup. Original real-data
inventories/dumps remain private for review; disposable test DB is separate.

Next phase: 02 (canonical task foundation), not started automatically.
