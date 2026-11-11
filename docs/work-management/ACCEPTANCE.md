# Shared acceptance and verification contract

Read with CONTEXT.md and the assigned phase. This is a checklist of required
behavior, not evidence that the behavior exists. Phase-specific checks are in
each phase file. Record executed commands and evidence in PROGRESS.md; leave
unexecuted checks pending. Final acceptance requires all applicable items below.

| ID | Required behavior | Introduced / verified |
| --- | --- | --- |
| A01 | Existing task/event IDs, URLs, original values, checklist IDs, dependency directions and event associations survive migration | 01 baseline; each migration; 10 rehearsal |
| A02 | No reset, guessed conversion, fabricated historical timestamps/notes, retrospective reward replay or automatic real-data seeding | Every phase |
| A03 | Existing User XP/coins and unrelated module records remain unchanged by migration | 01, 02, 10 |
| A04 | Pages/APIs/search/files deny anonymous and non-owner access; related records are owner-scoped | Every phase |
| A05 | Mutations validate on the server, reject stale writes, are atomic, and protect repeat submissions where duplication/accounting is possible | 01 onward |
| A06 | Event deletion never deletes tasks; task archival preserves independent events and sessions | 01, 02, 07 |
| A07 | `Todo` is canonical; internal IDs/references are stable; list/board/project/calendar views never copy tasks | 02 onward |
| A08 | New/Backlog/To do/In progress/Waiting/Done/Cancelled work correctly; existing states map explicitly; new captures default to New/Normal | 02, 03 |
| A09 | Existing unclassified context and unknown historical fields remain identifiable; simple title-only capture stays possible | 02, 03 |
| A10 | Priority is independent of deadline; urgent undated work stays discoverable | 02, 03, 09 |
| A11 | Contacts are not users; optional requester, affected people and waiting-on information remain lightweight | 03 |
| A12 | Closing/reopening/archive preserve prior closure history; accepted-workaround closure is explicit; business presentation does not remove stored personal rewards | 02 onward |
| A13 | Notes have server-created timestamps, optional occurred-at, revisions and Notes only / All activity views; automatic entries cannot be normally edited | 02 audit; 04 UI |
| A14 | Private work images/PDFs cannot be served publicly or through finance record permissions; upload/download/delete checks and backup coverage work | 04, 10 |
| A15 | Existing checklist rows remain checklist rows; real subtasks are independent tasks with at most one parent; hierarchy cycles are rejected | 05 |
| A16 | Dependency direction, uniqueness and cycle prevention hold under concurrent changes; related links are symmetric and nonblocking | 01 legacy safety; 05 |
| A17 | Blocked is distinct from Waiting; blocked start/closure requires recorded override; cancelled prerequisites need review; parent closure never silently completes children | 05 |
| A18 | Date-only deadlines and follow-ups preserve local calendar dates; exact times and DST behavior use the configured zone, default Toronto | 06, 07 |
| A19 | Deadline, follow-up, key date, event and work-session times each have one authoritative source; follow-up completion/snooze never completes a task | 06, 07 |
| A20 | Existing calendar shows independently toggleable/context-filtered layers with labels/icons; markers open their source; edits target that source | 07 |
| A21 | Legacy-event conversion is previewed, explicit, retry-safe and reversible where feasible; original data/provenance survive and duplicate deadline display is suppressed | 07 |
| A22 | Event/session time passing never completes a task; closed-task dates lose outstanding-action indicators while history/sessions remain; reopening uses original deadline | 06, 07 |
| A23 | Projects are optional groups, stages are not statuses, tasks have at most one primary project, and cross-project links do not duplicate tasks | 08 |
| A24 | Project/task progress shows completed counts or explicit milestones; closure with unfinished work warns without hidden cascading changes | 05, 08 |
| A25 | My Work includes New intake, focus, due/overdue work, waiting/blocked work, follow-ups, sessions and no-deadline tasks across combined/separate contexts | 09 |
| A26 | Today focus is a planning choice independent of task deadline and status | 09 |
| A27 | All Work defaults to a compact searchable list, retains optional board, shared filters and searchable closed/archived history | 03 onward |
| A28 | Desktop details and phone full-screen details share the same record/URL; touch and keyboard status controls work without drag-and-drop | 03 onward |
| A29 | Finance/Japanese/auth/calendar/personal-reward regressions are checked appropriately; sensitive content is not placed in logs | Every phase; 10 cross-module |
| A30 | Repeat migration/backfill and isolated restore preserve data; failed deployment recovery is documented without implying production readiness was tested | 10 |
| A31 | No AI, external ingestion/notifications, new recurrence engine, enterprise ticketing, grading or other context non-goals are introduced | Every phase |

## Evidence rules

- Separate source inspection, mocked/unit checks, database integration checks,
  browser/manual checks and actual restore verification. One does not prove the
  others.
