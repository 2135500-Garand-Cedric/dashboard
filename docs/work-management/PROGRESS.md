# Work management progress

## Current position

Updated: 2026-11-11 (America/Toronto).

Phases 01–10 are implemented and verified in development within the recorded limits.
Production is untouched. There is no automatically authorized next phase.
The architecture is not a production migration approval.

| Phase | Status | Evidence |
| --- | --- | --- |
| 00 | Discovery recorded; migration rehearsal not performed | Chat discovery summarized in phases/00-architecture-and-migration-plan.md |
| 01 | Verified in development | See Phase 01 evidence below and OPERATIONS.md |
| 02 | Verified in development | See Phase 02 evidence below and OPERATIONS.md |
| 03 | Verified in development | See Phase 03 evidence below and OPERATIONS.md |
| 04 | Verified in development | See Phase 04 evidence below and OPERATIONS.md |
| 05 | Verified in development | See Phase 05 evidence below and OPERATIONS.md |
| 06 | Verified in development | See Phase 06 evidence below and OPERATIONS.md |
| 07 | Verified in development | See Phase 07 evidence below and OPERATIONS.md |
| 08 | Verified in development | See Phase 08 evidence below and OPERATIONS.md |
| 09 | Verified in development | See Phase 09 evidence below and OPERATIONS.md |
| 10 | Verified in development; production/device/NAS limits recorded | See Phase 10, HANDOVER.md and cumulative ACCEPTANCE.md |

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

## Phase 02 — Canonical task foundation

Date: 2026-11-09 (America/Toronto).

Status: implemented and verified in development; production untouched.

### Scope and implementation

- Re-read CONTEXT, Phase 02, progress, acceptance and actual Phase 01 source.
  Retained the existing `Todo`, IDs, URLs, checklist/dependency/event relations,
  revision/idempotency protocol and owner mapping. The pre-existing AppShell
  development-banner change remains intact.
- Added `NEW`, `BACKLOG`, `WAITING`, `CANCELLED`; kept original status meanings.
  New captures default to New/Normal/Task with a visible Personal context choice.
  Configurable owner-scoped WorkContext definitions start with Work, School and
  Personal; these are definitions, not sample tasks. Existing tasks stay
  Unclassified with unknown kind and closure dates. Inactive Personal defaults to
  Unclassified rather than invisibly assigning an inactive context.
- Added canonical named priority, optional kind, company/course/system labels,
  tags, desired outcome, next action, waiting information and workaround. Preserved
  the raw numeric priority column. Added explicit closure, reopen and archive
  operations with server timestamps. Accepted-workaround completion requires both
  explanation and confirmation; its evidence cannot be erased while still closed.
- Added transactional WorkActivity with actor, owner, stable task reference,
  server-created timestamp and before/after facts. Task/checklist changes, rewards
  and replay receipts commit together. Failed commands and identical retries add
  no duplicate history. No history was fabricated for existing records.
- Added owner-guarded context APIs and read-only task activity endpoint. Adapted
  board, cards, detail and dashboard tile; all seven statuses remain retrievable,
  archived tasks have a separate view and Urgent undated work stays visible.
  Added title/reference search, context filtering and minimal metadata/context UI.
  Personal reward values remain stored and functional; other contexts de-emphasize
  their presentation. No new dependencies.
- New source: `task-foundation.ts`, `types.ts`, TaskFoundationFields,
  TaskClosureDialog, WorkContextManager, TaskActivityPreview; updated service,
  task routes/pages/components and TodoTile. No contacts, projects, notes editor,
  dates, sessions, attachments or Phase 03 list redesign were implemented.

### Migration, mappings and preservation

Migrations, applied in order:

1. `20261109130000_work_status_values`: commits new enum values independently.
2. `20261109130100_canonical_task_foundation`: additive columns/catalog/activity,
   constraints/indexes and future defaults; does not alter historical migrations.

Legacy numeric priorities map 1→Low, 2→Normal, 3→High, null→Normal. Unknown raw
values remain unchanged with unknown named priority and an explicit review marker.
Only the new canonical field is writable; the original numeric column remains
historical. DTO `priority` is a compatibility projection, not a second authority.
Existing TODO is never reset to New; existing Done gets no invented completedAt.

- Updated inventory to format 2 with exact full SQL row text, including Phase 01
  reward accounting/revisions. `--phase 02` permits only reviewed additions and
  the future default change, compares original columns/IDs/links/schema and flags
  unknown values. A fresh format-2 baseline is required for Phase 02 comparisons.
- Created private whole-development DB dump `phase02-dev-before.dump`; restored
  into separate project `dashboard-work-phase02`, work-db/work_test, without seeds.
  `phase02-dev-before.json` → `phase02-copy-before.json`: no differences.
  `phase02-copy-before.json` → `phase02-copy-after.json`: no differences in original
  data/schema; WorkContext has three definitions, WorkActivity is empty.
- Fresh development cutover inventories `phase02-dev-cutover-before.json` →
  `phase02-dev-cutover-after.json` also report no issues/differences or pending
  migrations. Original 3 tasks, 5 checklists, 17 events, all balances and unrelated
  Japanese/finance records retained. Development app uses the no-seed override.
- Separate guarded `work_legacy_fixtures` database tested null/unknown priorities,
  a custom legacy status, historical timestamps, checklist/dependency/event links,
  raw columns and balances through the real migrations. All preserved; custom
  values remain flagged for review. Repeat migrate deploy is a no-op.
- Schema diff still reports only the known pre-existing ActivityVocab.lastPracticed
  database/model difference. It was preserved, not removed or synchronized.

### Executed checks

- `node --test tests/*.test.mjs`: all 23 test files passed.
- `node tests/work-foundation.test.mjs`: all 5 pure validation/lifecycle/inventory
  tests passed; `node tests/work-management.test.mjs`: all 5 passed.
- Disposable combined regression:
  `docker compose -p dashboard-work-phase02 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-management.integration.mjs tests/work-foundation.integration.mjs tests/event-completion.integration.mjs`:
  20 TAP checks passed. Includes all statuses, explicit workaround closure,
  archive/reopen, dependency distinction, owner checks, replay, audit-write rollback,
  legacy Done dates, reward behavior and preserved independent events.
- `tests/work-foundation-migration.mjs` executed against the isolated restored
  `work_legacy_fixtures` DB: passed real migration and repeat-execution assertions.
  Runner used `-e DATABASE_URL=postgresql://work_test:work_test_local_only@work-db:5432/work_legacy_fixtures -e RUN_WORK_FOUNDATION_MIGRATION_TEST=1`
  (these credentials are explicit disposable test values).
- `RUN_WORK_FOUNDATION_BROWSER_TEST=1 node tests/work-foundation.browser.mjs`
  using temporary Playwright/library/browser paths: real isolated UI/API workflow
  passed at 390×844, 844×390, 1440×900 and 2560×1440. Covers capture/defaults,
  metadata, Waiting, accepted workaround, history, reopen/archive/restore,
  cancellation/reference search and width fit with touch/keyboard.
- `RUN_WORK_MANAGEMENT_BROWSER_TEST=1 node tests/work-management.browser.mjs`
  using the same temporary paths: Phase 01 mocked-write conflict/checklist/reward/
  event regression passed at the same four viewports, adapted to explicit closure.
- `docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs`: passed against development, verifying
  100 protected API handlers, redirects, denied identities, forged cookies, owner
  reads and read-only practice preview.
- `npx tsc --noEmit -p /tmp/work-tsconfig.json`: passed source type checking.
- `npx eslint src/lib/work-management src/components/todos src/components/TodoTile.tsx src/app/todos src/app/api/todos src/app/api/work-contexts`: passed without warnings.
- `npm --prefix /tmp/dashboard-work-build run build`: passed production build,
  type validation and route generation using a separate build directory.

- `npx prisma validate`, `git diff --check` and local-link/code-fence validation
  of all 16 work-management Markdown files passed. Both standalone test Compose
  and development + no-seed override passed `config --quiet`.
- Stopped the temporary phase02 browser app and isolated work-db; retained volumes
  and private evidence. Development app stays running.

The real browser test initially exposed capture before the context catalog finished
loading; New is now disabled until loading completes, and the rerun passed. An
initial browser launch was blocked by the sandbox; the permitted external launch
passed. The old regression harness also needed to expect closed status controls to
be disabled and use the explicit completion dialog. Failures were not counted as
successful checks.

### Acceptance and limits

Verified for this scope: A01–A10, A12, automatic audit backbone of A13, applicable
A29 regressions and A31. Notes/revisions/timeline UI in A13 remain Phase 04;
expanded dependencies, contacts, projects, dates and views remain later phases.

Audit is append-only through application actions: no update/delete endpoint exists.
Explicit task deletion detaches its audit FK while retaining reference/facts;
there is no deleted-record history browser yet. Database administrators can still
perform privileged maintenance. Recent changes displays the latest 100 entries;
full notes/timeline filtering is deferred. Context rename/deactivation preserves
assignments and existing audit snapshots, rather than rewriting historical names.

Not verified: production records/schema/deployment, physical phones, historical
actual XP payouts or finance document-byte restoration. Private inventories/dumps
are ignored and retained. Recovery follows OPERATIONS.md; do not reset or seed,
re-enable old reward writers, or blindly restore an old backup after new writes.

Next phase: 03, not started automatically.

## Phase 02 follow-up — Development client cache

The live development task/context reads were later found returning 500 despite
successful fresh-process Prisma reads of the three tasks and three contexts.
The earlier `up -d` had left the existing development process running with its
pre-schema-change Prisma singleton. Explicitly restarting dashboard-dev (already
using the no-migration/no-seed command) cleared it: both authenticated endpoints
returned 200 with the expected counts. No task, context, migration or user data was
changed to fix the failure. This was a cutover verification gap, not a dependency
on later phases. The prior anonymous handler checks did not exercise owner-only
Prisma queries on these routes.

Added owner-success assertions for task list, context list, task detail and task
activity to the live auth regression. Read failures now say Unable to load rather
than Unable to save on these endpoints; sanitized error handling remains intact.
Updated OPERATIONS.md to explicitly generate the client and force-recreate the app
after schema changes, plus a safe restart procedure for the no-mutation override.

Executed follow-up checks: all 23 unit-test files, five individual work-management
unit tests, source TypeScript check, targeted ESLint and `git diff --check` passed.
`docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs`
passed against the restarted app: 100 protected handlers plus successful owner
reads of task list, contexts, task detail and activity, other module reads and
preview-only practice checks. Production remains untouched.

## Phase 03 — All Work, contacts and responsive details

Date: 2026-11-09 (America/Toronto).

Status: implemented and verified in development; production untouched.

### Scope, files and decisions

- Read CONTEXT.md, Phase 03, prior phase evidence, acceptance and actual task,
  auth/navigation, Prisma, Compose, inventory and test code. Prerequisites 01–02
  were verified. Preserved the pre-existing AppShell development-banner change.
- `/todos` is now All Work, list first, with optional board. Both render the same
  bounded server result page and sorting; columns no longer re-sort independently.
  Search covers stable reference, title and description. URL filters cover context
  (including Unclassified/inactive), company, course, person in any supported role,
  kind, system, exact tag, status and priority. Active, completed history, archived
  and all-unarchived views remain in the same screen. No date/project placeholders.
- Added `src/lib/work-management/query.ts` and `/api/work-items` GET. Results have
  stable tie-breaks, total counts and 30-row pages, clamped after result changes.
  Existing `/api/todos` array callers remain compatible. Quick capture is title-only
  with visible context from the current context filter, otherwise active Personal
  (or Unclassified if unavailable). Optional company is progressively disclosed;
  people and other metadata can be added in details afterward.
