# Work Management Redesign - Shared Project Context

## 1. Purpose and current situation

Redesign the task/work-management section inside my existing Next.js dashboard.
This is an existing application, not a greenfield project. It already has a
Kanban-style task board, task statuses, subtasks, dependencies, and links to
calendar events. It also contains other modules, including personal finance and
Japanese learning. Preserve their behavior.

I use this dashboard myself. It must support company IT work at POMPCO and
Degrandpre, school work, and personal tasks. Employees, requesters and affected
people are contacts, not new application users.

I want to capture requests quickly, know what to do next, follow waiting work,
keep dated notes, retrieve old tickets, plan longer improvements, and see work
alongside real calendar events. Do not turn this into a full enterprise service
desk. No AI is required.

This file defines the desired product, not a claim that these features already
exist. Inspect the actual repository before deciding what to reuse or change.

## 2. Product principles

- One canonical task/work item, viewed through lists, boards, projects and the
  calendar. Never create separate copies for each view.
- A task describes an outcome to complete. An event describes something happening
  at a date/time or over a date range. Neither replaces the other.
- The dashboard's existing calendar remains the calendar; do not build a second
  independent calendar for work.
- Capture should remain lightweight. Advanced fields are optional and progressively
  disclosed. A simple personal task must not require company-specific details.
- Prefer a compact list as the default, with an optional Kanban board.
- Dated history and a clear next action matter more than gamification.
- Priority is distinct from deadline. Do not invent deadlines to prioritize work.
- Preserve existing task IDs, events, relationships, progress and user data.
- Implement only the requested phase. Future requirements guide compatibility,
  not permission to build everything immediately.

## 3. Task, event and school examples

| Situation | Representation |
| --- | --- |
| Submit an assignment | Task with a deadline, optionally subtasks |
| Study for a midterm | Task with a desired outcome, optionally a preparation deadline |
| Attend an in-person or timed online midterm | Calendar event with its real time and location/link |
| Work on an assignment Tuesday 7-8 p.m. | Scheduled work session linked to its task |
| Complete a take-home exam by Friday | Task with a deadline; an availability window can be a separate informational event |
| Birthday, party or appointment | Event; related preparations can be separate tasks |
| Reading week or a holiday period | Informational all-day/multi-day event, not a task to complete |
| Prepare a computer for an employee | Company task, possibly checklist/subtasks |
| Employee's first day | Event or linked key date; computer preparation has its own deadline |

A study task may link to the exam event, but moving the exam must not silently
change the study deadline. Passing an event's end time does not complete a task.
Ending a work session does not prove the task was completed. Marking an assignment
Done should mean its chosen outcome was achieved, such as submission, not merely
that its calendar deadline passed.

## 4. Scope and organization

Use one underlying task model with a context such as Work, School or Personal.
Work tasks can reference a company and system; school tasks can reference a
course. These are organizational filters, not separate authorization domains.
Keep company/course optional where appropriate. Use existing naming conventions
and keep contexts configurable or easy to extend without a new subsystem.

Suggested task kinds are Task (general), Issue, Request, Improvement and
Maintenance. Do not force school assignments into an IT Issue type. Context and
type are independent. A course can be a simple label/reference initially; this
is not a student-information or grading system.

Use an immutable internal ID and a stable human-readable reference, for example
TASK-0142. Do not renumber existing references or use a reference as authorization.
Reuse and evolve existing entities rather than creating a parallel Task table.

## 5. Task information and quick capture

Quick creation should require a title only, with a visible context default based
on the current view. Default new status to New and priority to Normal. Other
information can be added immediately or later.

Task details should support:
- Title, description and desired outcome.
- Context, optional company/course, type and optional system/tags.
- Requester and optionally different affected person(s), when relevant.
- Status, priority and short next action.
- Deadline, active follow-up, work sessions and optional key dates.
- Waiting-on contact/reason, workaround details and completion outcome.
- Checklist, subtasks, related tasks and dependencies.
- Project/stage membership when that phase is implemented.
- Dated notes, change history, attachments and reusable-documentation links.
- Automatic created, updated and completed/cancelled timestamps.

Use a main content column for description, next action, notes and subtasks, and a
compact metadata area for people, dates, status and context. Support a quick-detail
panel with a stable full-page URL. On small screens use a full-screen detail view.

## 6. Status, priority and closure

Statuses: New, Backlog, To do, In progress, Waiting, Done and Cancelled.
Cancelled is available without requiring a board column. Do not require every
task to pass through every status. Map legacy statuses explicitly; preserve all
unrecognized custom statuses until a reviewed mapping exists.