- DB tests that write use disposable development databases or rollback-controlled
  fixtures with an explicit environment guard, never production.
- Before/after inventories compare IDs and relationship tuples as well as counts;
  equal counts alone cannot prove preservation. Keep inventory contents private.
- A backup is not verified until restored and checked in isolation. Account for
  all private document roots, not just database records.
- Test only implemented scope now. Add acceptance evidence as later phases arrive;
  do not implement them to make the entire checklist green early.
- Test phones in portrait and landscape, normal desktop, wide desktop, keyboard
  navigation, loading/empty/error states, and direct URL entry where relevant.
- Additional dependencies require a concrete need and review. Prefer existing
  application patterns; do not claim a renderer or integration exists without
  inspecting it.

## Phase 01 evidence (2026-11-09)

See PROGRESS.md for exact commands and OPERATIONS.md for compatibility/recovery.
A01–A05 are verified for this phase in development through private before/after
inventories, restored-copy migration, replay/concurrency/failure tests and auth
checks. A06 is verified for event deletion only; archival belongs to Phase 02.
A16 is verified for legacy single-prerequisite graph safety only; expanded edges
and overrides belong to Phase 05. A29 has existing unit regressions, full original
record preservation and live auth evidence; this is not a claim that every finance
or Japanese browser workflow was re-tested. A31 scope boundaries were retained.
All later feature acceptance remains pending. Production and physical-device/file
recovery checks were not performed in Phase 01.

## Phase 02 evidence (2026-11-09)

See PROGRESS.md for commands and preservation artifacts. A01–A05 were rechecked
through whole-database restore, exact before/after migration comparisons,
owner-scoped transactional integration tests, rollback/replay checks and existing
regressions. A06 now includes archive preserving checklist/dependency/event links.
A07–A10 cover canonical Todo IDs/references, seven statuses, visible capture
context/defaults, unknown legacy metadata and undated Urgent work. A12 covers
explicit accepted-workaround closure, retained audit through reopen/archive and
personal reward accounting. A13 is accepted only for the automatic append-only
application audit backbone; notes/editor/revisions/timeline work remains pending.
A29 has existing cross-module unit regression, preserved full original rows,
isolated production build and four-viewport browser checks, not exhaustive finance
or Japanese UI retesting. A31 phase boundaries are retained. Phase 03 and all
later feature acceptance remain pending; production has not been operated on.

## Phase 03 evidence (2026-11-09)

See PROGRESS.md for exact commands, private migration comparisons and limits.
A01–A03 preservation was rechecked on a full isolated restore and fresh development
cutover: all original rows, IDs, links, timestamps, balances and unrelated records
survive; contacts start empty. A04–A05 include owner-scoped paginated search/contact
APIs, foreign-link denial, stale writes/replay and atomic people/audit rollback.
A06–A10 remain covered by existing regressions plus list/board agreement,
Unclassified/undated Urgent search, seven statuses and visible capture defaults.
A11 is implemented: optional requester, distinct affected people and waiting
contact, all separate from application users. A12 closure/reopen/archive/rewards
was rechecked through the shared detail UI. A27–A28 include default compact list,
shared URL criteria/results, closed/archived retrieval, stable full-page links,
desktop panel/phone full screen, keyboard/touch controls, focus return and retained
unsaved/conflicting drafts. A29 has all existing unit regressions, preserved whole
DB rows, live auth/owner reads and isolated build/browser evidence; it does not
claim exhaustive finance/Japanese browser testing. A31 exclusions were retained.
Notes/attachments, expanded relationships, dates/calendar, projects and My Work
remain later phases. Production and physical-device recovery are unverified.

## Phase 04 evidence (2026-11-09)

See PROGRESS.md for executed commands and OPERATIONS.md for lifecycle/recovery.
A01–A03 preservation was rechecked on an isolated whole-DB restore, additive
migration, exact comparisons and development cutover, with no historical notes or
file records manufactured. A04–A05 include owner/parent/child checks on notes,
versions, file bytes and timeline, cross-record corruption suppression, immutable
server timestamps, stale/replayed commands and atomic rollback/cleanup behavior.
A13 now includes Notes only / All activity, editable current notes with immutable
versions/edited indication, distinct occurred-at, explicit soft removal and read-
only automatic facts. A14 covers private work namespace, bounded/byte-validated
uploads, protected passive previews/original downloads, physical cleanup recovery,
persistent volumes and an actual isolated DB/file restore matching 39 public
record tables plus 12 finance and 4 work originals. A28 covers shared panel/full
page, four viewports, keyboard/touch, draft retention and usable capture controls;
physical camera hardware remains unverified. A29 includes all 25 unit-test files,
35 DB TAP checks, existing work regressions, live auth and production build; it
is not an exhaustive finance/Japanese browser re-test. A31 exclusions remain.
Production deployment/recovery, permanent erasure and later phases are pending.