- Added WorkContact (name, optional company, active/revision/owner/timestamps) and
  TodoAffectedContact. Todo gains optional requester and waiting-on contact FKs.
  Existing free-text Waiting-on remains independent. No OAuth users, assignees,
  inferred contacts, real-looking employees or automatic contact seeds were added.
- Added guarded `/api/work-contacts` GET/POST and `/api/work-contacts/[id]` GET/PATCH.
  Contact search is paginated; repeated requests use the existing replay protocol.
  Deactivation preserves task links, inactive contacts remain visible/searchable,
  and new assignments to inactive or foreign contacts are rejected. Referenced
  contacts cannot be deleted through normal APIs or cascade away task records.
  Duplicate names are permitted because different people can have the same name;
  company and contact ID distinguish selections.
- Task people changes validate and replace associations atomically with task
  revision, audit and replay receipt. Omitted people remain unchanged; explicit
  null/empty array unlinks. Audit stores readable identity snapshots. Explicit task
  deletion removes its affected-person links, keeping contacts and prior facts.
- New `src/components/work/` contains AllWork, shared TaskDetails, TaskQuickPanel,
  searchable ContactPicker, ContactManager and draft guard. Main content contains
  description/outcome, next action, waiting/workaround and existing checklist;
  metadata contains status, context, people and priority. Existing `/todos/[id]`
  uses the same component. Desktop panel and phone full-screen dialog have focus
  trapping, Escape/close handling and full-page links. Back from the full page
  preserves validated All Work return filters; direct old URLs still work.
- Explicit exits/reloads warn about unsaved changes. Browser Back can be handled
  by Next before a page confirmation; task drafts are retained in browser memory
  and restored on reopening, retaining the original revision for conflict safety.
  Quick-capture/contact drafts similarly survive client navigation. Drafts never
  create DB history or use localStorage. Save/discard clears them. Creation writers
  retain pending retry keys across client navigation to avoid duplicate retries.
- Updated SideMenu label to All Work without changing its URL. Updated board,
  column, card and foundation fields; cards emphasize next action, people, waiting
  and workaround. Checklist shows completed/total counts without an effort bar.
  Stored rewards and transaction/accounting behavior are unchanged and remain
  available in details. No dependencies or later-phase modules were introduced.

### Migration and preservation

Migration: `20261109150000_work_contacts`. Additive WorkContact and
TodoAffectedContact tables, nullable requester/waiting-contact columns, restrictive
FKs and contact lookup indexes. No backfill or original-row edits.

- Captured private format-2 development inventory and whole-database custom dump:
  `phase03-dev-before.json`, `phase03-dev-before.dump` under ignored
  `private/work-management/`. Restored into a confirmed-empty separate
  `dashboard-work-phase03` work-db/work_test without seeding.
- `phase03-dev-before.json` → `phase03-copy-before.json`: no differences.
  Applied the migration to the copy; `phase03-copy-before.json` →
  `phase03-copy-after.json` with `--phase 03`: no differences/issues, both new
  contact tables empty. Original IDs, timestamps, checklist/dependency/event links,
  balances and unrelated finance/Japanese records preserved.
- Updated inventory comparison for only the approved Phase 03 additions and no
  contact backfill. Added cross-owner contact/affected-person inventory checks.
- After rehearsal and integration/browser checks, fresh development cutover
  inventories `phase03-dev-cutover-before.json` → `phase03-dev-cutover-after.json`
  again reported no differences/issues or pending migrations: original 3 tasks,
  5 checklist rows, 17 events, all User balances and unrelated records unchanged;
  new contact tables empty. Generated the Prisma client and FORCE-recreated only
  dashboard-dev with the no-migration/no-seed override.

### Executed verification

- `node --test tests/*.test.mjs`: all 24 test files passed, including the new
  `work-all.test.mjs` query/ownership/preservation/snapshot unit cases and existing
  auth/finance/Japanese/calendar/backup regressions.
- `docker compose -p dashboard-work-phase03 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-management.integration.mjs tests/work-foundation.integration.mjs tests/work-all.integration.mjs tests/event-completion.integration.mjs`:
  28 TAP checks passed. New cases cover contact creation/replay/conflicts, optional
  people, atomic association/audit failure rollback, foreign/inactive people,
  restrictive deletion, unlinking, every available filter, identical list/board
  queries, reference/description search, Unclassified/undated Urgent tasks, closed/
  archived retrieval, stable bounded pagination and empty results. Existing reward,
  closure, dependency, event, checklist and concurrency regressions also passed.
- `RUN_WORK_ALL_BROWSER_TEST=1 node tests/work-all.browser.mjs` with temporary
  Playwright/Chromium/library paths against localhost:3002: real synthetic UI/API
  workflow passed at 390×844, 844×390, 1440×900 and 2560×1440. Covers visible
  Work/School/Personal/combined capture defaults, list/board equivalence, URL reload,
  long titles/width fit, people assignment, direct/full/panel agreement, status
  controls, retained conflict drafts, close/link confirmation, focus return,
  native Back and in-memory recovery. Directory create/edit/deactivate/reactivate
  also passed. The final rerun after retry/draft polish passed all four sizes and
  the directory workflow again.
- Adapted `RUN_WORK_MANAGEMENT_BROWSER_TEST=1 node tests/work-management.browser.mjs`:
  four-viewport mocked-write regression passed for checklist drafts, stale writes,
  revision/replay headers, rewards and independent event controls.
- Adapted `RUN_WORK_FOUNDATION_BROWSER_TEST=1 node tests/work-foundation.browser.mjs`:
  real isolated four-viewport closure/workaround/history/reopen/archive/restore/
  cancellation/reference-search regression passed through the new UI.

Browser commands use temporary NODE_PATH/PLAYWRIGHT_BROWSERS_PATH/LD_LIBRARY_PATH;
all synthetic writes stay in the isolated test DB. Earlier guard attempts exposed
that Next handled Back before a confirmation could protect the form. Replaced
that approach with in-memory draft recovery and verified recovered content and
original conflict revision. Early browser tests also found banner overlap and old
selectors/navigation waits, which were corrected and rerun. These failures were
not counted as passes. No production or original development task was used as a
mutation test fixture.

### Manual acceptance and remaining limits

Executed browser emulation covered touch in portrait/landscape and keyboard on
normal/wide desktop; physical-device review remains optional/unverified. A local
screenshot of isolated synthetic details was visually inspected for layout.

Suggested manual review in development:

1. Open All Work: original tasks remain, context Unclassified. Filter/search and
   switch List/Board; reload the URL and confirm the same criteria/results.
2. Capture a title from a specific active context and check the visible default.
   Open details, add optional metadata/people and save. No company is required.
3. Manage contacts: create/rename/deactivate/reactivate a synthetic contact. A
   deactivated existing link remains visible; it is unavailable for new task links.
4. Edit a task, try Close/link navigation and reject discard. Use browser Back,
   reopen the task and verify the unsaved draft is restored. Save/discard explicitly.
   A second-tab update still makes the earlier revision conflict, preserving input.
5. Use completed history and archived views; restore/reopen explicitly. Existing
   events and checklist rows remain independent and stable.

Limits: drafts live only in the current browser runtime; a confirmed full reload
or tab/browser close discards them. They are not saved work until Save succeeds.
No exhaustive physical-device, production or finance document-byte restore test
was performed. Known pre-existing ActivityVocab.lastPracticed drift and unknown
historical reward payouts remain outside scope. Text searches use ordinary Prisma
contains filtering; larger datasets may eventually justify search indexes.
Private snapshots/dumps and disposable volumes remain retained for review.

Next phase: 04, not started automatically.


### Final Phase 03 checks and acceptance

- `docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs` passed against the FORCE-recreated
  development app: 105 protected API handlers, anonymous/non-owner denial, forged
  cookies, redirects and owner reads of task lists/details/activity, All Work search,
  contacts and existing module endpoints. No write fixtures were added to development.
- Final `npm --prefix /tmp/dashboard-work-build run build` passed compilation,
  source/route type validation and page generation. Final source-only TypeScript,
  targeted ESLint and all 24 unit-test files passed. `npx prisma validate` passed.
- Repeated `prisma migrate deploy` on the disposable DB found no pending migration.
  `phase03-repeat-final-before.json` → `phase03-repeat-final-after.json` reports no
  differences/issues. These snapshots include retained isolated synthetic fixtures;
  no repeat seeding, record edits or audit backfill occurred.
- Final schema/model diff reports only the known existing Japanese
  ActivityVocab.lastPracticed column difference (exit 2), with no new drift. That
  column was preserved; no `db push` or reset was used.
- Dev+override and standalone test Compose passed `config --quiet`. Markdown links
  and fences, plus `git diff --check`, passed. Temporary Phase 03 browser/test-DB
  containers were stopped; their volumes/private evidence retained. Development
  dashboard-dev remains running, with generated client and verified owner reads.

Verified for this scope: A01–A12, A27–A29 and A31 as applicable. The existing
automatic A13 audit backbone remains, while notes and its later UI are deferred.
All exclusions and the documented physical-device/production/file-recovery limits
remain. Phase 04 has not started.

## Phase 04 — Notes, activity and private attachments

Date: 2026-11-09 (America/Toronto).

Status: implementation and development verification completed; final documentation
and test-container cleanup completed on resuming the interrupted assignment.
Production is untouched. Phase 05 has not started.

### Prerequisites, scope and decisions

- Read CONTEXT.md, Phase 04, prior progress/acceptance and actual task/auth,
  finance file/preview, backup, Docker, Prisma and test code. Phases 01–03 were
  verified. Preserved the existing AppShell development-banner change.
- Added WorkNote, WorkNoteRevision and WorkAttachment with real restrictive
  owner/task/note FKs. WorkActivity can reference an immutable note revision.
  No generic polymorphic storage, project model, date/calendar feature, AI, OCR,
  external intake or notification service was introduced.
- Notes are separate from current task description/next action. Create/edit,
  revision snapshot, automatic activity and replay receipt commit together under
  the existing owner lock. Recorded timestamps/actors are server-controlled;
  optional occurred-at is distinct and never determines feed ordering. Meaningful
  edits retain earlier versions; no-op saves do not create fake revisions.
- Remove note explicitly clears the current body/links, retaining a tombstone and
  earlier revision content. UI confirmation explains that this is not permanent
  erasure. Normal APIs cannot modify recorded timestamps, earlier revisions or
  automatic activity. Tasks with supporting records are archived rather than hard
  deleted so note/revision/attachment history cannot be silently destroyed.
- New Notes only / All activity UI paginates 20 entries; revision history paginates
  20 versions. Text is escaped multiline plaintext, not HTML/Markdown execution.
  Validated HTTP/HTTPS documentation links use no-referrer/noopener; no content is
  fetched or synchronized. Links/occurred-at are optional form fields.
- Work attachments use independent metadata, record authorization and private root.
  Originals retain byte identity; uploads are bounded before multipart parsing,
  actual format/MIME/size/dimensions are validated, keys are opaque, storage paths
  cannot overlap public or finance roots, and symlinks/traversal are rejected.
  Directories/files use 0700/0600. Original reads verify size and SHA-256 and return
  protected, no-store, nosniff/sandbox/same-origin responses.
- Replacement commits the new file pointer/revision/activity before cleaning old
  bytes. Removal commits a tombstone plus durable pending-deletion keys before
  unlinking. Failed cleanup is visible/retryable. Failed or ambiguous DB commits
  never justify deleting a potentially referenced original; unreferenced staged
  files are cleaned when safely identifiable. Interrupted writes can leave a
  private orphan for reviewed maintenance, not an automatic blind purge.
- Camera/library controls, file selection retention, private image/PDF previews,
  download, replacement, removal and cleanup retry live in shared task details.
  Notes/files have independent Save/Upload actions and revisions, retaining task
  metadata drafts. Child drafts/selections survive client Back in memory and
  participate in the task's explicit-exit/reload guard. No localStorage or automatic
  draft/history writes were added.

