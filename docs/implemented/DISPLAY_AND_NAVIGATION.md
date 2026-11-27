# Dashboard display and navigation

Settings → My account controls the connected user's display timezone. The
preference is stored in `User.timeZone`, validated by the authenticated
`/api/account` profile endpoint, and shared through `SettingsProvider`. Until a preference
is saved, the existing application timezone remains the default.

Timed values use UTC instants in API/database writes and the saved timezone for
display and local-time entry. Date-only values (purchase dates, all-day events,
deadlines without a time) remain calendar dates. Changing the display setting
does not rewrite existing timestamps or historical daily-average snapshot keys.
Server-side work planning, Japanese practice day grouping, and the finance
report's current day use a request-local timezone through `AsyncLocalStorage`.
Client components must use `SettingsContext`, not import the Node-only context.
Ambiguous local times require an earlier/later choice; nonexistent times are
rejected instead of being silently shifted.

`ViewStateProvider` retains filter visibility and values during client page
navigation. Calendar layers, activity type, project, history toggle, view, and selected
date are retained. All Work and My Work also retain their query criteria while
continuing to support direct URL filters. These in-memory preferences reset on a
full browser reload; the timezone setting persists in the database. Music remains
mounted in the root shell throughout client navigation.

Creation and management routes:

- `/todos/new`: shared task creation from All Work, My Work, and project work.
  Activity and project filters prefill optional fields; save returns to the originating
  view. Unsaved changes use the existing draft guard.
- `/projects/new`: project creation. Both creation pages have Back controls and
  retain the unsaved-change guard.
- `/todos/manage`: combined contexts and contacts directory, with permanently
  visible sections. The previous context/contact URLs redirect here.
- `/settings`: a compact city-based timezone list with current GMT offsets.

At desktop widths, the main dashboard divides the viewport height between its
tile rows. Tiles scroll internally, keeping all five tiles on screen. On phones,
the dashboard continues to scroll with the document. Task detail dialogs
close on a backdrop click or Escape, using the same unsaved-change check as the
Close details button.

All Work and My Work group their primary actions beside the filter toggle. The
All Work list/board switch remains available while filters are hidden. Applied
criteria appear as removable chips, including planning sections passed by My
Work's View all links. Clear filters clears all criteria and keeps the selected
list/board presentation.

## Task details and retired task rewards

Task details prioritize the title, status/priority badges, description, files,
and notes. The compact sidebar contains status and project/stage selectors. Header actions
include Focus today and Schedule work session. Requester and affected people have an open, independently saved
section between status and project. Priority, activity type, and kind are edited next
to the title; tags and waiting-on contact controls are removed. Deadline and follow-up cards sit prominently below the title, while record
details remain expandable. Editors stay mounted so
collapsing a section does not discard drafts or bypass the unsaved-change guard.
The previous Overview/Files/Notes navigation bubbles are removed.

Relationships show every link type together with its label. The list scrolls
after five standard-height entries; the client reads subsequent API pages rather
than hiding links after the first page. Relationship type remains selectable
when creating a link. Link existing task and Create child task open centered
dialogs; backdrop clicks or Escape discard the local relationship draft.
Project selection loads all active project pages without
requiring a search; the current closed/archived project remains visible.

Tasks no longer award or reverse XP/coins on completion or reopening. Existing
earned balances and historical reward snapshots remain untouched. Old reward
columns remain for historical compatibility; no schema migration or balance
backfill is required. Zero-valued legacy API reward fields remain accepted, but
nonzero reward configuration is rejected. Task cards/details no longer display
rewards, and activity displays hide the retired reward internals. Quest rewards
keep their existing path; Japanese practice rewards are described below.

Task details use one authenticated `/api/todos/:id/details` request for the
initial task, section data and picker choices. `task-details.ts` orchestrates the
existing readers inside one request-local Repeatable Read snapshot;
`read-snapshot.ts` memoizes only the canonical task/graph reads inside that
snapshot. It never caches results across requests or mutation transactions.
Project picker choices use a lightweight ID/name query rather than calculating
progress for every project. All relationship pages remain included.

`TaskInitialLoad` supplies those first reads to mounted sections and keeps the
single loader until they settle. Its seed expires when the content is revealed;
edits, searches, pagination, retries, date-boundary updates and later refreshes
use the regular authenticated APIs. Duplicate development mount effects share
one component-local initial request. Contact searches debounce typed input, but
not the initial empty query. Standalone project sections retain normal reads.

