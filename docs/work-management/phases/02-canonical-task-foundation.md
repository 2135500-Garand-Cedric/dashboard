# Phase 02 — Canonical task foundation

Read ../CONTEXT.md completely, applicable repository instructions,
../PROGRESS.md, ../ACCEPTANCE.md, this file and actual source. Phase 01 safety and
preservation checks must be verified, with relevant mappings settled. Explain
the plan before edits; implement only this phase in development.

## Objective

Evolve Todo into the canonical work item without creating parallel task storage.
Provide a usable minimal UI for the new fields; the full list/detail redesign
belongs to Phase 03.

## Scope

- Add New, Backlog, Waiting and Cancelled to the existing status vocabulary;
  preserve TODO/IN_PROGRESS/DONE meanings. New capture defaults to New/Normal.
- Add named Urgent/High/Normal/Low priority while retaining raw legacy priorities
  through transition. Priority never requires or manufactures a deadline.
- Add a small configurable/easily extensible WorkContext catalog and optional
  company/course/system labels, tags, task kind, desired outcome and next action.
  Suggested kinds: general Task, Issue, Request, Improvement, Maintenance.
- Legacy context remains unknown/Unclassified. New capture displays its context
  default; unfiltered capture may default to Personal. Definition/catalog data is
  not permission to seed sample tasks or classify existing records by title.
- Add Waiting reason/what-is-awaited, workaround details and completion outcome.
  Contact references arrive in Phase 03; dates/follow-ups arrive in Phase 06.
- Add current closure/archive state and timestamps plus revision support. Closing
  allows an optional short summary; explicitly accepting a workaround as closure
  requires confirmation and explanation. Reopen/archive are explicit operations.
- Establish append-only WorkActivity for significant changes with server time,
  actor/owner, action and appropriate before/after values. Status, priority,
  context, closure and reopening are logged atomically from now on. Later phases
  extend event types. Normal task actions cannot edit automatic history entries.
- Keep original IDs and full-page routes. Derive stable human references from
  IDs; do not introduce a separate reference counter without a demonstrated need.
- Adapt existing board/status controls and DTOs so every status remains accessible.
  Cancelled need not have a board column but must remain retrievable.
- Preserve all reward values and existing personal behavior; business views can
  de-emphasize rewards without removing/re-awarding them.

## Migration and compatibility

- Use additive stages. Commit enum changes before using new values/defaults when
  required. Apply reviewed mappings from Phase 00, preserving unknown values.
- Do not reset old TODO to New, infer old context or use updatedAt as completedAt.
  Missing historical closure dates stay unknown. New audit begins at cutover;
  a migration/default marker is not an invented historical user action.
- Closure history survives reopen; archive hides from active views without
  deleting tasks, children, dependencies or events. Do not introduce implicit
  cascades. Existing dependency checks remain enforced pending Phase 05 overrides.
- No contacts, projects, notes UI, attachments, follow-ups or calendar projections
  beyond what is necessary to keep existing screens functional.

## Verification and acceptance

- Inventory/backfill tests cover old states, priorities including null/unknown,
  preserved IDs/timestamps/links/rewards and repeat execution. Check old API callers
  receive documented compatibility behavior without duplicate authoritative data.
- Test title-only creation, defaults, every status, undated Urgent work, optional
  metadata, Waiting with workaround, explicit workaround closure, reopen/archive,
  stale updates, replay and atomic audit entries. Failed commands write no history.
- Test legacy Done records retain unknown completion time and unchanged balances.
- Check new statuses do not disappear from old board/dashboard consumers.
- Acceptance: A01–A10, A12, A13 audit backbone, A29 and A31 as applicable.

Update PROGRESS.md and record exact acceptance evidence. Stop. Next: Phase 03.