### Files and storage/backup changes

- New `src/lib/work-management/{note-input,files,supporting}.ts`; extended existing
  server primitives, task-supporting-record protection, types and activity value
  formatting (including safe invalid date-like text).
- New guarded routes under `/api/todos/[id]`: notes create/edit/soft-remove,
  revision history, timeline, attachment list/upload/replace/remove/file/cleanup.
  All requireOwner checks precede parsing, DB access and private file reads.
  Parent/child/owner scope is enforced, including malformed cross-record activity
  associations. Mutation revision/replay rules remain enforced.
- New `src/lib/documents/private-files.ts`, TaskTimeline, TaskAttachments and neutral
  PrivatePdfPreview. The existing finance PDF component wraps the neutral renderer;
  finance upload/storage/download authorization and behavior remain independent.
- Added WORK_UPLOAD_DIR and separate persistent work volumes to development and
  proposed production Compose plus `.env.example`. Test work and finance uploads
  use their own persistent volumes. Production config was edited only as a proposed
  artifact; no production container, migration, data or deployment was touched.
- Work/contact search URLs now join finance in Next development log exclusions.
  Errors log fixed descriptions, not contents, filenames, contact names or tokens.
  External reverse-proxy logging policy remains the operator's responsibility.
- Extended `scripts/finance-backup.mjs` to version 2 manifests: entire database,
  fingerprints for every public table, finance originals and work originals with
  content checksums. Configured paths are read from the selected container without
  printing its environment. Previously-running apps restart after backup/failure.
  Version 1 finance-only manifests remain supported. The Docker-only NAS
  `backup-database.sh` still backs up every DB table but not upload bytes.
- Updated OPERATIONS.md, FINANCE_MAINTENANCE.md, roadmap and acceptance evidence.
  No new runtime dependencies or production build/deployment scripts were added.

### Migration and preservation evidence

Migration: `20261109170000_work_notes_and_attachments`. Adds only the three new
supporting tables, restrictive FKs/indexes and nullable WorkActivity.noteRevisionId.
No retrospective notes/activity, task edits or guessed timestamps were backfilled.

- Source: DEVELOPMENT only. Captured private format-2
  `phase04-dev-before.json` and whole-DB `phase04-dev-before.dump` under ignored
  `private/work-management/`. Confirmed fresh project `dashboard-work-phase04`,
  work-db/work_test empty before restoring the dump, without a seed or reset.
- `phase04-dev-before.json` → `phase04-copy-before.json`: no differences.
  Applied reviewed migration; `phase04-copy-before.json` →
  `phase04-copy-after.json` with `--phase 04`: no original row/schema differences
  or issues; all new tables empty, original activity unchanged.
- After rehearsal/tests, captured fresh development cutover-before inventory,
  stopped only dashboard-dev to prevent upload-root races, explicitly ran migrate
  deploy + generate in a development one-off, and FORCE-recreated dashboard-dev
  with the no-migration/no-seed override and new work volume.
- `phase04-dev-cutover-before.json` → `phase04-dev-cutover-after.json`: no issues,
  differences or pending migrations. Original 3 tasks, 5 checklists, 17 events,
  balances and all unrelated finance/Japanese records remain unchanged; note,
  revision and attachment tables empty at cutover. Original finance files untouched.
- Final `phase04-repeat-before.json` → `phase04-repeat-after.json`: no differences
  or issues after repeating migrate deploy on the idle disposable DB; no pending
  migrations, reseeding or duplicate history. These later snapshots include the
  deliberately retained isolated synthetic recovery fixtures.
- Schema-to-Prisma diff reports only the pre-existing Japanese
  ActivityVocab.lastPracticed column discrepancy (exit 2). It was preserved,
  not dropped/synchronized. No `db push`, reset or old migration edit was used.

### Exact executed checks

- `node --test tests/*.test.mjs`: all 25 test files passed before interruption and
  again on resumption, including existing finance/Japanese/auth/calendar/backup
  regressions. `node tests/work-support.test.mjs`: all 7 specific tests passed,
  including unsafe URL/timestamp input, invalid/spoofed/oversized multipart,
  filesystem permissions/traversal/symlinks/root aliases, migration preservation,
  missing-backup-original rejection, invalid date-like text and an actual valid
  compressed JPEG over 40 megapixels rejected below the byte-size limit.
- `docker compose -p dashboard-work-phase04 -f docker-compose.work-test.yml run --rm -e RUN_EVENT_DB_TEST=1 runner node --test --test-concurrency=1 tests/work-support.integration.mjs tests/work-all.integration.mjs tests/work-foundation.integration.mjs tests/work-management.integration.mjs tests/event-completion.integration.mjs`:
  35 TAP checks passed. New scenarios cover note create/edit/no-op/replay/revisions,
  ordering vs occurred-at, soft removal, retained history, foreign/cross-task access,
  corrupted cross-record activity suppression, atomic audit failure rollback,
  original-byte read/hash checks, replacement/deletion/replay/conflict behavior,
  failed disk writes, failed DB replacement, staged-file cleanup and durable retry
  after unlink failure. Earlier task/reward/dependency/calendar regressions passed.
- `RUN_WORK_SUPPORT_BROWSER_TEST=1 node tests/work-support.browser.mjs` using the
  temporary Playwright/Chromium/library paths against the isolated localhost:3002
  app: real notes, revisions, safe script-like/long text, optional occurred-at/links,
  parent-close draft confirmation, stale notes retained, actual rejected upload
  retry, camera/library controls, image/PDF preview, original download/security
  headers, cross-record denial, replacement/removal and archive-vs-delete behavior
  passed at 390×844, 844×390, 1440×900 and 2560×1440.
- Adapted `RUN_WORK_FOUNDATION_BROWSER_TEST=1 node tests/work-foundation.browser.mjs`:
  real four-viewport closure/workaround/history/reopen/archive/restore/cancellation
  regression passed using All activity instead of the superseded preview summary.
- `RUN_WORK_ALL_BROWSER_TEST=1 node tests/work-all.browser.mjs`: real four-viewport
  list/board/context/contacts/direct URL/back/focus/draft/conflict regression passed.
- `docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 dashboard node tests/auth-security.integration.mjs`: passed on the freshly recreated dev
  app, checking 116 protected handlers, redirects, forged cookies, denied identities,
  note/file/timeline denial and successful owner reads of task and supporting
  records, finance/Japanese APIs and read-only practice preview.
- `npm --prefix /tmp/dashboard-work-build run build`: isolated production build
  passed compilation, strict type checking and route/page generation. A fresh
  resumption build is also recorded in the final check record below. Source-only
  `npx tsc --noEmit -p /tmp/work-tsconfig.json`, targeted ESLint and
  `npx prisma validate` passed. `git diff --check` passed.

### Actual combined backup/restore rehearsal

- Read-only copied the 12 original development finance files into the isolated
  persistent test finance volume. Work files/notes are synthetic opt-in isolated
  fixtures; no example data was added to the primary development DB.
- Executed:
  `BACKUP_PROJECT=dashboard-work-phase04 BACKUP_DB_SERVICE=work-db BACKUP_APP_CONTAINER=dashboard-work-phase04-browser node scripts/finance-backup.mjs backup docker-compose.work-test.yml /tmp/dashboard-phase04-combined-backup`.
  Backup succeeded, stopping/restarting only the disposable app. Manifest version
  2 covers 39 public tables, 12 finance originals and 4 work originals.
- Executed:
  `node scripts/finance-backup.mjs verify /tmp/dashboard-phase04-combined-backup`.
  Restore succeeded into a newly created network-isolated PostgreSQL 15 container
  without live host data mounts. All 39 table fingerprints and all referenced
  original file bytes/sizes/checksums matched; finance/work files were independently
  copied into temporary restore directories. Only scratch resources were removed.
  This verifies the tested snapshot, not production recovery or future backups.
- Backups and preserved inventory/dump files remain private. Use the combined
  procedure for original files; the NAS DB-only dump cannot recover file bytes.

### Corrections during verification, manual review and limits

Early unit checks caught an invalid PNG fixture and a PDF.js option removed in the
installed library; replaced the fixture with a valid generated PNG and retained
only supported renderer options. Browser checks caught overlapping current/revision
text selectors and stale replacement chooser state; selectors and selection reset
were corrected and all four viewports rerun successfully. These failures were not
reported as passes. The usage-limit interruption left the implementation/test
results intact; resumption reviewed them, finished missing maintenance/acceptance
records and performed final checks/cleanup instead of reapplying a migration.

Suggested manual review in development:

1. Open a task, add a multiline note without a file, optionally include a link and
   occurred-at time. Switch Notes only / All activity; recorded time remains server
   time. Edit, inspect revisions, and remove; earlier content remains explicit.
2. On phone, try Take photo and image/PDF selection; invalid/oversized input reports
   an actionable message and preserves the previous selection/draft. Upload, preview
   and download an original. Replace/remove only a disposable test attachment.
3. Edit a note in two windows: stale Save keeps the draft and reports a conflict.
   Unsaved notes/files participate in the close/reload guard and in-memory Back
   recovery; confirmed reload/tab close loses unsaved drafts.
4. Confirm supporting records require archival, leaving notes/history/files intact.
   Pending physical cleanup is visible and retryable, never an invisible DB loss.

Verified for this scope: preservation A01–A03; A04–A05, A13–A14, A28–A29 and A31.
No physical phone camera hardware, production environment, complete external config
recovery, malware scanning, encrypted/off-host scheduling or permanent-content
redaction procedure was implemented/tested. PDF structural checks may reject some
unusual PDFs; re-exporting is the supported remedy. Crash-created private orphans
need reviewed maintenance; no automatic purge. Notes are plaintext with explicit
links. Retained revision content must not be mistaken for permanent erasure.

Next phase: 05, not started automatically.

### Final resumption checks

Reviewed the actual Phase 04 diff, persisted test logs, migration state and running
containers after the usage-limit interruption. The implementation, live auth,
35-check integration run, four-size support/closure/All Work browser runs and actual
combined restore had completed; remaining work was documentation and finalization.

Freshly executed on resumption: all 25 unit-test files (including 7 support tests),
source TypeScript, targeted ESLint and an isolated production build passed. Repeat
migration deployment and before/after inventories passed with no changes/issues.
Development+override, standalone test and proposed production Compose passed
`config --quiet` without deploying production. Local links/fences in all 17 work
and finance maintenance documents, plus `git diff --check`, passed. The retained
synthetic desktop screenshot was visually inspected. Only temporary Phase 04 app
and DB containers were stopped; private volumes/backups/evidence were retained,
and the development app stays running. Phase 04 is complete in development.

## Phase 05 — Checklists, real subtasks and relationships (2026-11-10)

Implemented in development only; no production commands, reset, real-data seed,
checklist promotion, task renumbering or Phase 06 work. Read CONTEXT.md and the
assigned Phase 05/acceptance contract before implementation. The pre-existing local
AppShell development-banner edit was preserved.

### Delivered behavior and decisions

- Existing Subtask is still Checklist, retaining every legacy ID/value/date and
  endpoint. UI labels now use checklist terminology consistently.
- Optional Todo.parentId makes a child an independent canonical task, with its own
  reference, status, checklist, notes and other supported metadata. Create a child
  or link/reparent an existing task; unlink never deletes it. Counts show checklist
  completion and direct child Done/total separately, not guessed effort.
- Closing/cancelling a parent warns about all unfinished descendants, including
  archived/Cancelled ones, requires explicit acknowledgement and records the exact
  reviewed descendant facts. No child status/reward/note/date changes cascade.
- TodoDependency stores directed dependent → prerequisite edges. TodoRelation uses
  ordered min/max IDs for symmetric, nonblocking uniqueness. Relationships offer
  Child tasks / Blocked by / Blocks / Related, paginated lists/search, original task
  navigation, loading/empty/error states and owner-scoped links across contexts.