The opt-in `tests/task-initial-loading.browser.mjs` delays the combined response,
asserts one initial request and no section waterfall, and verifies error retries
and relationship modals. `tests/task-details-loading.integration.mjs` checks
ownership, multiple relationship pages, notes/follow-ups, attachments, stages,
fresh reads and one canonical task lookup. `tests/task-read-snapshot.test.mjs`
checks concurrent scope isolation and that normal API reads stay fresh.

The opt-in `tests/task-details.browser.mjs` check uses only the disposable app on
port 3002. It covers phone/desktop layout, 24 links across all relationship types
and multiple API pages, internal scrolling, note saving and project/stage changes.

## Practice rewards and quick sessions

Completed practices earn 1 XP per Good word and 2 XP per Perfect word. Gold is
`floor(completedWordCount / 5)`: 10/25/50/100 words earn 2/5/10/20 gold regardless
of ratings. The preview shows the projected rewards; Okay saves the session,
ratings, progress snapshot and user balance increment in one transaction. The
session key prevents duplicate awards on concurrent requests or retries, and
reuse with different session details is rejected. Saved XP/gold remain visible
in history. The additive `20261115120000_japanese_practice_rewards` migration adds
nullable fields; existing sessions remain null and receive no retroactive awards.

Done/Cancelled transitions retain the current archive state. Reopening clears the
archive flag. Existing tasks are not bulk-reclassified. Active lists all unarchived
tasks, including closed tasks; Archived lists explicitly archived records.
Completed tasks still count toward project progress. The task header provides
manual Archive/Restore actions beside Focus today.

The header Schedule work session action opens a centered dialog with a start
time in the saved display timezone and an integer duration in minutes. The form creates a
busy WORK_SESSION event with a SESSION_TARGET link and a generated task-based
title through the existing authenticated, revision-checked event API. Minutes
represent elapsed time across clock changes; ambiguous starts require an
explicit occurrence and nonexistent starts are rejected. Deadline and follow-up changes also use centered dialogs. Clicking outside or
pressing Escape cancels a dialog without saving; closing is disabled during a
save. The bottom Work sessions & linked events section is always open and only
shows existing records. Ending a session does not complete or archive the task.

Resolved follow-ups appear with manual notes in Notes only, ordered by recorded
or resolution time with one shared pagination sequence. The server reads existing
follow-up facts directly; it does not copy them into editable notes or backfill
new records. Active follow-ups stay in the prominent date card. Legacy history is
available immediately, including completion outcomes, snoozes and cancellations.

Task key-date controls and commands are retired; old records remain privately
stored for history preservation. Their write commands return 410 and they no
longer appear on the calendar. Project milestones remain available in projects
and have their own Project milestones calendar layer. The task timeline hides
retired key-date activity. No schema migration is required for this change.

`tests/task-dialogs.browser.mjs` checks header actions, centered dialogs,
outside-click cancellation, deadlines, follow-ups in Notes only, linked event
listing, and nested task-panel dialogs at phone and desktop sizes.
`tests/task-follow-up-timeline.integration.mjs` covers stable combined pagination,
legacy follow-up history, read-only behavior, ownership and retry safety.

`tests/practice-and-task-updates.browser.mjs` checks these workflows against the
disposable app. The practice integration checks include simultaneous retries,
separate concurrent sessions, changed-payload conflicts and late failure rollback.
`tests/practice-rewards-migration.mjs` requires a fresh pre-rewards disposable
restore and verifies preservation and retry safety.

## Verification

`tests/settings-time-zone.test.mjs` covers owner-first settings access, validation,
concurrent request isolation, date-only formatting, and daylight-saving edge cases.
`tests/display-settings.integration.mjs` requires a fresh, disposable restored
pre-settings database. It proves original-row preservation, migration retry
safety, and timezone-aware work/Japanese day grouping, with test writes rolled
back. Never run it against the working database.

`tests/dashboard-layout.browser.mjs` runs only with
`RUN_DASHBOARD_LAYOUT_BROWSER_TEST=1` against the isolated test application at
port 3002 and its disposable authentication secret. It creates test tasks,
projects, and events. The browser checks phone, landscape, desktop, and wide
desktop layouts, timezone entry/display, client navigation persistence, separate
creation/management pages, task panel closing, and scrolling. A synthetic YouTube
player verifies iframe lifetime without depending on external playback.

The historical work migration rehearsal intentionally ends at work phase 09.
It reports the later display-settings migration as pending; the dedicated
settings integration test rehearses that migration separately.

## Calendar agenda

