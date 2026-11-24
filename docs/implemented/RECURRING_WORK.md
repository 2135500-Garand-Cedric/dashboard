# Recurring events, tasks and holidays

## Everyday use

- New events with an exact time or all-day date offer **Repeat**: daily, weekly,
  monthly or yearly. Set **Repeat until** to end on an inclusive calendar date;
  leave it empty to continue indefinitely. Undated events cannot repeat.
- New tasks offer a first deadline and the same repeat choices. Select a project
  and stage normally. For weekly payroll, create a Payroll project, then a task
  with its first Wednesday deadline and **Every week**. Every copy stays in the
  project, with its own status, notes, files and checklist completion.
- Existing tasks and events have **Make recurring** / **Edit repeating schedule**.
  Ordinary edits, completion, archiving and deletion affect only that occurrence.
  To update future copies, first edit the selected occurrence, then save its
  repeating schedule. It becomes the template for future copies.
- Schedule changes replace only untouched future generated copies. The selected
  occurrence, previous occurrences, completed/archived/edited copies, and tasks
  with supporting records or relationships are retained. These retained copies
  are exceptions and may no longer follow the updated repeat rule.
- **Stop repeating** removes untouched future copies while retaining history and
  exceptions. Deleting one occurrence records a skip so that it stays deleted.
  Cancelling a task also affects only that occurrence. Tasks are never archived
  automatically by recurrence.
- In **Settings → Calendar holidays**, press **Add holiday** to open a centered
  modal, then choose a country and an individual
  holiday. Regional variants are labeled in the holiday selector; you can mix
  holidays from different countries and provinces. The selected holiday tiles
  show each next occurrence and an editable display type: Holiday, Bank holiday,
  or Important date. Set the display name/type while adding a date, or use the
  tile's Edit button later. The centered editor closes when clicking outside.
  The original library date remains identified in the editor and on renamed
  tiles; changing display metadata never changes the stored date rule. Remove
  deletes only that selected date from your calendar.
  Tiles are ordered by their next occurrence, with unavailable dates last.
  Only selected holidays appear in Calendar as a teal informational layer,
  including the phone day view and upcoming sidebar. Project/activity filters
  show occurrences linked to matching tasks; the Holidays layer can also be toggled.

## Four upcoming occurrences

Task lists, project counts, My Work, dashboard tiles and Calendar show only the
next four upcoming unfinished occurrences of each series. The limit is applied
before filtering, pagination and counting, so paging or choosing a different
project cannot reveal another four copies. As earlier occurrences are completed
or pass, the next ones become visible. Overdue items, completed history and
archived records remain available. Existing future records are hidden, not
removed; their IDs, notes, files and relationships are retained and direct links
continue to work.

The lookahead also generates enough future records for four yearly or leap-day
occurrences, rather than limiting birthdays to the next year. An optional series
end date still takes precedence.

## Dates and time zones

Repeating timed items keep the local hour in the time zone captured when repeat
was enabled. Changing the dashboard display zone changes how those instants are
shown, not their schedule. On a spring clock gap, a nonexistent local time shifts
forward by the gap. On a fall overlap, the original earlier/later choice is kept.
Timed events preserve their elapsed duration. All-day spans and task date-only
deadlines remain calendar dates, without UTC shifts.

Monthly repeats use the original day of the month and skip months without that
day. February 29 yearly repeats occur in leap years. These rules are displayed
beside the relevant Repeat choices.

## Storage and background processing

The additive `20261119090000_recurring_work_and_holidays` migration adds:

- `RecurrenceSeries`: owner, event/task kind, frequency, anchor, time zone,
  optional end date, active state, revision, a small template snapshot and a
  generation cursor.
- Nullable series/date keys on `Todo` and `Event`; existing IDs and relationships
  remain unchanged. Each occurrence is an ordinary real record.
- `RecurrenceSkip`: deleted-occurrence tombstones.
- Optional holiday preferences on `User`; holidays themselves are calculated,
  not stored as personal events.

The follow-up `20261119120000_individual_calendar_holidays` migration adds
`CalendarHoliday` records keyed uniquely by owner and country/region/rule. Each
selection stores its trusted source rule and active/exception options. Its
`name` and `type` columns are display metadata; the library's original name/type
remain in `options` for date calculations. Old public/optional/observance display
values are read as Holiday, so no new migration is required for custom labels.
Display types use teal (Holiday), amber (Bank holiday), and blue (Important date)
in Calendar and the sidebar. Next dates are calculated, not saved as static annual dates. The old
region preferences are converted once under the owner transaction lock on first
use, then cleared. `holidaySelectionConfigured` prevents removed selections from
being restored on later visits. Existing personal events/tasks are unchanged.

The existing `notification-worker` container generates an initial six-week task
and one-year event window hourly, extending it when needed to retain at least
four upcoming unfinished occurrences. This runs even when push is disabled.
Task/event lists refresh the lookahead too, and Calendar queries extend it to the
requested range as needed. Only four upcoming copies per series are displayed. Enabling
repeat generates an initial window immediately. No additional container, API key
or external calendar service is needed. Keep the existing worker running so new
tasks appear without opening Calendar. An inactive/archived project pauses new
task generation; previously generated tasks retain their own state.