- Blocked is derived separately from Waiting/workaround. Only Done resolves a
  prerequisite; Cancelled stays unresolved. Archive keeps history and relationships.
- The canonical graph writer shares the existing transaction-scoped owner advisory
  lock with task/checklist/event commands. It rejects self/duplicate/foreign links,
  hierarchy/dependency cycles and simultaneous opposite-edge/reparent requests.
  Both endpoints/old/new parents receive versions and activity. Hard deletion
  requires explicitly unlinking graph/hierarchy first, or archive instead.
- Start/Done/Cancelled review includes root/prerequisite/descendant versions and a
  fingerprint. Commit recomputes under the lock before rewards. Blocked transitions
  require an explicit override plus reason; unfinished-parent closure needs its own
  acknowledgement. Changed/ABA facts invalidate prior confirmation with 409.
- Legacy dependsOnId remains a derived sole-edge/null mirror; reads use canonical
  edges. Omitted legacy PATCH does nothing; ID/null adapts through the graph writer
  only with <=1 edge. Multiple edges always reject legacy replacement/clearing,
  avoiding silent truncation. Demo seed no longer rewrites dependencies.
- Migration copies original tuples without editing tasks or generating historical
  activity. Self/cross-owner/cycle-path anomalies survive with review flags. New
  edges cannot join flagged paths. Missing endpoints fail FK deployment for review;
  no missing task is guessed and no tuple is erased. See OPERATIONS.md for recovery.
- Relationship drafts follow existing browser-memory/discard/version patterns;
  metadata editing cannot overwrite them. Phone selection uses ordinary labelled
  controls, not drag/drop. Keyboard focus restoration waits for native dialog close
  before focusing a refreshed original list row.

### Preservation and migration evidence

- Captured `private/work-management/phase05-dev-before.json` and whole-database
  `phase05-dev-before.dump` (private, ignored). Restored into verified-empty
  `dashboard-work-phase05` / work_test; no seed. Restored inventory
  `phase05-copy-restored.json` compared to the source: **no differences/issues**.
- Applied `20261110120000_task_relationships` on the copy. Comparison
  `phase05-copy-restored.json` → `phase05-copy-after.json` with `--phase 05`:
  **no original row/schema differences or inventory issues**, no pending migration.
  Preserved 3 tasks, 5 checklist items, 17 calendar events, 1 existing real note,
  its revision/activity/replay receipt, owner balances and all finance/Japanese rows.
  Added exactly 1 original directed edge; no parents/related links were backfilled.
- Separate pre-Phase-05 restore in work_relationship_fixtures: valid/self/cycle/
  cycle-path/cross-owner fixture migration preserved exact original task/checklist/
  event tuples, timestamps, balances and audit. Confirmed direction/review flags,
  repeated extracted backfill and repeated deploy were no-ops. No invented history.
- Fresh development cutover-before inventory matched the backed-up baseline exactly.
  Stopped only development, ran migrate deploy explicitly without seed, compared
  `phase05-dev-cutover-before.json` → `phase05-dev-cutover-after.json` with
  `--phase 05`: **no original differences/issues**, no pending migrations. Generated
  Prisma client, force-recreated only development using the existing work-dev
  override. Production was not operated on.

### Executed verification

- `node --test tests/*.test.mjs`: **26 test files passed**, including new iterative
  12,000-node dependency/hierarchy checks, diamonds, missing parents and cycles,
  plus existing Japanese, finance, auth and calendar unit regressions.
- Isolated serial DB suite (command in OPERATIONS.md): **45 TAP checks passed,
  zero failures/skips**. Includes independent child notes/status; checklist versus
  child counts; parent/self/missing/foreign/deep/concurrent cycles; multi-prerequisite
  mirror and legacy protection; Waiting/Done/Cancelled/archive semantics; recorded
  overrides; stale/ABA/new-link/descendant reviews; no cascade; duplicate/reverse
  related pairs; replay; pagination; rejected writes and late-audit failure with
  rollback of links, mirrors, peer revisions, history, receipts and rewards.
  Prior Phase 01–04 work and event-completion regressions also passed.
- `RUN_WORK_RELATIONSHIP_MIGRATION_TEST=1` with explicit disposable database URL:
  **1 migration test passed**, including repeated backfill/deploy and anomalies.
- `RUN_WORK_RELATIONSHIPS_BROWSER_TEST=1`: **passed** against real isolated API/DB
  at 390×844, 844×390, 1440×900 and 2560×1440. Verified touch/keyboard selection,
  independent child creation/navigation, multiple prerequisites, blocked start,
  parent closure, failed stale review, explicit fresh confirmation and no cascade.
  No browser runtime errors; inspected `/tmp/work-phase05-desktop.png`.
- Existing Phase 01 mocked controls, Phase 02 real foundation/closure and Phase 04
  real notes/files browser suites passed at all four sizes. Phase 03 real All Work
  passed on rerun after fixing focus restoration; same four sizes, including
  URL/back/drafts, stale saves, contacts, filters and responsive shared details.
- Production Next.js build executed in isolated `/tmp/dashboard-work-build`;
  source TypeScript check and targeted ESLint passed. Full repository ESLint is
  **not clean**: default traversal hits the private inventory directory permissions,
  and explicit source/scripts/tests traversal reports pre-existing generated/other
  module lint issues. No claim that full-repository lint passed. Changed work paths
  were linted directly without weakening private permissions or unrelated cleanup.
- `git diff --check` passed. No new dependency or environment variable was added.

### Limits and next step

The primary development database has no new synthetic work fixtures. Browser and
integration fixtures live only in the isolated project; Phase 04 browser fixtures
retain private notes/files for recovery tests. Browser checks are Chromium device
emulation, not physical phones. Graph validation scans the owner's graph; this is
appropriate for the current personal dashboard, not a benchmark for very large
multi-user installations. SQL administrators can bypass application locking and
must use reviewed maintenance procedures. The permanent owner remains stored user
1 and the existing pinned GitHub identity. Phase 06 dates/scheduling and all later
features remain unimplemented. Production migration/recovery approval is separate.

### Final Phase 05 verification additions

- Live development `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs`
  passed: **120 protected handlers**, anonymous rejection, denied identities,
  forged/legacy cookies, page redirects and owner access. New relationship and
  transition reads were included in explicit non-owner/owner checks. No secret
  was printed and no real user mutation was made.
- `phase05-repeat-before.json` → `phase05-repeat-after.json` on the isolated DB:
  repeat deploy reported no pending migrations; **no differences/issues**.
- Read-only Prisma drift check found only the already documented unrelated
  `ActivityVocab.lastPracticed` column. The proposed DROP SQL was **not executed**;
  no work-schema drift was found. Never use db push/reset to clear this difference.
- Final-source isolated Next.js production build, targeted ESLint, all 26 unit
  test files and whitespace check passed after UI fixes. Phase 06 was not started.
- Final `phase05-dev-final.json` compared to the post-cutover inventory: no
  differences, no issues and no pending migrations. The authorization verification
  left every development record unchanged. Isolated test app/database were stopped
  after checks, retaining volumes/artifacts; development remains running.

## Phase 06 — Deadlines, follow-ups and key dates (2026-11-10)

Implemented in development only after reading CONTEXT.md, the Phase 06 contract,
acceptance/progress and current task/graph/calendar/date code. No production
operation, seed/reset, event conversion, calendar rendering or Phase 07 feature.
The existing local AppShell development-banner edit was preserved.

### Models, ownership, dates and lifecycle

- `Todo.deadlineDate` is a validated calendar-date string, mutually exclusive with
  `deadlineAt` (timestamptz) + `deadlineTimeZone`. All null means unknown/undated.
  DB CHECKs enforce alternatives, valid calendar dates and timezone metadata.
- `WorkFollowUp` is a task-owned lifecycle record, with original date/reason,
  created/resolved time, outcome/status and a previousId chain on snooze.
  A partial unique index enforces one ACTIVE follow-up per task. New commands
  share the root task revision/idempotency receipt and existing owner lock.
- `WorkKeyDate` has an ordinary required Todo FK, label and one date-only/exact
  value. Removal is soft and audited. It is informational, never a deadline or
  reserved period. Future project ownership can use another FK plus XOR parent
  check in Phase 08; no generic IDs, project schema or guessed parents were added.
- Server-only `APP_TIME_ZONE` defaults to America/Toronto, configured centrally in
  `src/lib/app-time-zone.ts`, with an optional documented .env.example setting.
  APIs send it explicitly to browsers. New task-date meaning never depends on
  browser/server locale. Existing unrelated modules were not retimed.
- Enter local wall time + named zone. Resolve and round-trip actual candidate
  instants: DST gaps reject with an actionable error; folds require an explicit
  earlier/later choice. Exact values retain instant + zone, rendering GMT offset
  so repeated times remain distinguishable. Date-only values stay calendar dates.
- Date-only deadlines become overdue after their local date; exact deadlines
  strictly after their instant. Date-only follow-ups are due on their local date,
  exact follow-ups at their instant. States derive on reads, not stored flags.
  No-date Urgent work remains available. Refresh to update across clock boundaries.
- Complete/cancel/snooze only affects the follow-up. Snooze preserves the resolved
  original and atomically creates its replacement, without changing task outcome,
  deadline, key dates, rewards or events. Explicit past dates remain possible for
  manual recording; no inferred recurrence/duration or automatic notifications.
- Done/Cancelled retires any active follow-up with TASK_CLOSED outcome atomically
  with task history/rewards. Reopening never reactivates inactive follow-ups or
  invents reminders; schedule a fresh follow-up explicitly. Original deadline
  remains and overdue is re-evaluated. Archive preserves an active follow-up but
  hides action indicators; restoring open work reveals the retained due state.
- Key dates and historical deadlines survive closure. Any follow-up/key-date
  history requires archive instead of hard task deletion. Children and events are
  never retimed/completed by a date command.

### UI and source changes

- Added pure display/clock helpers, validated date parsing/resolution, transactional
  date service and closure lifecycle hook under `src/lib/work-management/`.
- Owner-first GET/POST `/api/todos/[id]/dates` with no-store responses, owned task/
  child lookup, strict action bodies and existing If-Match/UUID behavior. Date
  commands create old/new activity; stale/failed writes retain no partial effects.
- `TaskDates.tsx` adds distinct Deadline, Follow-up/Next check and Informational key
  dates beside task status/Waiting details. Labelled native phone inputs,
  loading/empty/error/success states, explicit DST choice, editable key dates,
  separate 20-row history/key-date pages and in-memory guarded date drafts.
  Metadata/relationship changes cannot silently overwrite a date draft.
- All Work adds overdue/today/upcoming/undated deadline filters, due/active/none
  follow-up filters, inclusive deadline-from/through range, mixed date-only/exact
  earliest-first sorting and separate deadline/follow-up labels. Filters remain
  shared by list/board and persisted in URL. Quick capture still needs title only.
  Sorting reads only ordering scalars before loading the bounded full-record page.
- Task details use the server's configured zone for task creation/update/closure
  display. Existing browser-local occurred-at note entry remains explicitly local.
  Closure dialog explains follow-up retirement without adding another approval.
- Inventory comparison supports `--phase 06` and checks no guessed date backfill;
  lifecycle inventory also reports duplicate active records, closed active reminders
  and invalid/cross-task predecessor links. Existing auth/mock test helpers updated
  for the two new protected handlers and read shapes. No new dependency.

### Preservation and migration evidence

- Captured private `phase06-dev-before.json` and whole-DB
  `phase06-dev-before.dump` under ignored `private/work-management/`.
- Created new `dashboard-work-phase06` disposable project, verified work_test had
  zero public tables, restored the dump with single-transaction pg_restore and no
  seed. `phase06-copy-before.json` compared to the development baseline with
  `--phase 06`: **no differences/issues**.
