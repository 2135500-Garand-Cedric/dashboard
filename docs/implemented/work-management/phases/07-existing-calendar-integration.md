# Phase 07 — Existing calendar integration and legacy conversion

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md and current calendar/task code. Prerequisite: verified Phases
01–06. Explain the plan before edits; implement only this phase in development.

## Objective

Extend the existing `/events` calendar with typed work layers and scheduled
sessions. Preserve ordinary events and make legacy conversion an explicit choice.

## Scope

- Keep Event IDs, date/endDate, labels, completion, TBD behavior and URLs. Add
  structural event kind distinct from its ActivityType label/color. Old links do
  not imply sessions/deadlines; existing events initially remain ordinary/legacy.
- Introduce event-task links supporting multiple relevant tasks per event and an
  explicit session target/role. Backfill linkedTodoId as a related association.
  Document the single authoritative relationship writer and compatibility reads;
  do not keep two independently editable link representations.
- Work sessions reuse Event start/end as the only editable timing source. Require
  valid start/end for newly created sessions; preserve optional-end legacy events.
  Support several sessions per task and related tasks without copying them.
- Add explicit all-day/date-only informational events and busy/free meaning as
  needed. Preserve legacy timed instants; never guess all-day from midnight or
  retype stored SQL timestamps without confirming their convention.
- Build a bounded, owner-scoped typed calendar projection of Event, Todo deadlines,
  active follow-ups and key dates. Use stable IDs such as event:15, deadline:42,
  followup:8. Keep existing Event API consumers compatible. No second calendar or
  persisted duplicate deadline/follow-up events.
- Add layer toggles, context filters, labels/icons and distinct styles. Deadlines
  and follow-ups are markers, not reserved day-long duration blocks. Clicking
  opens the source. Provide a practical timed-session view using existing
  FullCalendar capabilities or a narrowly justified matching plugin.
- Session moves edit only Event. Deadline/follow-up moves explicitly identify the
  source change, require confirmation as appropriate and record history; keyboard/
  form alternatives must work without dragging. Never treat all IDs as numbers.
- Ending an event/session never completes a task. Closing/cancelling a task keeps
  past sessions and appointments, removes actionable date indicators and offers
  review of future sessions without silently deleting them. Reopening uses the
  original deadline. Independent event completion remains compatible.
- Replace the simplistic create-linked-todo UI with a previewed explicit action:
  choose/reuse a task as appropriate, context, deadline and whether the event is a
  retained related real event or a legacy deadline placeholder to supersede.
- Preserve source data/provenance and conversion identity. Repeated/concurrent
  confirmation cannot create duplicate tasks. Suppress duplicate actionable
  deadlines only for explicitly superseded placeholders. Offer safe reversal;
  do not overwrite later task/event edits during undo.
- Inspect recurrence again. Discovery found none; do not build an engine. If new
  recurrence exists by this phase, preserve instance semantics and defer unsupported
  whole-series conversion rather than guessing.

## Verification and acceptance

- Verify all old event IDs, values, links, optional dates, completion and type
  presentation survive migration and repeat backfill. Event deletion keeps tasks.
- Test sessions, ordinary events, markers, TBD, all-day exclusive ends, cross-month
  ranges, Toronto/DST and another device timezone, each layer/filter and source click.
- Test explicit reschedule isolation, version conflicts, task closure/reopen and
  past/future session handling. Check other event/dashboard consumers still work.
- Test retained-event and superseded-placeholder conversion, reuse of an already
  linked task, preview/confirm conflicts, retry/concurrency, reversal and no guessed
  conversion of exams/birthdays/reading week or unsupported recurring series.
- Verify touch/keyboard alternatives, phone calendar/detail, labels beyond color
  and auth on aggregate feed/conversion/mutations.
- Acceptance: A01–A07, A18–A22, A28–A29 and A31 as applicable.

Update PROGRESS.md with conversion/link mappings and executed evidence. Stop.
Next: Phase 08; do not start it automatically.
