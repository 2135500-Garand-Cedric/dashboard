# Phase 00 — Architecture and migration plan

Status: discovery documented from Prompt 0. This is not migration verification or
permission to implement Phase 01. Read ../CONTEXT.md, ../PROGRESS.md and
../ACCEPTANCE.md before using this plan. Inspect current source again before any
implementation: the following observations are a 2026-11-09 snapshot.

## Observed implementation

- Next.js 15 App Router, React 19, Prisma/PostgreSQL, NextAuth v4 GitHub owner-only
  JWT authentication, Tailwind, and FullCalendar month/day-grid presentation.
- `prisma/schema.prisma`: Todo has title/description, TODO/IN_PROGRESS/DONE,
  numeric priority (UI: 1 Low, 2 Medium, 3 High), rewards, userId, one dependsOnId,
  createdAt/updatedAt. No task deadline or project model exists.
- Subtask contains id/title/done/todoId/createdAt. These are checklist steps,
  not independent tasks. Keep them as such.
- Event contains id/title/description, nullable date/endDate, type, completed,
  userId, linkedTodoId, and timestamps. One task may already have several events;
  an event has at most one linked todo. ActivityType supplies calendar labels/colors.
- `/todos` is a three-column board; `/todos/[id]` edits metadata, prerequisite,
  checklist and rewards. Dashboard TodoTile only shows In-progress tasks.
- `/events` and `/events/[id]` handle timed/TBD events and optional end dates.
  Current code has no recurrence, date-only/all-day model or drag-reschedule action.
- Task/event APIs live under `src/app/api/todos` and `src/app/api/events`.
  Layouts use ProtectedLayout and all data handlers begin with requireOwner.
  Owner identity is pinned to GitHub ID 89470930; stored application user is 1.
  Many task/event reads are not additionally scoped by userId.
- Finance offers private-file, revision/idempotency and transaction patterns;
  it does not provide permission to mix work files into finance records. Current
  task descriptions are plaintext; no reusable Markdown renderer was found.

## Known defects to address deliberately

1. Event DELETE explicitly attempts to delete its linked Todo. Checklist foreign
   keys can make this fail; otherwise a task can be lost along with other links.
2. Todo PATCH sets dependsOnId to null when omitted. A board status change can
   clear the prerequisite. Simultaneous dependency/status edits check the old edge.
3. Board reward requests happen before status save, independently of its success.
   Retries and rejected transitions can alter balances incorrectly.
4. Dependency/hierarchy cycle protection, revisions and robust task mutation
   idempotency are absent. Some delete protection exists only in the client.
5. Event create-todo creates and links separately; retries can duplicate records.
6. Native board dragging lacks an equivalent touch/keyboard status control;
   columns stack on phones with nested scrolling. Source-inspected, not a browser
   acceptance result.
7. Development Compose automatically migrates and seeds. General seed code can
   rewrite a sample dependency; do not boot restored real data through that command.

## Proposed architecture

- Extend Todo as the canonical task. Keep IDs and `/todos/[id]` URLs. Derive a
  stable TASK-0142-style reference from the ID; do not renumber records.
- Existing Subtask rows remain checklists. True child tasks use Todo.parentId.
- Expand the existing status vocabulary; retain TODO/IN_PROGRESS/DONE mappings.
  Blocked is derived from dependencies, not a replacement status.
- Add a small WorkContext catalog. Company/course/system can begin as optional
  labels; tags as simple values. Contacts are separate owner-managed records,
  never authentication users. Do not repurpose Japanese Category/Activity or
  calendar ActivityType as work taxonomy.
- Multiple prerequisites require an edge table; related-to requires a distinct
  symmetric link. Centralize graph validation under transactional concurrency
  protection. Parent-child hierarchy does not implicitly add dependency edges.
- Add append-only work activity before new stateful mutations, then dated notes,
  revisions and private attachments. Reuse patterns for projects later, with valid
  foreign keys/parent constraints rather than unchecked polymorphic IDs.
- Keep deadlines on Todo, follow-ups in their own lifecycle records, key dates
  informational, and work sessions in Event. An event-task join enables multiple
  relevant tasks and an explicit session relationship. Times are never dual-written.
- Existing `/events` remains the calendar. A typed read projection combines event
  records and task/follow-up/key-date markers without storing duplicate events.
- Optional projects/stages arrive later. Stages group work without replacing task
  status; a task has one primary project at most.
- All Work can remain `/todos`; add My Work and project routes as needed. Keep
  current URLs working. List/board/panel/full-page views share DTOs and services.

## Safe mappings and preservation

| Existing information | Mapping |
| --- | --- |
| Todo.id and URLs | Retain unchanged; human reference derived from ID |
| TODO / IN_PROGRESS / DONE | To do / In progress / Done; never reset old work to New |
| priority 1 / 2 / 3 | Low / Normal / High, retaining legacy values during transition |
| absent priority | Document a Normal display/default; retain evidence it was absent |
| unknown status/priority | Inventory and preserve for reviewed mapping; never discard |
| Subtask rows | Same IDs, todoId, title, done and createdAt; display as checklist |
| dependsOnId | Equivalent directional edge after verified backfill |
| linkedTodoId | Related event-task association; not an inferred session/deadline |
| Event data | Same IDs, values, times, type and completion; no guessed conversions |
| old createdAt/updatedAt | Preserve; updatedAt is not proof of completion time |
| old Done with no completion timestamp | Unknown historical completion time |
| context/company/course/people | Unknown/unclassified, not inferred from titles |
| rewards and User totals | Preserve balances and amounts; no migration payout/reversal |

Before adding defaults/constraints, inventory a disposable restored database,
including database enum values, malformed/cyclic links, all owners, raw legacy
values and migration history. Add fields first, backfill idempotently, compare
ID sets/relationships/values, switch one authoritative writer, then enforce
constraints. Do not remove compatibility fields during an unrelated later phase.
Commit enum additions before using new enum values where PostgreSQL requires it.
Never rewrite already-applied migration files or replay historical destructive
migrations through a reset.

## Decisions to settle before dependent implementation

- Confirm the actual stored owner-user mapping and isolate unexpected owner rows;
  do not reassign them automatically or create an OAuth-derived replacement user.
- Record a legacy reward compatibility policy. Aggregate User totals and current
  reward amounts do not prove historical payouts. Preserve totals; never invent
  a payout ledger or silently repair balances from current task states. Preserve
  intended personal earn/reopen behavior prospectively, with explicit treatment
  of legacy Done rows before accounting cutover.
- Review any unknown statuses/priorities, cycles, or suspect event associations
  found in the inventory. Do not guess corrections.
- New unfiltered captures can visibly default to Personal, while old records
  remain Unclassified; a selected context supplies the capture default.
- Use configured app timezone, default America/Toronto. Existing calendar code
  uses browser-local display and SQL timestamps without an explicit zone: verify
  stored conventions before changing types or interpreting legacy times.

## Verification status and handoff

Prompt 0 ran 6 authentication tests and 7 event-date tests successfully, plus
read-only in-memory probes confirming the two PATCH defects. No migration,
restore, browser test or production data inventory was performed. No app/data
changes were made. See PROGRESS.md for exact commands and evidence boundaries.

Follow the numbered phase files one at a time. Missing phase acceptance does not
authorize starting the next phase. Phase 10 rehearses the cumulative migration;
every earlier schema phase must already check its own preservation behavior.