The calendar sidebar lists upcoming items in the displayed range, respecting the
same layer, activity-type, project, and history filters as the grid. All matching rows
are sorted chronologically; there is no separate 40-row sidebar limit. Timed
items disappear after their start; date-only items remain through their day in
the saved display timezone. A clock refresh every 30 seconds and on focus keeps
the list current. Unscheduled records remain accessible below the grid.

Sidebar stripes and badges use the feed's actual colors. Unlabelled events are
blue and unlabelled work sessions purple; configured activity colors override
those defaults. Unclassified deadlines are rose and follow-ups amber; typed tasks use their
activity color for both. Project milestones are cyan. Labels and symbols distinguish types even when custom
activity colors overlap. The previous grid legend is removed. Both views use plain titles from feed metadata while
preserving existing links, read-only task date markers, and event completion.

`tests/calendar-display.test.mjs` covers future filtering, date-only timezone
boundaries, DST ordering, custom colors and lists beyond 40 items. The opt-in
`tests/calendar-agenda.browser.mjs` uses mocked feed responses on the disposable
app at port 3002 to check desktop/phone rendering, exact grid/sidebar color
agreement, live cutoff updates, layer filtering and completion controls.

## Activity types and creation dialogs

Task creation, editing, child creation, conversion, and work filters use the
calendar's activity-type catalog. `Todo.activityTypeId` references `ActivityType`.
The additive `20261116120000_task_activity_types` migration reuses matching label
names (case insensitive) and creates labels for other task contexts. Existing
context records and links are retained for historical compatibility;
no task IDs, parent links, dependencies, or calendar records are replaced.
Saved task-view URLs discard the retired context filter so it cannot become an
invisible restriction behind the new activity-type selector.
Inactive types remain readable on existing tasks but cannot be newly assigned.
Removing a label clears owner task assignments and increments task revisions.

Calendar colors resolve live from linked task activity types. The session target
wins; otherwise, the lowest-ID linked owner task with a type wins. Its color and
label apply to the linked event, deadline, follow-up, grid and sidebar. Events
without a typed linked task use their own activity label or the default color.
Activity filtering follows the same rule, including unscheduled-event pagination.
Changing a type color needs no copying or backfill of related events. Marker
symbols and badges retain the distinction between dates, events and sessions.

Calendar event creation, project milestones, and project stages use centered
native dialogs with bounded scrolling, keyboard/backdrop dismissal, existing
unsaved-change guards, and save-in-progress dismissal protection. Clear filters
resets calendar layers, activity, project, history, pagination and the incoming
project query while keeping the chosen calendar date/view. Project header actions
are grouped with icons and colors; stage edit actions use labeled icon buttons.

`tests/task-activity-types.integration.mjs` exercises migration preservation,
color inheritance/precedence, live color changes, activity filters and inactive
types. `tests/calendar-project-controls.browser.mjs` verifies the task selector,
real event/stage/milestone saves, modal cancellation, toolbar icons and filter
reset on phone and desktop against the disposable app on port 3002.

## Retired task metadata and project activity types

Company and Course are retired from task creation/editing, details, lists,
filters, and task API inputs. Legacy saved filter URLs are cleared on restore;
old in-memory edit drafts submit only supported fields. Existing database values
and immutable audit records remain stored, but task DTOs and activity views omit
these retired fields. Contact company remains a separate contact property.

Projects use `WorkProject.activityTypeId` and the same activity catalog as tasks
and calendar events. The additive `20261117120000_project_activity_types`
migration preserves project/context IDs and matches existing context names to
activity labels without changing existing task classifications. Project creation,
editing, listing and filtering use activity types; project milestone markers use
their project's activity color. Label deletion clears project assignments and
increments project revisions under the existing owner transaction lock.

Project Start date, Target date and Activity type appear in separate summary
cards. Project dates remain calendar dates and display with written months and
weekdays without timezone shifts. The task capture action in a project supplies
its current activity type to the shared task form. Task creation also defaults to
the project's type when `activityTypeId` is omitted; explicit IDs or null override
that default. Updating a project or assigning an existing task to it does not
rewrite that task's classification. Newly assigning inactive types is rejected.

`tests/project-activity-types.integration.mjs` covers migration preservation,
defaults/overrides, retired metadata, activity filters and milestone colors.
`tests/project-classification.browser.mjs` covers real project/task creation,
readable date cards, color changes, task defaults, removed fields and stale filter
cleanup at desktop and phone sizes. `tests/retired-task-fields.test.mjs` checks
that cached old drafts cannot submit the removed fields.

## Daily-use refinements

