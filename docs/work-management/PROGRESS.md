# Work management progress

## Current position

Updated: 2026-11-10 (America/Toronto).

Phases 01–05 are implemented and verified in development. Production is untouched.
Next assignment: Phase 06, which has not started. The architecture is not a production migration approval.

| Phase | Status | Evidence |
| --- | --- | --- |
| 00 | Discovery recorded; migration rehearsal not performed | Chat discovery summarized in phases/00-architecture-and-migration-plan.md |
| 01 | Verified in development | See Phase 01 evidence below and OPERATIONS.md |
| 02 | Verified in development | See Phase 02 evidence below and OPERATIONS.md |
| 03 | Verified in development | See Phase 03 evidence below and OPERATIONS.md |
| 04 | Verified in development | See Phase 04 evidence below and OPERATIONS.md |
| 05 | Verified in development | See Phase 05 evidence below and OPERATIONS.md |
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