The worker and app use the same transaction-scoped owner advisory lock and unique
`(recurrenceId, recurrenceDate)` keys. Generation, schedule edits, and skip records
are transactional. Retries cannot create duplicate occurrences. Generated task
activity and event history use the existing audit stores. Notes, attachments,
dependencies, focus records and completion history are never copied into a new
occurrence. Checklist titles and selected people are copied; retired stages and
contacts are omitted from new copies. Generation is split into batches of at most ten years (four leap-day birthdays
can span sixteen years), and normal calendar range/item limits still apply.

Deploy with the usual image build, `prisma migrate deploy`, and restart both app
and worker on the same image. Do not seed or replace your real data. Database
backups include recurrence rules, skips, generated records and holiday preferences.

## Holiday data and maintenance

Holiday calculations use [date-holidays](https://github.com/commenthol/date-holidays),
including its regional rules and substitute dates. The package runs locally;
viewing Calendar does not call a third-party holiday API. Keep it updated as
holiday rules change. The package and bundled data are licensed ISC and
CC-BY-SA-4.0; its installed LICENSE contains source/data attribution.

The selectable Canadian catalogue includes Easter Monday and a Remembrance Day
bank-holiday option. Regional choices retain their own classifications. Selecting
one holiday does not enable the rest of its country or region. Calendar rendering
deduplicates identical names/dates chosen from several regions. References:
[CRA public holiday calendar](https://www.canada.ca/en/revenue-agency/services/tax/public-holidays.html)
and [Payments Canada closure schedule](https://www.payments.ca/system-closure-schedule).

Selections retain a rule snapshot so dependency updates do not erase an existing
choice. If legislation changes a selected holiday's rule, remove and re-add its
updated catalogue entry. Bank classifications do not guarantee the opening hours
of a particular branch or employer. Holiday selections never reschedule tasks.

## Settings pages

`/settings` is the tile menu. Timezone preferences are at `/settings/timezone`,
individual holidays at `/settings/holidays`, and device/reminder settings at
`/settings/notifications`. The Finance settings tile links to its existing
`/finance/settings` pages. All pages inherit the owner-only protected layout;
all holiday catalogue/add/remove APIs check the owner before reading input/data.

## Verification

- Unit rules: `node --test tests/recurrence.test.mjs`.
- Disposable database: set `RUN_RECURRENCE_DB_TEST=1` and
  `WORK_MANAGEMENT_DISPOSABLE=1`, using `docker-compose.work-test.yml` and its
  `work-db` database. Run `node --test tests/recurrence.integration.mjs`.
- Disposable browser app on port 3002: set `RUN_RECURRENCE_BROWSER_TEST=1` and run
  `node --test tests/recurrence.browser.mjs` with Playwright available.
- Existing unit suite, strict TypeScript, ESLint and production image build.

Individual holiday selection checks: `node --test tests/holiday-selections.test.mjs`.
Use `RUN_HOLIDAY_SELECTION_DB_TEST=1` for `tests/holiday-selections.integration.mjs`
in the disposable database. `RUN_SETTINGS_HOLIDAYS_BROWSER_TEST=1` enables
`tests/settings-holidays.browser.mjs` against the disposable app on port 3002.

## Birthdays and annual information pages

Use **Settings → Birthdays** to add a person's name and birthday month/day.
Birth year/age are not stored. Creation and editing use a centered modal; clicking
outside closes it. Tiles are ordered by the next birthday. February 29 birthdays
appear on February 28 in non-leap years, with this policy shown in the form.

The additive `20261119150000_birthdays_and_calendar_date_tasks` migration adds
`CalendarBirthday` and `CalendarOccasionTaskLink`, preserving existing tasks,
events and holiday rules. Composite foreign keys enforce ownership of the date
and its linked task. A link has exactly one parent (holiday or birthday) and a
date identifying the specific annual occurrence. Unique keys prevent duplicates.
Removing a birthday/holiday or task removes its associations; removing a calendar
date never deletes its linked tasks. Birthday date corrections move associations
to the corrected date in each year and record task activity, without changing the
tasks' own deadlines. Calendar-date linking and settings deletion share the owner
transaction lock to prevent races.

The Calendar's **Birthdays** layer displays annual birthday markers. Holiday and
birthday markers open `/events/holidays/[id]?date=YYYY-MM-DD` and
`/events/birthdays/[id]?date=YYYY-MM-DD`. Settings tiles open the next occurrence.
These information pages have no event edit/delete/completion controls. Metadata
is managed in Settings. You can link/unlink existing tasks or create a new task
with a prefilled, editable deadline. Task creation and association save in one
idempotent transaction; invalid or foreign dates roll back task creation. Links
apply only to the selected year/date. A task's calendar section also shows its
holiday/birthday links. All APIs require the owner. Project/activity filters
show only annual occurrences with matching linked tasks; unlinked annual dates
remain hidden in those filtered views.

New expenses start tax and tip empty. Empty fields save as zero, while decimal-safe
auto-totals and manual-total mismatch warnings keep working. Editing an existing
expense preserves its displayed amounts.

Checks: `tests/calendar-occasions.test.mjs`,
`RUN_CALENDAR_OCCASIONS_DB_TEST=1 node --test tests/calendar-occasions.integration.mjs`
against the disposable database, and `RUN_CALENDAR_OCCASIONS_BROWSER_TEST=1`
with `tests/calendar-occasions.browser.mjs` against the disposable app on port 3002.