Priority: Urgent, High, Normal, Low. Default Normal. It represents importance and
consequences, not a value calculated solely from the deadline. Urgent work with
no deadline must remain discoverable.

Waiting exposes who/what is awaited, a reason, and an optional follow-up date.
A dependency-derived Blocked indicator is separate from status. A workaround is
also separate: a task can be Waiting while a workaround is available. An accepted
workaround may close a task only through an explicit decision and explanation;
otherwise retain open follow-up work.

Offer a short completion summary. Make it easy rather than mandatory paperwork
for every trivial task. Closing/reopening preserves earlier closure history.
Archive hides items from active views without deleting them. Done and Cancelled
items remain searchable. A recurrence may be a new linked ticket; do not invent
an automatic recurrence engine in this project.

## 7. Notes, history and supporting documents

Keep current description/summary separate from dated progress notes. Notes can
record tests, calls, decisions, observations and links. New notes use server
recorded timestamps. Optional occurred-at information must not replace created-at.

Provide Notes only / All activity. Log significant changes such as status,
priority, deadline, scheduling, dependency, project membership, closure and
reopening with previous/new values where appropriate. Edits show edited status
and retain revisions for meaningful note changes. Automatic activity entries
must not be silently editable through normal task actions.

Use private attachments, primarily screenshots/images and PDFs. Reuse suitable
existing upload infrastructure without sharing finance record permissions or
creating public paths. Reuse the app's existing Markdown/rich-text renderer
safely. External knowledge-base links are references, not permission to scrape,
import or sync Obsidian automatically.

## 8. Checklist, subtask and relationship rules

A checklist item is a small completion step. A subtask is a real task requiring
its own state, notes, dates or dependencies. A subtask has at most one parent;
prevent hierarchy cycles. Display completed-item counts, not invented effort
percentages. Warn before closing a parent with unfinished children; do not
silently complete its children.

Related-to links are symmetric and do not block work. Blocking dependencies are
directional, with inverse Blocks/Blocked-by views. Prevent self-dependencies,
duplicates and dependency cycles, including concurrent changes. Completion of a
prerequisite updates availability but does not start or complete dependent work.

Cancelled prerequisites require review or an explicit override, not an assumption
that the prerequisite was completed. Starting/closing a blocked task requires an
explicit warning/override decision recorded in history. Existing dependency
semantics must remain intact until deliberately migrated.

## 9. Dates and calendar: one source of truth per date

Keep these distinct:
1. Deadline: latest acceptable completion, optional date-only or exact date/time.
2. Follow-up: next check/reminder, independent of the deadline. Allow completing
   or snoozing it without closing the task; retain earlier follow-up history.
3. Work session: reserved start/end time for working on a task; allow many per task.
4. Key date/milestone: expected delivery, launch, start date or other contextual date.
5. Regular event: exam, meeting, birthday, party, holiday, etc.

Task deadlines and follow-ups are projected into calendar views from task data,
not copied into independent editable events. Give projected items stable IDs.
Reuse existing event records for scheduled work sessions when suitable, with a
kind and a task link. Never store independently editable copies of session times
in both a task record and an event record. An event may link to multiple relevant
tasks; an event link alone does not mean it is a work session or deadline.

Distinguish calendar layers with labels/icons and styling, not only color:
- Ordinary events: existing event presentation.
- Work sessions: time blocks with a task label.
- Deadlines: Due/flag marker, not a duration blocking the whole day.
- Follow-ups: Follow up marker, not automatically reserved time.
- Key dates/milestones: informational marker.

Provide layer toggles and context filters. Clicking a marker opens its source
record. Moving a work session changes that session only. Deadline/follow-up moves
must explicitly identify and update the relevant task field, with history.

Completing/cancelling a task removes outstanding-action indicators for its dates
but preserves historical information and unrelated appointments. Keep past work
sessions. Offer review of future linked sessions; never silently delete them.
Event deletion must not delete tasks; task archival must not delete independent
events. Reopening recomputes overdue state from the original deadline.

Use the app's configured timezone; America/Toronto is the intended default unless
existing settings specify otherwise. Preserve date-only values as calendar dates;
do not convert them into UTC midnight deadlines. An exact deadline is overdue
after its instant; a date-only deadline becomes overdue after that local date.
A date-only follow-up becomes due on its local date; a timed one at its instant.
Store enough information to render timed records across timezone/DST changes.
Informational all-day events need not imply the user is busy. Preserve existing
recurrence and instance-editing behavior rather than rebuilding it unnecessarily.