- Applied explicit-transaction migration `20261110180000_task_dates` on the copy.
  `phase06-copy-after.json` compared to copy-before: **no original differences or
  issues**, no pending migration. Added only three nullable deadline fields and
  empty WorkFollowUp/WorkKeyDate tables; all old dates remained unknown.
- Preserved exact original rows: 3 tasks, 5 checklist items, 17 events, canonical
  dependency tuple, context/contact links, 1 real note/revision/activity/receipt,
  User XP/coins and every finance/Japanese record. No event date was inferred or
  changed and no retrospective activity was manufactured.
- Fresh `phase06-dev-cutover-before.json` still matched the backup baseline.
  Stopped only development; explicit migrate deploy without seed; comparison
  `phase06-dev-cutover-before.json` → `phase06-dev-cutover-after.json` with
  `--phase 06`: **no original differences/issues**, zero follow-ups/key dates and
  no deadlines on old records. Generated Prisma client and force-recreated only
  development with the existing work-dev override; no production deployment.
- Repeat isolated deploy reported no pending migrations. Comparison
  `phase06-repeat-before.json` → `phase06-repeat-after.json`: no differences/issues.
- Read-only Prisma drift check showed only the pre-existing unrelated
  ActivityVocab.lastPracticed column. Proposed DROP SQL was **not executed**.
  No work-schema drift appeared; no db push/reset or unrelated cleanup was used.

### Executed tests and checks

- `node --test tests/*.test.mjs`: **27 test files passed**. New work-date checks
  include process zones UTC/Tokyo/Los Angeles, configured app-zone override and
  invalid configuration, Toronto midnight boundaries, exact equality versus
  strict overdue, leap/invalid dates, DST gap/fold earlier/later, 23/25-hour days,
  mixed timed/date-only sorting and configured-zone date filters. Existing finance,
  Japanese, auth, graph, notes, task and calendar unit regressions also passed.
- Isolated serial integration command in OPERATIONS.md: **56 TAP checks passed,
  no failures/skips**. New date suite covers optional/changed/cleared deadlines,
  unchanged event times/priority/status/rewards, invalid input rollback, follow-up
  completion/snooze/cancellation/retry, competing create/snooze/complete requests,
  DB active uniqueness and date/lifecycle CHECKs, closure/reopen/archive policy,
  retained key dates/history/soft removal, parent/record ownership, stale writes,
  21-record history/key-date pagination, mixed sorting/filters and late audit
  failure rollback of deadline/replacement/retirement/history/receipts/rewards.
  All prior Phase 01–05 work and event integration regressions passed.
- `RUN_WORK_DATES_BROWSER_TEST=1`: passed against real isolated DB/API with
  server TZ=UTC and browser Asia/Tokyo at **390×844, 844×390, 1440×900,
  2560×1440**. Touch/keyboard, date-only preservation, overdue labels, complete/
  snooze history, closure/reopen retirement, DST errors with retained draft,
  explicit repeated-time choice, independent key date, deadline clearing,
  undated Urgent filter/sort and viewport width checks passed. No runtime errors;
  inspected `/tmp/work-phase06-desktop.png`.
- Existing Phase 01 mocked controls and Phase 02–05 real foundation, All Work,
  notes/files and graph browser suites: **all five passed**, four sizes each,
  sequentially, with no runtime errors. No DB suite ran concurrently with these
  whole-DB rollback assertions in the final run.
- Isolated final-source `npm run build` in /tmp/dashboard-work-build passed;
  source TypeScript, targeted changed-path ESLint and `git diff --check` passed.
  Full-repository lint retains prior unrelated/generated/private-directory issues;
  it is not claimed clean. No private permissions were weakened.

### Suggested manual acceptance

1. Open a disposable task, set a date-only deadline and then an exact deadline;
   check the distinct labels/zone and try clearing it. Confirm linked event times
   do not move, and priority does not change.
2. Set Waiting with an optional follow-up. Snooze and complete it, then inspect
   Follow-up history and All activity. Task/deadline remain unchanged.
3. Close a task with an active follow-up, then reopen. Deadline remains, overdue
   returns when appropriate, history remains and no reminder is recreated.
4. Add Delivery/Launch/custom key dates, edit/remove one and inspect its activity.
   They must never cause task completion or appear as a deadline.
5. Try Toronto 2026-03-08 02:30 (gap) and 2026-11-01 01:30 (fold), choose a fold
   occurrence explicitly, and repeat in a browser set to another timezone.
6. Filter/sort All Work by dates and find an undated Urgent task. Edit a date in two
   windows: stale save must retain the draft and require reload rather than rebase.

Limits: Chromium emulation is not physical mobile/Safari testing. Due indicators
refresh on reads, with no notification/background scheduler. Sorting is designed
for this personal app, not benchmarked at enterprise scale. Existing combined
file-backup rules remain applicable; no uploaded document bytes were moved in this
phase. Production recovery/deployment is untested and unauthorized. No Phase 07
calendar projection, work session, conversion, external calendar or notification
was implemented. Next assignment: Phase 07, not started automatically.

### Final Phase 06 checks

Live development `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs`
passed across **122 protected handlers**, page redirects, denied identities,
forged/legacy cookies and owner access, including explicit date-route reads.
No secret was printed and no real user mutation was performed. Final unit suite
including configured app-zone override/invalid configuration passed all 27 files.
The final build, source TypeScript, targeted lint and whitespace checks passed.

Final `phase06-dev-final.json` comparison to post-cutover: no differences, no
issues and no pending migration; live auth verification made no record changes.
The final 56-check DB rerun additionally allowed follow-up retirement and reward
writes before injecting a completion-audit failure: all changes rolled back.
Isolated test app/database were stopped without deleting volumes/evidence;
development remains running. Documentation fences and final whitespace check passed.
Phase 06 is complete in development. Phase 07 has not started.


## Phase 07 — Existing calendar integration (2026-11-10)

Implemented only Phase 07, plus the requested development examples. Phase 08 is
not started. The existing `/events` page, Event IDs/detail URLs, activity labels,
completion and TBD behavior remain. Event kind (ordinary / informational / work
session) is separate from its existing ActivityType label/color. Busy/free is
explicit; old rows retain unknown availability and their original timed values.

### Sources and relationships

- `Todo` remains canonical. Calendar deadlines, active follow-ups and key dates
  are bounded projections of their original records, never additional Events.
  Stable typed IDs and source links prevent confusing a deadline with an event.
- `EventTaskLink` is authoritative. The central event service writes links and
  updates the compatibility `linkedTodoId` mirror only for one association. Old
  scalar mutations delegate to that service and reject ambiguous multi-links.
  Backfill preserves the original pair as RELATED / LEGACY, never a session.
- Work sessions reuse Event.date/endDate with exactly one explicit owned target;
  several sessions and related tasks are allowed. Server and deferred DB checks
  enforce valid timing/target. Task deletion cannot orphan a session target or
  conversion ledger; normal archival preserves events. Event deletion keeps tasks.
- All-day ranges have explicit calendar dates and exclusive ends. Legacy SQL
  timestamp(3) values use the existing Prisma UTC convention and were not cast,
  rewritten or guessed to be all-day. Metadata-only editing preserves exact
  legacy instants, including milliseconds.
- The owner-only feed has explicit range/layer/context/size bounds. Month, Week
  and Day share the existing calendar; matching FullCalendar v6 timegrid/luxon3
  plugins supply usable timed sessions and named-zone rendering. Markers have
  labels/icons, open their source forms and cannot masquerade as duration blocks.
- Session drag/resize proposes an explicitly confirmed Event-only move; forms
  provide touch/keyboard alternatives. Neither session completion nor elapsed
  time completes tasks. Closure offers future-session review, preserves sessions,
  hides actionable dates, and optionally displays closed date history. Reopening
  keeps the original deadline. Future-session revisions invalidate stale closure
  decisions.
- Conversion is preview/confirm with version and intent checks under the existing
  owner lock and retry receipt. Users explicitly retain a real related event or
  supersede a deadline placeholder. Source snapshot, original ID and decisions
  survive; repeated/concurrent confirmation creates one result. Undo keeps the
  task and links, never restores stale event fields, and restores a prior deadline
  only if its task has not subsequently changed. An explicit alternative keeps
  the current task deadline. Cross-owner legacy anomalies require review first.
- Rechecked recurrence: no existing recurrence model/engine was found. None added.

### Preservation and cutover evidence

Full development DB backup: private/work-management/phase07-dev-before.dump.
Initial `phase07-dev-before.json` and fresh `phase07-dev-cutover-before.json`
matched exactly. A fresh isolated database restored from that dump matched all
original row fingerprints, IDs, timestamps, relations and balances.

Migration `20261111120000_calendar_work_layers` applied first on the restored
copy, then explicitly on development while its app was stopped. Both comparisons
with inventory `--phase 07` reported **no original differences and no issues**.
Original 3 tasks, 5 checklist rows, 17 events, 1 existing note and all unrelated
finance/Japanese records survived. One legacy link became a RELATED / LEGACY
edge; no dates/statuses/rewards were inferred. The conversion/activity tables
started empty. Repeated deployment on the isolated copy had no pending migrations
and identical row fingerprints. Read-only schema diff showed only the pre-existing
ActivityVocab.lastPracticed drift; no suggested DROP was executed.

The development image was rebuilt with the plugins and the app recreated with a
fresh anonymous dependency volume. Named database/private-file volumes remained.
Development is running with all 33 migrations applied. Production was untouched.

### Requested development examples

The opt-in `seed:work-examples` command was first rehearsed on the copy, then run
on development with ALLOW_WORK_EXAMPLES=1. It added **14 labelled tasks, nine
new events**, two synthetic contacts, checklist/child/dependency examples, one
active follow-up, two informational key dates and a synthetic note. Zero rewards.
Examples cover School/Work/Personal, urgent undated work, Waiting, Done/Cancelled,
appointments versus preparation deadlines, multiple sessions, a related-task
session, all-day birthday/reading week, TBD and cross-month work.

Only exact, unlinked, unchanged rows from the original calendar demo seed were
eligible for alteration: **nine verified samples updated; two deadline
placeholders explicitly converted**, preserving their IDs and source snapshots.
The nonmatching old sample and all non-example records were left alone. This is
an explicitly requested example update, separate from the lossless migration.
The existing seed now recognizes this manifest and cannot recreate the replaced
placeholders. No automatic seed was introduced.

`phase07-dev-after-examples.json` was checked against the post-migration inventory:
every original non-example row still matched, including User balances and all
original tasks/notes and unrelated module data. Repeating the command returned
reused=true; `phase07-dev-final.json` showed no differences/issues/pending migrations.
Per-month deterministic command receipts make partial retries resumable and
completed runs no-ops, including after subsequent user edits.

### Executed verification

- `node --test tests/*.test.mjs`: **28 test files passed**, no skips/failures.
- Serial isolated DB suites including `work-calendar.integration.mjs` and all
  previous task/event regressions: **68 TAP checks passed**, no skips/failures.
  Covered source isolation, ownership, one/multi-links, legacy compatibility,
  backfill retry, DB constraints, ranges/limits/filters, all-day/DST/cross-month,
  session closure/history/stale decisions, retained/superseded conversions,
  concurrency/replay, safe undo after later edits and late-failure rollback.
- `RUN_WORK_EXAMPLE_TEST=1` example integration test passed, including exact
  preservation of original non-example rows and repeat-load fingerprints.
- All seven work browser suites passed serially at 390×844, 844×390, 1440×900 and
  2560×1440. New calendar suite used real DB/API, UTC server and Tokyo browser;
  additionally rerun for actual pointer-drag confirmation, source-marker keyboard
  navigation, native all-day entry, metadata-only millisecond preservation and
  conversion/undo. No runtime page errors. Screenshots are local /tmp artifacts.
