# Phase 08 — Projects, stages and milestones

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md and actual source. Prerequisite: verified Phases 01–07. Explain
the plan before edits; implement only this phase in development.

## Objective

Group longer improvements and school/personal work without turning projects or
stages into tasks/statuses or making project membership mandatory.

## Scope

- Add optional owner-managed Project records with stable ID, objective, context,
  current summary, lifecycle, dates and closure/archive history. Do not infer
  projects from existing task names or repurpose a Todo as a project automatically.
- Add simple project stages such as Requirements, Implementation, Testing and
  Launch. Stages are organizational membership, never task status replacements.
- A Todo has at most one primary project and optional stage belonging to that
  project. Enforce ownership/project-stage consistency server-side and with
  appropriate constraints. Standalone tasks remain fully supported.
- Project/stage moves reference the original Todo; preserve its ID, URL, checklist,
  children, notes, dates, rewards and dependency/related links. No duplication.
- Keep cross-project dependency/related links working. Make no hidden assumption
  that every child must be moved with its parent. Any membership policy or bulk
  action must be explicit, validated and recorded.
- Provide project list/detail and navigation, task list/optional board using
  existing shared queries, stage controls, objective/summary, notes/activity,
  attachments and informational milestones. Reuse patterns from earlier phases.
- Extend key-date/note/attachment parent constraints for projects carefully. Project
  milestone markers use the existing calendar projection and source navigation,
  not duplicate Event rows. Scheduling a real event/session is an explicit action.
- Show completed/total relevant tasks and explicit milestone state; distinguish
  Cancelled/excluded work and document the denominator. Do not claim effort %.
- Warn before project closure with unfinished work; never auto-close tasks or
  remove sessions. Completed projects remain searchable and reopenable.
- Add project filters to All Work and calendar where meaningful, with the same
  owner/auth, history and optimistic-concurrency guarantees.

## Migration and exclusions

Old tasks remain standalone unless deliberately assigned. Add only necessary
project/stage/membership relations. Do not backfill invented project completion
dates or historical membership. No portfolio/resource planning, budgets, invoicing,
time tracking, multi-user assignment or automatic recurrence.

## Verification and acceptance

- Test standalone and project tasks, stage mismatch/foreign-owner references,
  move/remove membership and repeated/concurrent commands. IDs/links stay intact.
- Test cross-project dependencies, child hierarchy with different membership,
  milestone/calendar source edits and shared note/file authorization/revisions.
- Test unfinished-work closure warnings, cancelled denominator, reopen/archive and
  search of completed projects without cascades or reward changes.
- Check list/detail/board/calendar filters and phone/full-page/panel behavior.
- Acceptance: A01–A07, A12–A14, A20, A23–A24, A27–A29 and A31 as applicable.

Update PROGRESS.md with data constraints, counting rules and exact checks. Stop.
Next: Phase 09.
