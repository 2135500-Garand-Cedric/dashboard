# Phase 01 — Preservation baseline and mutation safety

Read ../CONTEXT.md completely, applicable repository instructions,
../PROGRESS.md, ../ACCEPTANCE.md, Phase 00 and actual current source. Explain the
phase-specific plan before edits. Implement only this phase in development.

## Objective and prerequisites

Establish a repeatable preservation baseline and fix dangerous behavior in the
existing three-status task/calendar workflow before introducing new concepts.
Recheck all Phase 00 findings. Resolve legacy ownership/reward mapping decisions
before dependent cutover; continue independent safe work while documenting them.

## Scope

- Add a read-only inventory/checking command for tasks, checklist rows, dependency
  edges, event links, raw statuses/priorities, original timestamps and reward
  balances. Inspect database enum/migration drift and unexpected owners. Keep
  inventories private; ordinary output contains counts/issues, not task content.
- Provide an isolated development/test setup that bypasses automatic seed/startup
  mutation. A restored copy must never point at the production database/files.
  Document backup/recovery and capture the baseline before modifying that copy.
- Centralize task/event mutation validation and owner-user mapping; scope records
  and all referenced parents/prerequisites to the owner. Preserve IDs and URLs.
- Fix PATCH semantics: omitted dependency is unchanged, explicit null clears it,
  and status validation checks the resulting dependency state in the transaction.
- Prevent new self/cyclic legacy prerequisite edges, including concurrent writes.
  Preserve and flag pre-existing invalid edges rather than silently deleting them.
- Event deletion removes only that event/association, never a Todo. Task deletion
  protection must be server-side and atomic; failed deletion cannot first erase
  checklist rows. Archival is introduced in Phase 02, not silently substituted now.
- Make event create-linked-todo validate the event first, create/link atomically,
  and handle repeats without creating another task or overwriting an existing link.
  It still creates a related task, not a guessed deadline conversion.
- Move task-transition rewards from the board's separate generic reward calls into
  the successful server transition. Check intended consumers before changing any
  shared rewards endpoint. Derive amounts server-side, handle stale/repeated
  requests and partial failures, and preserve personal completion/reopen behavior.
- Add revision/idempotency state only as needed for safe existing commands.
  Do not backfill invented historical payout events. Preserve User totals during
  migration; document how legacy Done accounting is handled before changing it.
- Add useful failure/loading feedback and an accessible non-drag status action for
  the existing workflow; do not redesign the entire board in this phase.

## Migration boundaries

Prefer additive technical fields/constraints only. Do not add new statuses,
contexts, contacts, project tables, task dates or document features. Never edit
historical migrations. No reset, production write or automatic sample seed.

## Verification and acceptance

- Compare original IDs, raw values, dependency tuples, checklist/event links,
  timestamps and balances before/after technical migration on disposable data.
- Test omitted/null/replaced dependency, simultaneous status/edge edits,
  self/cycle attempts, concurrent reverse edges and rejected transitions.
- Test linked event deletion with checklist/dependents/other event links: tasks
  and other links survive. Failed task deletion leaves children unchanged.
- Test repeated/failed linked-todo creation and concurrent submissions.
- Test completion/reopen rewards, repeated requests, invalid transition, failed
  write and two-tab race; balances cannot change on a rejected status update.
- Run appropriate auth/event-date tests and guarded disposable DB checks. Verify
  status controls with touch/keyboard. Do not use production for testing.
- Acceptance: A01–A06, A16 legacy safety, A29 and A31 as applicable. No claim that
  the expanded model or calendar projection exists yet.

Update PROGRESS.md with exact evidence, migrations and compatibility decisions.
Stop. Next: Phase 02; do not start it automatically.