- Live development `RUN_AUTH_HTTP_TEST=1`: **128 protected handlers**, denied
  identities/anonymous/forged sessions, page redirects and owner reads passed,
  including the aggregate feed and per-task calendar. Preview did not save practice.
- Final-source isolated `npm run build`, development Docker image build, source
  TypeScript and whitespace checks passed. Targeted ESLint for changed source,
  scripts and tests passed, excluding existing CommonJS prisma/seed.js (its
  pre-existing require imports fail that lint rule; node --check passed).
  Full-repository lint is not claimed clean.

Commands, link ownership, example and recovery procedures are in OPERATIONS.md.
Acceptance coverage for this phase is recorded in ACCEPTANCE.md. Limitations:
Chromium emulation is not physical-phone/Safari testing; no production deployment
or recovery was performed; no recurrence, notifications, external calendar, project
or My Work phase was added. Existing dependency audit findings were not fixed as
part of this calendar scope. Stop here; next assignment is Phase 08.

### Phase 07 finalization after interruption

The final calendar browser rerun passed all four sizes (54 seconds, no runtime
page errors), including long-label containment. The final-source isolated Next
build and final changed UI/test lint passed. Documentation fences and whitespace
passed. The isolated Phase 07 browser app and database were stopped without
removing their volumes/evidence; development app/database remain running. The
existing user change to the development banner in AppShell.tsx was preserved.
Phase 07 is complete in development; Phase 08 remains unstarted.

## Phase 08 — Projects, stages and milestones (2026-11-10)

Phase 08 is implemented and verified in development. No Phase 09 feature or production operation was started.

### Implementation and decisions

- Added `WorkProject` and `WorkProjectStage`, optional Todo.projectId/stageId and
  `20261112120000_work_projects`. Projects have stable references, objective,
  summary, context, planning dates, lifecycle/closure/archival and immutable
  activity. Stages organize original tasks and never replace their statuses.
- Compound foreign keys enforce task/project ownership and stage membership;
  CHECKs enforce lifecycle/dates and stage-requires-project. Moves are one-task
  commands, logged on the task and affected projects, preserving IDs/URLs, dates,
  checklist, children, notes, dependencies, related links, events and rewards.
  Children can have different membership; cross-project links remain valid.
- Shared WorkNote, WorkAttachment and WorkKeyDate records gained exclusive
  task/project parents. Their original fields/IDs/FKs survive. Project support
  ownership has DB triggers as well as service checks. Notes, revisions, activity,
  private validation/download/replace/remove/cleanup and parent-scoped drafts reuse
  the earlier implementation. No new file root, volume or dependency was added.
- `/projects` list/detail/navigation reuse ProtectedLayout and existing styles.
  Project tasks use the same All Work query/list/board/panel/full-page controls,
  including stage filters. Task details expose explicit membership, while All Work
  and the existing Calendar expose searchable, paginated project filters. Standalone
  tasks remain supported. Capture defaults visibly to the project's context.
- Informational project milestones reuse key-date DATE/TIME/DST rules and explicit
  reached state. Existing calendar Key dates projects stable milestone IDs/source
  links; no duplicate Event or task date is created. Project and context filters
  jointly match owned related tasks; standalone filtering includes unlinked events.
- Progress is Done/nonarchived non-Cancelled direct members, with unfinished,
  Cancelled and archived counts separately labelled. Child tasks count separately
  only if explicitly assigned. No effort percentage or automatic project closure.
- Fresh project closure review fingerprints project/member revisions and requires
  explicit acknowledgement of unfinished work. Closure, reopen, archive and restore
  preserve all tasks, follow-ups, milestones, appointments, sessions and rewards.
  Prior closure data stays in automatic activity after current fields are reset.
- New API handlers authenticate first, scope all reads/mutations/versions to the
  owner, use no-store responses and share the existing advisory lock and UUID
  receipts. Development logging excludes private project search URLs.

### Preservation and development cutover

Private artifacts: phase08-dev-before.dump/json, phase08-copy-before/after.json,
phase08-dev-cutover-before.dump/json, phase08-dev-cutover-checked.json and
phase08-dev-cutover-after.json under private/work-management/.

The full development backup was restored into a confirmed-empty isolated database;
its baseline matched every original row fingerprint. After the additive migration,
comparison --phase 08 reported no original differences/issues. No project, stage,
historical membership/date/note or activity was backfilled.

Before actual cutover the development app was stopped and a fresh full dump and
inventory captured. A new preservation guard initially mistook absent pre-migration
columns for assigned membership; it was corrected and a unit regression added.
The rechecked baseline matched the initial snapshot exactly. Development migration
and post-cutover comparison then passed with no original differences/issues and
no pending migrations. All original 17 tasks, six checklist rows, 26 events, two
notes, 360 financial transactions, 90 vocabulary rows and all other original data,
relationships, timestamps and balances survived. All tasks remain standalone;
project/stage tables begin empty. No project examples or general seed were run.

All 34 migrations are applied. Development was recreated with the no-seed override
and refreshed generated client; named DB/work/finance volumes were preserved.
Production was not operated on. The existing user development-banner change in
AppShell.tsx was left intact.

### Manual acceptance

1. Create Work/School/Personal projects, edit objective/summary and planning dates,
   then rename/reorder/deactivate a stage. Task statuses must stay independent.
2. Create a project task and move an existing task into/out of a project/stage.
   Check its original reference, dates, checklist, relationships and full URL.
   Put a parent and child in different projects; neither should move the other.
3. Filter the same tasks in project list/board, All Work and Calendar. Add/edit/
   reach/remove a milestone and follow its calendar link back to the project.
4. Add/edit/remove a project note, view revisions/All activity, upload/replace/
   download/remove an image/PDF and try another parent's URL. Files remain private.
5. Review closure with unfinished members, keep them explicitly open, then reopen,
   archive/restore and find the project in history. Inspect retained task/session
   records and progress exclusions.
6. Edit the same membership/project in two windows. A stale save must retain the
   draft and require deliberate reload rather than silently overwriting changes.

Executed evidence and remaining limits follow. Next phase is 09; do not start it automatically.


### Phase 08 executed verification and limits

- Whole-development backup restored into an empty isolated database and exact
  before/after migration inventories matched. Original row values/IDs, FKs,
  timestamps, enum values, links and balances survived both rehearsal and actual
  development cutover. Final live authorization inventory also matched exactly;
  no original differences/issues or pending migrations.
- Repeat isolated migrate deploy reported no pending migrations; before/after
  row fingerprints matched. Read-only schema diff showed only the pre-existing
  ActivityVocab.lastPracticed difference. No suggested DROP was executed.
- `node --test tests/*.test.mjs`: **29 test files passed**, no failures/skips,
  including a new preservation regression for absent pre-migration columns versus
  guessed project/stage assignment or fabricated project rows.
- Serial isolated project plus prior work/calendar DB suites: **83 TAP checks
  passed**, no failures/skips. New project tests cover retry/concurrency, original
  task identity/fields, checklist/children/cross-project dependency preservation,
  foreign-owner/stage mismatch, DB constraints, standalone/new/moved membership,
  inactive stages, Cancelled/archived progress exclusions, parent-specific notes/
  revisions/files/cleanup, milestone DATE/TIME/DST/state/projection, joint and
  standalone calendar filtering, versioned closure/history/reopen/archive, retained
  sessions, explicit task deletion audit and late-audit rollback of membership,
  versions, activity and receipts.
- Closure warnings deliberately count **all unfinished members including archived
  ones**, even though archived records are excluded from progress. The dedicated
  regression proves a zero-denominator project still requires acknowledgement of
  its archived unfinished task. No task/session is silently completed or removed.
- All **eight work browser suites passed serially** against real isolated APIs
  (except the explicitly mocked Phase 01 control suite) at **390×844, 844×390,
  1440×900 and 2560×1440**. They cover existing All Work, lifecycle, notes/files,
  graph, dates and calendar controls plus new project list/editor/stages, original
  task panel/board, native dates, notes, original bytes and milestone source links.
  Server UTC/browser Tokyo remained independent of app-zone dates. Runtime page
  errors were absent. Inspected /tmp/work-phase08-desktop.png.
- The final project browser suite was additionally rerun at all four sizes after
  tightening archived-member closure and project task-list refresh. It explicitly
  exercised the zero-denominator archived-work acknowledgement and refreshed list
  after archive/unarchive; passed without runtime errors. Its fixture cleanup and
  the calendar suite now always close Chromium if cleanup itself fails.
- An earlier browser batch was interrupted by a development-server reload during
  source editing and its cleanup hung; the completed eight-suite run used frozen
  source. An earlier DB fixture cleanup split session-link/event deletion across
  commits; making that fixture cleanup transactional fixed it. These failed runs
  are not counted as passed evidence.
- Live `RUN_AUTH_HTTP_TEST=1`: **149 protected API handlers**, page redirects,
  anonymous/denied/forged identities and owner reads passed, including project
  list/detail/support endpoints and the existing finance/Japanese preview checks.
  Repeated on finished source; final data inventory was unchanged.
- Final-source isolated `npm run build`, source TypeScript, targeted changed-path
  ESLint and whitespace checks passed. Full repository lint is not claimed clean
  (prior unrelated/generated/private-directory issues remain). No dependency or
  Docker/volume/configuration subsystem was added.

Commands and constraints are in OPERATIONS.md. Exact whole-DB fingerprints and
backup artifacts remain private; /tmp logs/screenshots are local test artifacts.
Combined backup code was inspected: work originals are selected independently of
parent type, so project files remain covered. This phase restored the database and
verified new private uploads/original reads, not a new physical NAS/whole-file
recovery rehearsal. Existing Phase 04 file-restore evidence remains applicable.
No original uploaded bytes were moved or permissions weakened.

Limits: Chromium emulation is not physical phone/camera/Safari testing. This is a
personal dashboard, not an enterprise-scale performance benchmark or an exhaustive
finance/Japanese browser re-test. Production deployment/recovery remains untested
and unauthorized. Project examples were not seeded into primary development.
No Phase 09 focus/My Work, portfolio/resources, budget, time tracking, AI, external
calendar, recurrence or notifications were implemented. Stop here; next assignment
is Phase 09.

### Phase 08 final state

Final repeat-migration inventory: no differences/issues/pending migrations.
Final development inventory after live auth: no differences/issues/pending
migrations; project/stage tables remain empty and original task memberships remain
null. Final unit suite passed all 29 files; final targeted lint, isolated build,
TypeScript, documentation fences and whitespace checks passed. The isolated
browser app and database were stopped without deleting volumes or evidence.
Development app/database remain running. Phase 08 is complete in development;
Phase 09 has not started.

## Phase 09 — My Work and focus planning

Date: 2026-11-11 (America/Toronto).

### Implementation and rules

Added protected `/my-work`, its sidebar entry, `/api/my-work`, and GET/POST
`/api/todos/:id/focus`. Existing All Work, projects, task references, detail panels
and calendar URLs remain canonical. My Work opens the shared task panel and links
sessions to their original event and due follow-ups to the task's date controls.
Context/company/course/project filters and section links reuse shared queries;
`/todos?planning=...` uses the same predicates as the corresponding section.
Quick capture displays its context, optional company/course and selected project;
creation still defaults to New/Normal. No task copies or inferred context changes.

The ten task sections show New, today's focus, overdue, upcoming, due follow-ups,
Waiting, Blocked, Urgent, no deadline and Backlog. Each shows its total and at most
six tasks, ordered by the existing priority ordering then updated time/ID. Counts
can overlap; the header's active-task total counts unique filtered open tasks,
not the sum of sections. Some active work may belong to no daily section.