## Phase 05 evidence (2026-11-10)

See PROGRESS.md for commands/private preservation artifacts and OPERATIONS.md for
API, graph and recovery semantics. A01–A07, A12, A15–A17, A24, A28–A29 and A31
were checked for the implemented scope in development. Whole-DB restore and exact
migration inventories preserved original task/checklist/event IDs and values,
old edge direction, balances, existing notes/history and unrelated module rows.
Legacy anomaly fixtures verified preserved flags and repeat backfill/deploy.

45 DB integration checks passed for independent children, hierarchy/dependency
concurrency/cycles, multi-edge compatibility, owner scope, pagination, explicit
fresh blocked/parent-closure decisions, Cancelled versus Done, no cascade and
rollback/replay/reward behavior. New real graph and existing work UI workflows
passed in Chromium at four portrait/landscape/desktop/wide sizes, including touch,
keyboard, original task URLs and draft/conflict behavior. Live authorization
checks passed across 120 handlers and explicit new-route owner/non-owner reads.

26 unit-test files and an isolated production build passed; targeted changed-path
lint passed. Full repository lint is not clean and was not claimed to pass.
A24 covers task child counts/closure only; project acceptance remains Phase 08.
No Phase 06 dates/scheduling, project features, physical-device tests or production
migration/recovery approval are implied. The pre-existing unrelated
ActivityVocab.lastPracticed schema difference was preserved without repair.


## Phase 06 evidence (2026-11-10)

A01–A05, A10, A12, A18–A19, A22 task behavior, A28–A29 and A31 were checked for
this phase in development; commands/artifacts/limits are in PROGRESS.md and
OPERATIONS.md. Exact whole-DB restore/migration comparisons preserved original
records/IDs/relations/timestamps/rewards and unrelated records. Existing dates
remain unknown, new lifecycle/key-date tables begin empty, and no event was moved.
Repeat deployment changed no records. Production was not operated on.

56 DB integration checks passed, including valid/exclusive date alternatives,
active follow-up uniqueness and concurrent complete/snooze/retry behavior,
retained lifecycle/history, stale writes, owner scope, independent key dates,
closure/reopen/archive policy, pagination/filters/sorting and late-failure rollback
of records/history/rewards. 27 unit-test files passed, including midnight/exact
boundaries, leap/invalid dates, DST gaps/folds, Toronto 23/25-hour days, process
zones UTC/Tokyo/Los Angeles and configured app-zone override/invalid configuration.

New date controls passed real Chromium/API tests at four phone/desktop sizes,
using a Tokyo browser and UTC server. Five previous work browser suites also
passed at all four sizes. Live authorization passed for 122 protected handlers,
including the date API. Final-source isolated production build, TypeScript,
targeted lint and whitespace checks passed; full repository lint is not claimed
clean. Known unrelated ActivityVocab.lastPracticed drift was left intact.

A19/A22 cover task-date behavior only: no task/event copies, no automatic task
completion, closure hides outstanding indicators, reopen recomputes deadline
without recreating inactive follow-ups. Calendar projection/work sessions and
event conversion remain Phase 07. No production, physical phone/Safari, notification
scheduler or enterprise-scale performance claim is implied.


## Phase 07 evidence (2026-11-10)

A01–A07, A18–A22, A28–A29 and A31 were checked in development for the existing
calendar integration. PROGRESS.md and OPERATIONS.md record commands, artifacts
and limits. Full restore/migration/repeat-deployment comparisons preserved all
original row values/IDs/timestamps/relations/balances; the legacy event pair was
backfilled as RELATED without inventing a session or deadline.

68 serial isolated DB checks and 28 unit-test files passed. Event-only moves,
independent completion/deletion, canonical multi-links, constrained session
ownership/targets, bounded typed feed, layers/context/source navigation, all-day
exclusive ends, DST/cross-month handling, future-session closure review, conversion
preview/version/concurrency/retry, retained source provenance, safe reversal and
late-failure rollback were exercised. Conversion never guesses from an event title.

Seven browser suites passed at four phone/desktop sizes; the calendar suite was
also rerun with actual drag confirmation, native all-day input, keyboard source
links and exact legacy-instant preservation. Server UTC/browser Tokyo remained
independent of the configured calendar zone. All 128 protected API handlers and
owner route reads passed live authorization checks. Final production build,
TypeScript, targeted source lint and whitespace checks passed (not whole-repo lint).

The requested examples were rehearsed, then explicitly loaded in development:
14 tasks, nine new events, nine verified sample updates and two preserved-ID
placeholder conversions. Exact original non-example fingerprints and balances
were checked. A repeat load changed no records. This authorized example operation
is distinct from the lossless migration and never runs on application startup.