The main dashboard includes a compact current-month CAD finance summary, using
the same report calculation as Finance Overview. It shows recorded income,
expenses, net cash flow and activities awaiting statement matching, rather than
implying a complete account balance. Finance Overview uses all available width.

Receipt and pay-stub originals open in a closable in-app dialog. Saving fetches
the owner-protected original without navigating the app: capable phones use the
native share sheet (including Save to Files), and other browsers download a blob.
A file prepared during a rejected share gesture stays in memory for a second
explicit tap; no private original is stored in service-worker or browser caches.
Matched records still allow original viewing and saving while edits remain locked.

Expense subtotal, optional tax/tip and total are always visible. Changing a
component recalculates the total using decimal-safe arithmetic. Subtotal, tax,
tip and total display and accept two decimal places; existing stored precision
is preserved when a displayed legacy amount is left unchanged. Editing the total
manually keeps the difference warning and explicit mismatch confirmation.
Finance currency controls offer CAD ($), USD ($), EUR (€), GBP (£) and JPY (¥),
while submitting the unchanged three-letter currency codes. On phones, the six
main finance tabs use a three-column, two-row grid with no horizontal scrolling.

Task and project note editors open in centered dialogs. Clicking outside closes
the dialog while preserving its draft for reopening. New notes contain text and
a server-recorded writing timestamp; links and occurred-at controls are no longer
offered. A new task note can optionally change its task status. The note and
status save in one transaction, using the current task revision, dependency
checks and existing audit records. Note cards show the before/after status.
The note's status field remains optional: its default reads Keep current status
with the current status name, and that status is omitted from the other choices.

Project Notes includes direct project notes and notes from all current project
tasks, with the task reference/title linking to its source. These are views of
the original note, not duplicate database rows: edits appear in both places,
membership changes move the note into the appropriate project view, and combined
pagination stays ordered by writing time. Task notes are edited from their task;
direct project notes stay independently editable. Historic links/times/revisions
remain stored rather than being deleted by the simpler editor.

Active work means unarchived work, including Done and Cancelled. The only task
views are Active and Archived; old saved history/all filters normalize to Active.
Task archiving is explicit through the header's Archive/Restore action. Existing
archived records are not changed retroactively. The shared task creation form
uses a single project selector without a search field. It offers the selected
project's active stages immediately below that selector without an extra heading,
hides the stage control when none are available, resets stage on project changes,
and accepts a stage supplied by a project capture link. The owner-protected
`/api/projects?options=1` projection loads active project IDs/names without fetching
progress counts or requiring pagination in the creation form.

Event start/end controls use minute precision without seconds. Clock-change
occurrence choices appear only for ambiguous event times and do not create
recurring events. Project target dates are informational all-day calendar markers
under Project milestones & targets, colored by the project activity type. They
respect project, activity, range and history filters and never create Event rows.
No schema migration is needed for these refinements.

Music volume defaults to 30% on supported browsers and is saved per browser in
local storage. The persistent player continues across internal page navigation.
iPhone/iPad embedded YouTube volume uses device controls; the app does not promise
YouTube playback after leaving the PWA. See Google's [iOS player limitations](https://developers.google.com/youtube/data/guides/ios_youtube_helper)
and [embedded-player policies](https://developers.google.com/youtube/terms/developer-policies-guide).
Time Manager and its proxy API, component, navigation entry and example
configuration have been removed; no external Time Manager service was changed.

Verification: `node --test tests/*.test.mjs`; disposable DB tests for work
foundation/projects and finance activities/reporting; and browser checks with
`RUN_DASHBOARD_USABILITY_BROWSER_TEST=1 node tests/dashboard-usability.browser.mjs`
and `RUN_FINANCE_ACTIVITY_BROWSER_TEST=1 node tests/finance-activities.browser.mjs`
against the isolated port-3002 application. Browser checks mock the YouTube API
and native share-sheet responses; physical iPhone/iOS acceptance remains necessary.

`RUN_WORK_NOTE_WORKFLOW_DB_TEST=1 node --test tests/work-note-workflow.integration.mjs`
checks atomic status/note saving, retries, late rollback, ownership, merged project
pagination, stage membership, project targets and active/archived behavior on the
disposable database. `RUN_WORK_FINANCE_REFINEMENTS_BROWSER_TEST=1 node
tests/work-finance-refinements.browser.mjs` checks the corresponding phone/desktop
flows against the isolated port-3002 app.

Account preferences now live under Settings → My account (`/settings/account`),
including the connected user's display timezone. There is no separate timezone
editor or sidebar entry for accounts/user management. Members see Settings with
only their account tile; the owner's Settings retains user management.