- All task sections exclude Done, Cancelled and archived tasks.
- Overdue means a date-only deadline before today or an exact deadline before now.
  Upcoming covers today and the next six local calendar dates; exact times start
  at now and end at local midnight seven dates after today, exclusive.
- Follow-ups require ACTIVE status and a date at/before today or time at/before
  now. Waiting is an explicit task status. Blocked uses the existing unresolved
  prerequisite/legacy-review rules; it is independent of Waiting.
- Urgent uses the explicit priority, independently of deadline. No deadline means
  neither date-only nor exact deadline. Backlog uses its explicit status.
- Today's sessions are uncompleted WORK_SESSION events overlapping the local day,
  with an owned SESSION_TARGET. They are paginated six at a time, counted as
  events rather than tasks. Closed/archived targets stay labelled on these real
  reservations. Informational events/key dates are not work sessions; time passing
  or a session remaining visible never completes a task.

`WorkFocus` is a small separate owner/task/local-date record. Its compound primary
key prevents duplicate pins, its compound task/owner FK prevents cross-owner
links, and its date CHECK rejects invalid dates. Removal retains an inactive row
and audit history. Mutations use the existing owner lock, UUID request key,
If-Match revision and atomic activity/receipt protocol. They change technical
revision/updated timestamps and focus/audit records, not task status, priority,
deadline, follow-ups, calendar times, XP or coins. Same-state writes are no-ops.

Only today's configured planning date can be changed. The server checks the live
day after obtaining the mutation lock, so a queued request cannot pin yesterday
across midnight. Previous dates never automatically carry over or become overdue.
Closing/archiving hides focus from unfinished work without deleting its history;
same-day reopening/restoring shows an unchanged active pin again. Hard task deletion
rejects retained focus history; archive instead. Reads never create focus rows.

Snapshot queries share one request clock, including displayed deadline/follow-up
states. Local dates use the configured application zone (Toronto by default),
not the device/server zone. My Work and task focus controls refresh while visible
and at the next local midnight; My Work also refreshes on returning to the tab.
This is refresh, not notifications. Dashboard task/event tiles retain their unrelated behavior, add
canonical navigation and clear loading/error states, and use authoritative date
semantics. The existing events array response is preserved; an X-App-Time-Zone
header lets the dashboard render even an empty calendar in the configured zone.

### Preservation and development cutover

Added transactional migration `20261113120000_work_focus`: an empty WorkFocus
table, date constraint, supporting index and Todo `(id,userId)` unique index/FK.
No historical focus is fabricated and no existing values are backfilled. There
are 35 migrations after this phase. No dependency was added.

Saved a whole-development database dump, restored it into an empty isolated
Phase 09 database and compared original fingerprints before and after migration.
The existing user-created project and four stages were preserved. Migration was
then explicitly applied to development with the app stopped and another fresh
whole-DB backup. Cutover inventories have no original differences, integrity
issues or pending migrations; WorkFocus initially has zero rows. Original task,
event, date, support, reward, finance and Japanese records remain unchanged.
Artifacts are private `private/work-management/phase09-*.dump` and `.json` files;
SQL/data contents are not published in this log. Production was not connected.

The user's pre-existing development banner change in AppShell.tsx is preserved.
No seed, example-data rewrite, production deployment or Phase 10 work is included.

### Executed verification so far

- `node --test tests/*.test.mjs`: **30 test files passed**, no failures/skips.
  New planning tests exercise Toronto midnight, 23/25-hour DST days, year crossing,
  UTC/Tokyo process zones and independent section predicates.
- Serial isolated work/calendar database suites: **94 TAP checks passed**, no
  failures/skips. Focus coverage includes retry/concurrency/stale revisions,
  same-state no-ops, technical-only changes, audit failure rollback, date/owner
  constraints, filtered overlap counts, consistent snapshot-clock labels, seven
  sessions across pages, archived-target reservations, closure/reopen/archive,
  no carryover and a request waiting across midnight for the owner lock.
  Whole-database fingerprints also verify that My Work reads do not write.
- The new real My Work browser suite passed at 390×844, 844×390, 1440×900 and
  2560×1440, with a Tokyo browser and UTC server. It exercises context/company
  capture, long titles, pin/unpin in the shared panel, closure/reopen, urgent
  undated work, filtered All Work links and error/retry without page runtime
  errors or horizontal overflow. Inspected `/tmp/work-phase09-desktop.png`.
- TypeScript and targeted changed-path ESLint passed. Final production build,
  nine-suite browser regression, live authorization, repeat-migration and final
  inventory outcomes are recorded below when complete.

Limits: Chromium emulation is not physical phone/Safari testing or a performance
benchmark. No exhaustive finance/Japanese browser rerun, NAS restore, production
cutover or Phase 10 acceptance is claimed. Existing private-file backup coverage
continues unchanged: this phase introduces database records, not another file
storage root. Focus history is retained in task activity/database records; a new
historical planning report is outside scope.

### Phase 09 final-source build and live access checks