No production, physical Safari/device, scheduling daemon, recurrence engine,
external calendar or enterprise performance acceptance is implied. A23–A26 remain
for their assigned project/My Work phases; Phase 08 was not started.


## Phase 08 evidence (2026-11-10)

A01–A07, A12–A14, A20, A23–A24, A27–A29 and A31 were checked for the project
scope in development. PROGRESS.md records executed commands/artifacts/limits;
OPERATIONS.md documents constraints, counting rules, parent routes and recovery.

A whole-DB restore/migration rehearsal, actual development cutover and repeat
migration comparisons preserved original records/IDs/URLs, fields, FKs, links,
timestamps and balances. Existing tasks remain standalone and new project/stage
tables start empty; no historical membership, closure or milestone was invented.
The permanent owner and existing reward behavior were preserved.

83 serial DB checks and 29 unit files passed. Compound ownership/stage constraints,
exclusive note/file/milestone parents, cross-project graph/hierarchy, original task
membership moves, retry/stale/conflict/rollback behavior, private files/revisions,
project date markers and explicit closure/reopen/archive history were exercised.
Progress excludes Cancelled/archived work and never claims effort percentage;
closure review still warns about archived unfinished members. Sessions/tasks are
kept without hidden cascades or reward changes.

Eight work browser suites passed at four phone/desktop sizes, and the project
suite was rerun after final closure/list-refresh safeguards, including the
zero-denominator archived-work case. Original full task URLs and shared panels,
list/board queries, context/project filters, calendar source links and protected
original bytes worked in real browser/API checks. Live auth passed for 149
protected handlers and relevant page/owner routes. Build, TypeScript, targeted
lint and whitespace checks passed; whole-repository lint is not claimed clean.

A14 reuses the already private work namespace and full-backup selection, now with
exclusive project parent checks. New uploads/downloads/cleanup were verified;
physical device/Safari and a new whole-files/NAS restore were not run. No production
operation or exhaustive finance/Japanese browser/performance claim is implied.
Phase 09 remains unstarted; no focus/My Work or other excluded feature was added.

## Phase 09 evidence (2026-11-11)

Read with the exact execution record in PROGRESS.md; these are development checks,
not Phase 10 or production acceptance.

- A04–A05: My Work/focus endpoints authenticate first and reuse the existing owner,
  version, UUID receipt and transaction protocol. Isolated tests passed foreign
  owner, date constraints, retry/concurrent writes, stale revisions and late-audit
  rollback. Live HTTP/page authorization results are recorded in PROGRESS.md.
- A06–A07: My Work reads original Todo/Event/follow-up records and opens canonical
  panel/source URLs. No duplicate tasks or report copies; independent sessions
  survive task closure/archive. Restored-copy and development migration inventories
  show unchanged original IDs, values, relationships and reward balances.
- A10, A25–A26: New/focus/due/follow-up/Waiting/Blocked/Urgent/undated/Backlog
  membership, combined/individual organizational filters and overlapping counts
  passed isolated tests. Focus does not change status, deadline, dates or rewards.
  Same-day reopen restores presentation; old pins do not carry over. A queued
  mutation crossing midnight is rejected after lock acquisition.
- A18–A20, A22: Toronto midnight and 23/25-hour DST windows, another process/device
  zone, shared snapshot-clock labels, paged real sessions and non-session dates
  passed targeted tests. Date/follow-up and calendar browser regression outcomes
  are recorded separately in PROGRESS.md. No time-based automatic task completion.
- A27–A28: Real My Work UI passed 390×844, 844×390, 1440×900 and 2560×1440 with
  canonical task panels, capture/context/company, long titles, focus and lifecycle
  controls, filtered All Work links and error/retry. Existing suites cover shared
  keyboard/touch controls; emulation does not prove physical phone/Safari behavior.
- A29: All 30 unit-test files and 94 serial DB TAP checks passed, including prior
  work/calendar behavior and unrelated module unit regressions. Private search
  request logging excludes My Work. Full finance/Japanese browser acceptance and
  production recovery are not claimed; see PROGRESS.md for final build/auth checks.
- A31: No notifications, automatic scheduling, AI, new recurrence, time tracking,
  external sync or Phase 10 features. Reads and date rollover do not create records.

No original documents were moved. Whole database backup/restore and preservation
checks are recorded for this migration; no new physical NAS/private-file recovery
rehearsal is implied. Existing combined backup and private file rules still apply.

Final Phase 09 results: all nine serial browser suites passed at four sizes, plus
an additional read-only dashboard tile/retry check; live auth passed 152 protected
handlers and page/identity checks. Build, TypeScript, targeted lint and whitespace
passed. Repeated isolated migration had no pending changes and identical record
fingerprints; final development inventory was unchanged after auth reads. Phase 09
is verified in development. Phase 10 and production acceptance remain pending.
