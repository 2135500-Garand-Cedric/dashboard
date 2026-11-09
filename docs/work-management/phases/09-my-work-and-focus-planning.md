# Phase 09 — My Work and focus planning

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md and current implementation. Prerequisite: verified Phases 01–08.
Explain the plan before edits; implement only this phase in development.

## Objective

Provide a useful daily planning view derived from existing canonical tasks and
dates, including important work that has no deadline.

## Scope

- Add a protected My Work page and sidebar link using the existing visual language.
  All Work, projects and the existing calendar remain available with stable URLs.
- Show New work to review, Today's focus, overdue/upcoming tasks, scheduled work
  sessions, due follow-ups, and Waiting/Blocked work. Urgent/no-deadline and backlog
  work remain discoverable through explicit sections/links rather than date-only
  sorting. Do not silently rank priority solely by deadline.
- Allow explicit Today focus selection/removal for a local planning date. Store
  it independently from task status/deadline, using a small date-scoped focus record
  or equivalent constrained representation. Unique owner/task/date prevents repeat
  entries. A previous focus date is not an overdue deadline or automatic new pin.
- Work/School/Personal can be viewed together or separately, with optional company,
  course/project filters. Reuse shared query services and date semantics.
- Actions open the original detail panel/page or source event/follow-up. Status,
  follow-up, focus and session changes use existing guarded mutations/history.
- Define section membership/counts clearly: the same task may be relevant in more
  than one section, but counts must not claim separate underlying tasks. Avoid
  manufacturing a second task/focus copy or silently changing records during reads.
- Reuse or adapt the main dashboard task/event tiles where appropriate so they
  navigate to canonical records and do not hide new statuses or disagree about
  actionable dates. Preserve unrelated main-dashboard modules and personal rewards.
- Handle local-day boundaries, task closure/reopen and archived items consistently.
  A closed focus item must not remain presented as unfinished work.
- Provide compact layouts, context-visible quick capture, clear empty/loading/error
  states, keyboard/touch actions and convenient navigation to filtered All Work.

## Boundaries

No notifications, automatic scheduling, recurrence, AI prioritization, calendar
sync or time tracking. My Work reads the already-built models; do not introduce
new deadline/event semantics or duplicate reports.

## Verification and acceptance

- Test combined/separate contexts, no-deadline Urgent work, New intake, Waiting
  versus Blocked, due follow-ups, real sessions and informational dates.
- Test focus add/remove/retry/concurrency, Toronto midnight/DST and another device
  zone; focus cannot alter deadline/status or become overdue itself.
- Test closed/reopened/archived items, section counts, consistent All Work/calendar
  links, read-only loading and denied access.
- Check phone portrait/landscape, normal/wide desktop, keyboard navigation, long
  content and actionable empty/error/loading states. Check dashboard regressions.
- Acceptance: A04–A07, A10, A18–A20, A22, A25–A29 and A31 as applicable.

Update PROGRESS.md with section/counting/focus rules and exact evidence. Stop.
Next: Phase 10.
