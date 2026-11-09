# Phase 06 — Deadlines, follow-ups and key dates

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md and actual code. Prerequisite: verified Phases 01–05. Explain
the plan before edits; implement only this phase in development.

## Objective

Represent distinct task dates correctly before projecting them into the calendar.
This phase changes task detail/filtering, not calendar rendering or conversions.

## Scope

- Add an optional task deadline as either a date-only calendar date or an exact
  instant with appropriate timezone metadata. Enforce mutually valid alternatives
  in server validation and DB constraints; never store two editable deadlines.
- Introduce/reuse a central configured app timezone, default America/Toronto. Do
  not rely on browser/server locale for work-date meaning. Preserve date-only
  values as dates, not UTC-midnight instants. Handle DST gaps/ambiguities explicitly
  for entered local times instead of silently shifting them.
- Date-only deadline is overdue after its local date ends; exact deadline is
  overdue after its instant. No deadline means no invented due/overdue value.
- Add follow-up lifecycle records with at most one active follow-up per task,
  optional date-only/exact time, reason and history. Completing/snoozing a follow-up
  never completes the task or changes its deadline. Preserve previous dates and
  outcomes through lifecycle/audit records; enforce active uniqueness concurrently.
- A date-only follow-up becomes due on its local date; an exact one at its instant.
  Link follow-up controls to Waiting details without making follow-up mandatory.
- Add optional informational task key dates (delivery/start/launch or custom label).
  They are not deadlines, reservations or completion conditions. Design parent
  constraints so project key dates can be added in Phase 08.
- Show these distinctions clearly in task detail and add relevant All Work date
  filters/sorting. Log create/change/clear/complete/snooze with previous/new values.
- Closing/cancelling removes outstanding-action indicators for dates without
  deleting history; reopening recomputes overdue from the original deadline.
  Record a clear policy for inactive follow-ups so reopen does not manufacture
  reminders or silently undo a completed follow-up.

## Migration and boundaries

Old task dates stay unknown because Todo has no deadline to recover. Do not infer
dates from linked events, titles or updatedAt. Do not modify any event timestamp.
No calendar projection, work-session UI, automatic notifications, external calendar
integration or legacy-event conversion. Project schema/UI remains Phase 08.

## Verification and acceptance

- Test date-only versus exact midnight boundaries in Toronto and with a browser/
  server set to another zone, DST transitions, leap days and invalid dates.
- Test optional/cleared deadlines, Urgent without dates and independent follow-ups/
  key dates. Changing one cannot change another or close the task.
- Test complete/snooze/repeat/concurrent follow-up commands, active uniqueness,
  retained history, stale writes and closure/reopen behavior.
- Confirm legacy task/event IDs, timestamps, relationships and rewards unchanged
  by schema/backfill. Test phone inputs and readable distinct labels.
- Acceptance: A01–A05, A10, A12, A18–A19, A22 task behavior, A28–A29 and A31.

Record date storage, timezone, reopen policy and exact checks in PROGRESS.md.
Stop. Next: Phase 07.