## 10. Legacy school events and existing calendar links

Do not bulk-convert existing calendar entries based on titles or guessed intent.
Keep midterms, parties, birthdays and reading week as events. For an existing
assignment event, offer an explicit previewed Create task from this event action
in the calendar phase. Let the user choose the deadline and context.

An event can remain a linked real event. Alternatively the user can explicitly
identify it as a legacy deadline placeholder: preserve its data/provenance while
superseding its display with the task's projected deadline. Avoid displaying both
representations as independent actionable deadlines. Conversion must be retry-safe,
reviewable and reversible where feasible. Do not convert a whole recurring series
without a separate explicit decision; defer unsupported cases safely.

## 11. Projects

A project groups longer work: objective, context, current summary, dates and
milestones, stages, notes and tasks. Stages such as Requirements, Implementation,
Testing and Launch are not task statuses. Tasks keep their own status.

A task may be standalone or have one primary project. Support cross-project
related/dependency links without duplicating tasks. A project is optional, not
required for ordinary support requests or assignments.

Reuse notes/activity/attachments patterns for project summaries and decisions.
Project progress shows completed/total relevant tasks or explicit milestone state,
not a claim about percent effort. Completed projects remain accessible. Warnings
rather than hidden cascading changes handle closure with unfinished tasks.

## 12. Pages and presentation

- My Work: New work to review, Today's focus, overdue/upcoming tasks, scheduled
  sessions, follow-ups due, and waiting/blocked work. No-deadline work remains visible.
- All Work: compact searchable list by default, optional board; same records and
  filters in both. Include context/company/person/type/status/priority/date/project.
- Projects: overview and project detail with tasks/stages/milestones and notes.
- Existing Calendar: ordinary events plus typed work layers.
- Completed/history: saved view within All Work, not a disconnected archive.

A Today focus pin is a planning choice, not a deadline or status. Work and school
must be viewable separately and together. Business task cards should emphasize
people, dates, waiting and next action, not XP/coins. Preserve stored gamification
and existing personal behavior; do not remove or re-award rewards during migration.
Keep the existing visual language, accessible labels and responsive layouts.

## 13. Technical, safety and migration boundaries

Inspect and reuse the repository's actual Next.js routing, ORM, database,
authentication, calendar, design system, attachment storage and testing patterns.
Do not assume a library/version just because it appeared in earlier discussions.
Protect pages, APIs, mutations, search results and files using existing owner
checks. Organizational context does not relax authorization. Validate on the
server and prevent stale writes, duplicate submissions and partial relationship
updates. Never log sensitive notes, files, tokens or real contact details.

Use additive, staged migrations wherever practical. Preserve existing IDs and
URLs or provide compatibility links. Explicitly map statuses, subtask/dependency
relations, calendar associations and rewards. Never manufacture historical notes
or claim a new field was known in the past; leave it unknown or mark defaults.

Test migration on a disposable development copy. Produce a before/after inventory
and recovery plan; do not run against production without explicit authorization.
Never reset a database, seed examples into production, rotate credentials, push,
deploy, send email or modify external calendar data as an incidental build action.
Development examples must be synthetic, opt-in and isolated.

## 14. Explicit non-goals

No AI, n8n, automatic email intake, Outlook synchronization, employee portal,
multi-user assignment system, SLAs, inventory/CMDB, invoicing, grade tracking,
complex time tracking, forecasting or new recurrence engine in these phases.
Preserve already implemented integrations, if any, but do not assume that a
previously discussed integration exists. No automatic external notifications.

## 15. Phased execution contract

Before each phase, read applicable repository instructions, this context,
PROGRESS.md, ACCEPTANCE.md, the requested phase file and relevant actual code.
Separate observed repository behavior from proposed behavior. Report conflicts
rather than silently replacing this scope or trusting a stale README over code.

Phase 00 is discovery and a reviewed migration plan. Later phases may implement
only their stated deliverables, in development, after prerequisite decisions are
settled. Summarize the implementation plan before edits. Create no production
changes. Stop after the selected phase; do not proceed automatically.

After each phase update PROGRESS.md with files/migrations changed, decisions,
exact tests actually run and outcomes, unverified items, manual acceptance steps
and the next phase. Do not mark tests passed unless executed. If required checks
cannot run, identify the limitation and leave the phase unverified.