- Isolated final-source `npm run build` passed. Source TypeScript, targeted ESLint
  across changed JS/TS paths (excluding the user's unchanged banner edit) and
  `git diff --check` passed. No full-repository lint-clean claim is made because
  pre-existing unrelated/generated/private-directory lint issues remain.
- Live `RUN_AUTH_HTTP_TEST=1` passed: **152 protected API handlers**, protected page
  redirects, anonymous/non-owner/forged identities and owner reads, including the
  new My Work/focus paths and existing finance/Japanese preview checks. The final
  development inventory after these reads has no differences/issues/pending
  migrations. WorkFocus remains empty in primary development; browser/DB examples
  ran exclusively in the isolated copy.
- A separate read-only dashboard browser check passed at all four viewport sizes:
  task/event loading, My Work and canonical All Work navigation, plus deliberate
  browser-local 503 responses followed by successful retries against the real API.
  No page runtime errors. This test does not create fixtures or claim financial/
  Japanese dashboard totals were exhaustively revalidated.
- Read-only schema comparison still shows only the known unrelated
  ActivityVocab.lastPracticed difference; no generated SQL was executed. Both
  saved whole-development dumps are nonempty mode 0600 files, and PostgreSQL
  successfully listed the fresh cutover archive. The initial whole backup was
  actually restored and compared in isolation before migration.

### Phase 09 final state

All **nine work browser suites passed serially**, no failures/skips, against frozen
application source at 390×844, 844×390, 1440×900 and 2560×1440. Eight use the real
isolated app/APIs; the existing Phase 01 control suite deliberately mocks its
requests. The new dashboard test was subsequently added to the focus browser file
and passed in a separate targeted invocation against real reads, with explicitly
mocked 503 failure responses for retry checks. New My Work and dashboard tests
reported no page runtime errors. No primary-development fixture writes occurred.

After browser writers stopped, repeated isolated migration deployment reported
no pending migrations and before/after inventories showed no record differences
or integrity issues. Read-only drift output was left unapplied. Development's
post-auth inventory likewise has no differences/issues/pending migrations.

Final evidence: 30 unit-test files; 94 serial DB TAP checks; nine browser suites
plus the separate dashboard test; 152 live protected-handler checks; TypeScript,
final-source production build, targeted lint, whitespace and documentation fences
all passed. Logs and screenshots under /tmp are local artifacts, not backup storage.
Whole-DB backups and exact inventories remain private under private/work-management.

The disposable browser app and database were stopped without deleting volumes or
evidence. Primary development app/database remain running. Production is untouched.
Phase 09 is complete in development. Stop here; Phase 10 has not started.

## Phase 10 — Reliability, cumulative rehearsal and handover

Date: 2026-11-11 (America/Toronto).

### Scope and findings

Read the shared context, acceptance/progress/operations decisions, phase scope and
actual model/service/routes/UI/tests/storage/Compose configuration. Phases 01–09
were implemented with development evidence. The only pre-existing uncommitted
change was the user's AppShell.tsx development banner; it remains untouched.
No production connection/deployment, live record mutation, reset, automatic seed,
credential change, external notification or new feature module was performed.
No historical migration or dependency manifest changed; Phase 10 adds no schema
migration. The known unrelated ActivityVocab.lastPracticed drift remains intact.

Reliability changes:

- All Work now exposes the My Work Planning section filter. Switching to completed
  history/archive/non-active views or selecting a closed status clears its
  incompatible open-task predicate. Selecting a planning section restores the
  active view. Shared client-safe labels avoid duplicate daily section naming.
- My Work context-catalog failures have a separate retained error and Retry
  contexts action. Retrying data alone previously could clear the message without
  reloading the failed context list. Capture text is not cleared by this retry.
- Work malformed/unexpected error responses now explicitly carry no-store, like
  successful/domain-error responses. Tests capture logger output and prove internal
  note/request content appears in neither response nor logs.
- Combined backup refuses an auto-remove app before stopping it, preventing loss
  of the source container. It also verifies matching Compose project, configured
  DB hostname/service and database name before selecting app files plus DB rows.
  Tested all three refusal cases; sources remained running. Correctly matched
  sources still back up/restore successfully. No new environment setting is needed.
- Legacy migration fixtures now use a bounded unchanged migration workspace, so
  old Phase 02/05 tests do not accidentally apply later phases. Added reusable
  guarded chain rehearsal, recovery/compatibility and volume/concurrency checks.
- Added an opt-in full showcase restricted to an empty work_examples test DB and
  separate file volume, with server-retained manifest archival and repeat safety.

Files: scripts/rehearse-work-migrations.mjs, scripts/work-showcase.mjs,
scripts/finance-backup.mjs; work types/validation, AllWork/MyWork; work browser,
unit, legacy-migration and new reliability/recovery/showcase tests; HANDOVER.md,
SYNTHETIC_EXAMPLES.md, shared operations/acceptance/progress and README links.

### Cumulative real-data rehearsal and exact preservation

A suitable private original baseline exists: phase01-dev-before.dump plus its
saved inventory. Restored it into a confirmed-empty isolated Phase 10 work_test
DB. Comparison to the saved baseline reported no differences or integrity issues.
It contains **30 original public record tables, three tasks, five checklist rows
and 17 events**, plus original Japanese/finance data and User reward totals.

Ran all nine work stages with unchanged historical SQL, saving a private inventory
at each stage and repeating deployment after every stage. Reached **35 total
migrations** from 25 earlier migrations (10 work SQL files across nine phases).
Every phase's original-field/ID/relationship/schema comparison passed; every
repeat preserved record fingerprints. Original raw status/priority, timestamps,
checklist IDs, dependency direction, event associations, finance decimal values,
Japanese progress and User balances survived. Final pending migrations are empty.

Intentional additions are the previously reviewed technical revisions/reward
reversal baseline, named-priority mapping and context catalog/defaults; canonical
legacy dependency/event links with provenance; nullable unknown metadata/dates/
membership; empty new supporting/date/project/focus tables and additive indexes/
constraints. No historical note, closure/date, session, focus or project assignment
was inferred. Original fields and values were never replaced by these additions.
Private chain artifacts: private/work-management/phase10-chain/ (before, each
stage, migration/repeat logs and report); phase10-restored-legacy.json verifies
source restore equality. They contain private full rows; do not publish them.

Additional separate historical copies passed:

- Null/unknown priorities and custom-status preservation, future defaults, retained
  timestamps and repeated Phase 02 deployment.
- Legacy self/cycle-path/cross-owner dependencies, exact tuple direction,
  preserved checklists/calendar links/balances, repeated raw conflict-safe backfill
  and repeated Phase 05 deployment. Anomalies stay reviewable, not silently repaired.
- Actual interruption of the unchanged Phase 09 migration while blocked on the
  Todo table lock. Terminated only its migration backend in work_recovery; its DDL
  rolled back. Prisma blocked blind retry. After catalog/fingerprint verification,
  explicit resolve --rolled-back and redeploy/repeat succeeded. The tested enum
  transaction also reproduced unsafe uncommitted-value error 55P04 and rolled back.
- A separately generated minimal legacy-status Prisma client read original columns
  but rejected NEW. Thus a generic pre-redesign app rollback is unsupported even
  for general reads. New HTTP revision/replay guards and retired separate rewards
  prevent stale browser protocols from silently updating current data.

Interruption evidence covers the exercised real transaction/lock point, not every
possible crash in every historical statement. Early files lacking explicit
transaction boundaries require catalog/log review; do not assume rollback, edit
applied SQL, mark partial work applied or blindly restore over post-cutover writes.
The supported maintenance/compatible-release recovery procedure is in HANDOVER.md.

### Backup, original files and development preservation

Executed the combined tool against development using a fresh private local
snapshot, briefly stopping/restarting only the development app. Actual isolated
restore matched **49 public record tables, 12 finance originals and zero work
originals** (there are no primary-development work uploads). No live rows changed.

After isolated browser checks, copied only those backed-up finance originals into
the separate test finance volume, stopped browser writers and backed up the migrated
isolated DB plus task/project uploads. Restore matched **49 tables, 12 finance and
eight work originals**, including project and task supporting records. Repeated
with the final selector/container guards; the complete fresh restore again matched.
All referenced file sizes/hashes and full-table fingerprints passed. Source apps
with auto-remove, mismatched DB name, or different Compose projects were refused
before stop. No original files were moved/deleted; temporary restore resources were
isolated and removed by the existing verifier.

Local test backups: /tmp/dashboard-phase10-current-backup,
/tmp/dashboard-phase10-work-files-backup and
/tmp/dashboard-phase10-final-guarded-backup. These private local snapshots are
verification artifacts, not off-host durable backup storage. NAS DB-only backup
still does not include original files. Encryption/off-host scheduling/retention,
physical NAS restore and production recovery remain unverified operator work.

Read-only primary-development inventories phase10-dev-before.json and
phase10-dev-final.json match with **no differences/issues/pending migrations**.
This phase did not add examples or change real tasks, events, finance/Japanese rows,
notes, project membership, uploaded bytes or reward totals. Final repeat-migration
and drift checks are recorded below; no proposed DROP SQL was applied.

### Executed verification

- Final `node --test tests/*.test.mjs`: **31 test files passed**, no failures/skips.
  Includes guarded maintenance targets, exact cumulative-value preservation,
  error no-store/privacy and existing finance/Japanese/auth/date/reward regressions.
- Final serial isolated backend batch: **108 TAP checks passed**, no failures/skips.
  It includes all nine work phases, event completion, finance CRUD/transactions/
  receipts/income/CSV imports/reconciliation/reporting/exports, Japanese kanji
  writing and the new realistic-volume/concurrency suite.
- New volume suite: **1,000 synthetic tasks and 55 long notes**, bounded 30-task,
  20-history and six-planning pages, clamped out-of-range pages, mixed date sorts,
  no read mutations and competing note/file/project writes. One winner/one stale
  conflict, retained note versions, valid original bytes and intact project/stage
  membership. Fixture cleanup preserves every preceding record. Observed read
  batch was roughly 0.6 seconds locally; this is not an enterprise benchmark.
- Separate guarded recovery, actual legacy-client, legacy-priority/status,
  legacy-graph/backfill and showcase suites each passed. They use dedicated DBs,
  not concurrent writers to the browser/work_test snapshot.
- All **nine browser files / ten checks** are verified at 390×844, 844×390,
  1440×900 and 2560×1440. Eight prior work files passed in the serial run; the
  expanded My Work/dashboard file passed a final targeted rerun. Real APIs are
  used except the existing Phase 01 control mocks and explicit failure injection.
  UTC server/Tokyo browser remain separate from the configured Toronto dates.
  No runtime page errors in the final My Work/dashboard run. Inspected failure
  screenshot for diagnosis; final responsive behavior is asserted by the browser.
- The first My Work navigation regression timed out because its new completed
  fixture lacked the selected School context. The planning filter had cleared
  correctly; corrected the fixture's context and reran at all four sizes. That
  failed attempt is not counted as passed. Final rerun also exercised separate
  context-catalog 503/retry and the dashboard tile failure/retry checks.
- Live authorization passed: **152 protected API handlers**, page redirects,
  anonymous/non-owner/forged identity rejection and owner reads, including private
  work originals and existing finance/Japanese checks. No secret/token/raw record
  output was published. Prisma query logging remains disabled.
- Final-source isolated `npm run build`, source TypeScript, targeted changed-path
  ESLint and whitespace checks passed. Whole-repository lint and a production
  Docker-image/deployment run are not claimed. No dependencies were added.

The initial 103-check cross-module DB batch and five-check standalone load/race
suite also passed; 108 above is the combined final run, not a sum with duplicate
runs. Unit/build reruns followed actual fixes rather than counting retries twice.

### Synthetic workflow and handover

An empty dedicated work_examples DB received **16 tasks, 11 events and two
projects**, plus synthetic contacts, checklists, children/dependencies/related links,
project stages/milestone, independent dates/follow-up history/focus, task/project
notes/revisions, valid PNG/PDF originals and explicit legacy conversion. The full
seed repeated unchanged. Exact-manifest archive/retry passed and left an unrelated
sentinel task and User balances untouched. It retains original/history records;
this is archival, not permanent erasure. The dataset never touched restored real
records or primary development. Start a new isolated project for a fresh showcase.

HANDOVER.md documents model/service/routes, owner 1 mapping, date/graph/reward rules,
private roots/backup, migration and rollback limits, environment/testing needs,
query scaling limits, manual acceptance and a future deployment/recovery checklist.
SYNTHETIC_EXAMPLES.md gives exact opt-in setup/seed/preview/archive commands.
ACCEPTANCE.md reconciles all IDs with evidence and explicitly limited checks.

Remaining unverified: production runtime/proxy/HTTPS/session/network conditions,
physical phone/camera/Safari, host reboot/power-loss at every migration point,
actual old-release deployment, encrypted/off-host/NAS restore and exhaustive
finance/Japanese browser workflows. No production-specific acceptance is implied.
No new integration, notification, AI, recurrence, time tracking or later module.

### Phase 10 command record

Commands below were executed against the standalone Phase 10 project (local log
redirection omitted). The base runner provides the disposable guard and work DB
flag. Recovery/legacy/example tests use the dedicated URLs documented above.

```sh
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit

# Existing and new backend checks, final combined 108-check run:
docker compose -p dashboard-work-phase10 -f docker-compose.work-test.yml run --rm --no-deps \
  -e RUN_WORK_FOCUS_DB_TEST=1 -e RUN_WORK_PROJECT_DB_TEST=1 -e RUN_EVENT_DB_TEST=1 \
  -e RUN_FINANCE_DB_TEST=1 -e RUN_FINANCE_TRANSACTION_DB_TEST=1 \
  -e RUN_FINANCE_RECEIPT_DB_TEST=1 -e RUN_FINANCE_INCOME_DB_TEST=1 \
  -e RUN_FINANCE_STATEMENT_DB_TEST=1 -e RUN_FINANCE_RECONCILIATION_DB_TEST=1 \
  -e RUN_FINANCE_REPORT_DB_TEST=1 -e RUN_FINANCE_EXPORT_DB_TEST=1 \
  -e RUN_KANJI_DB_TEST=1 -e RUN_WORK_RELIABILITY_DB_TEST=1 \
  runner node --test --test-concurrency=1 \
  tests/work-focus.integration.mjs tests/work-projects.integration.mjs \
  tests/work-calendar.integration.mjs tests/work-dates.integration.mjs \
  tests/work-relationships.integration.mjs tests/work-support.integration.mjs \
  tests/work-all.integration.mjs tests/work-foundation.integration.mjs \
  tests/work-management.integration.mjs tests/event-completion.integration.mjs \
  tests/finance.integration.mjs tests/finance-transactions.integration.mjs \
  tests/finance-receipts.integration.mjs tests/finance-income.integration.mjs \
  tests/finance-statements.integration.mjs tests/finance-reconciliation.integration.mjs \
  tests/finance-reporting.integration.mjs tests/finance-export.integration.mjs \
  tests/kanji-writing.integration.mjs tests/work-reliability.integration.mjs

# Live read-only authorization:
docker compose -f docker-compose.dev.yml exec -T -e RUN_AUTH_HTTP_TEST=1 \
  dashboard node tests/auth-security.integration.mjs

# Full browser batch; one initial new fixture failed, final targeted rerun below passed:
LD_LIBRARY_PATH=/tmp/work-browser-libs/extracted/usr/lib/x86_64-linux-gnu \
NODE_PATH=/tmp/work-browser/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/work-browser-cache \
RUN_WORK_FOCUS_BROWSER_TEST=1 RUN_WORK_PROJECT_BROWSER_TEST=1 \
RUN_WORK_MANAGEMENT_BROWSER_TEST=1 RUN_WORK_FOUNDATION_BROWSER_TEST=1 \
RUN_WORK_ALL_BROWSER_TEST=1 RUN_WORK_SUPPORT_BROWSER_TEST=1 \
RUN_WORK_RELATIONSHIPS_BROWSER_TEST=1 RUN_WORK_DATES_BROWSER_TEST=1 \
RUN_WORK_CALENDAR_BROWSER_TEST=1 \
node --test --test-concurrency=1 tests/work-focus.browser.mjs tests/work-projects.browser.mjs \
  tests/work-management.browser.mjs tests/work-foundation.browser.mjs tests/work-all.browser.mjs \
  tests/work-support.browser.mjs tests/work-relationships.browser.mjs \
  tests/work-dates.browser.mjs tests/work-calendar.browser.mjs

LD_LIBRARY_PATH=/tmp/work-browser-libs/extracted/usr/lib/x86_64-linux-gnu \
NODE_PATH=/tmp/work-browser/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/work-browser-cache \
RUN_WORK_FOCUS_BROWSER_TEST=1 node --test tests/work-focus.browser.mjs
```

Build ran as `npm run build` in /tmp/dashboard-phase10-build with final source
copies and isolated output. Source TypeScript and changed-path ESLint ran directly;
no unrelated/generated/private paths or the user's banner edit were reformatted.
Exact new rehearsal/recovery commands are in OPERATIONS.md; showcase setup and
archive commands are in SYNTHETIC_EXAMPLES.md. Recovery's additional legacy-client
probe was executed with `--test-name-pattern='legacy client'` after the interrupted
migration test had completed in work_recovery. Both independent checks passed.
Legacy fixture runs used their existing RUN_WORK_FOUNDATION_MIGRATION_TEST and
RUN_WORK_RELATIONSHIP_MIGRATION_TEST guards on their own pre-phase copies.

### Phase 10 final state

Final repeat deployment: no pending migrations; before/after inventories have no
record differences or integrity issues. Read-only schema diff shows only the known
ActivityVocab.lastPracticed difference; no output SQL was executed. Primary
development's before/final inventories also match with no differences/issues.

The completed guarded backup again succeeded for the matching isolated source;
its fresh restore verified 49 tables, 12 finance originals and eight task/project
originals. Auto-remove, wrong database and cross-project refusals were actually
executed without stopping the source apps. Final unit run passed 31 files; final
backend batch passed 108 checks. Additional guarded migration/recovery/legacy/
showcase suites and the corrected responsive browser checks passed as detailed
above. Final source matches the isolated build copy. TypeScript, targeted lint,
whitespace and documentation fence checks passed. No whole-repo lint or production
image/deployment claim is made.

Stopped the isolated browser app, showcase/recovery containers and work-db while
retaining their private volumes/evidence. Primary development app/database are
running. No real record/example/file/reward changes, dependency additions or
historical SQL edits. Physical-device, off-host/NAS and production-specific limits
remain explicitly pending; they are not an implied next assignment.
Phase 10 is complete in development. Stop here; no further phase is authorized.
