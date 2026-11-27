# Five dashboard improvement ideas

Written November 23, 2026, after reviewing the current navigation, dashboard,
Knowledge module, My Work, finance overview, notification settings, and draft
storage behavior.

Implementation status, reviewed November 25, 2026:

| Idea | Status |
| --- | --- |
| 1. Global search | [Implemented](../implemented/GLOBAL_SEARCH_MAINTENANCE.md); [design plan](../implemented/GLOBAL_SEARCH_PLAN.md) |
| 2. Recoverable drafts | Not yet implemented as a general durable-draft feature |
| 3. Quick add | [Implemented: desktop dashboard and phone quick-actions menu](../implemented/GLOBAL_QUICK_ADD_PLAN.md), following the revised scope |
| 4. Notification inbox | [Implemented](../implemented/NOTIFICATION_INBOX_MAINTENANCE.md) |
| 5. Weekly report | [Implemented](../implemented/WEEKLY_REPORT_MAINTENANCE.md) |

The proposals below preserve the original ideas. Their implementation documents
describe current behavior where the final scope differs. See the
[documentation index](../README.md) for all implemented and planned work.

## 1. Search the whole dashboard from one place

The [global search plan](../implemented/GLOBAL_SEARCH_PLAN.md) develops this proposal against the
current application, including placement, People and Japanese coverage, financial
deduplication, privacy, navigation, implementation order and verification.

**What it is:** A global search button, available from every page, with a keyboard
shortcut on desktop and a search icon on phones. Results would be grouped into
tasks, projects, Knowledge articles, calendar items, and financial records.

**Why it would help:** The dashboard now contains several connected modules. You
might remember an error message, a person's name, or an expense description
without remembering where you recorded it. A single search would make the site
more useful as your personal memory and reduce switching between pages.

**Example:** Searching `VPN` could show a troubleshooting article, the original
incident task, and the project containing that task. Each result would explain
its record type and open the existing detail page.

**How it fits:** Knowledge already searches its own content, and work and finance
have their own filters. Add an owner-protected search endpoint that queries the
existing canonical records; do not create copies of those records in a second
database. Reuse the current dialogs, navigation, and icons.

**Smallest useful version:** Search task/project titles and Knowledge titles,
summaries, and bodies. Add calendar and finance results afterward, with bounded
result groups and a clear Show more action. Avoid logging search terms or
searching file contents automatically.

## 2. Recover unfinished forms after a refresh or phone app restart

**What it is:** Private, recoverable drafts for long Knowledge articles and
important forms. Reopening the editor would offer **Resume draft** or **Discard**,
and show when the draft was last saved.

**Why it would help:** Current drafts can survive some internal navigation in
memory, but that does not guarantee recovery after a refresh or browser restart.
Losing a long troubleshooting explanation, expense entry, or selected image is
frustrating, particularly when switching apps on a phone.

**Example:** You start documenting a problem, insert two screenshots, then the
phone closes the PWA. When you return, you can resume the text and image choices
instead of reconstructing them.

**How it fits:** Extend the existing Knowledge image-draft foundation with an
explicit text/form draft model. Save drafts privately under the existing owner
authorization. Keep draft content separate from published articles, financial
records, task status changes, and their history.

**Smallest useful version:** Start with Knowledge text and image references,
debounced draft saves, a visible save indicator, expiry, and conflict handling
between tabs. Explicit Save would still publish the article. Draft saving must
never create an expense, link work records, or overwrite a newer published
version. Server-side recovery would require connectivity; offline editing should
be a separate decision rather than an implied promise.

## 3. Add a global Quick add button

**What it is:** One consistent creation button available throughout the dashboard.
It would offer New task, New event, New expense, New Knowledge article, and New
vocabulary. A compact floating button could make it convenient on phones.

**Why it would help:** Recording something should not require navigating through
its module first. The easier capture is, the more likely you are to record an
expense immediately or document the important detail of a problem before
forgetting it.

**Example:** While reading a procedure, you notice a follow-up action. Quick add
opens the existing task form with the article association preselected. From a
project, it could preselect that project and its activity type.

**How it fits:** Reuse the existing creation pages and their validation instead
of building a second set of forms. Pass explicit context through supported
creation parameters and provide a clear return path to the page you came from.
Keep task capture distinct from creating a timed calendar event.

**Smallest useful version:** A menu linking to the existing forms, with sensible
context defaults. Protect unsaved changes in the current page before navigating.
Only prefill associations when the originating page makes the intended link
clear; do not silently associate unrelated records.

## 4. Keep reminders in an actionable notification inbox

**What it is:** A notification bell with a private inbox showing recent and
unresolved reminders. Each reminder would identify its source and provide
appropriate actions such as Open, Dismiss, or Remind me later.

**Why it would help:** Phone notifications can be cleared or overlooked. An inbox
would give reminders a place to remain visible when you reopen the dashboard,
instead of relying entirely on the phone's notification screen.

**Example:** You dismiss a task follow-up notification while busy. Later, the
inbox still shows that follow-up so you can open the task and record what you did.

**How it fits:** The application already has push subscriptions, delivery
tracking, a reminder worker, and notification settings. Build on that system,
but distinguish a logical reminder from delivery attempts to individual devices.
One reminder sent to both a phone and a computer should appear once in the inbox.

**Smallest useful version:** Recent reminders, unread/dismissed state, source
links, and a bounded retention period. Add snoozing afterward. Dismissing or
snoozing a reminder must not complete a task, move its deadline, or change an
event's time. Retire obsolete reminders when their source is cancelled, resolved,
or rescheduled, and explain delivery failures without claiming a notification
was read simply because a push service accepted it.

## 5. Provide a short weekly review

**What it is:** A single review page that answers **What happened this week, and
what needs my attention next?** It would summarize existing records rather than
introduce another task system.

**Why it would help:** The main dashboard is useful for checking the current
situation, and the individual modules provide detail. A weekly review would help
you notice unfinished follow-ups, recurring issues, gaps in documentation, or
practice habits without inspecting every module individually.

**Example contents:**

- Tasks marked Done during the week, with reopened work shown separately.
- Overdue deadlines, waiting tasks with follow-ups, and upcoming project targets.
- Knowledge articles created or updated during the week.
- Japanese practice sessions, words practiced, and total practice time.
- Recorded income/expenses by currency and financial entries still awaiting
  statement matching, with links to the existing finance views.

**How it fits:** Reuse My Work planning rules, work activity records, Japanese
practice history, Knowledge timestamps, and the existing financial reporting
calculations. Use the dashboard's selected timezone for week boundaries. Link
each count to the corresponding filtered page so you can investigate or act.

**Smallest useful version:** A manual This week / Previous week page with a few
compact sections. Keep it separate from the main dashboard so the existing tiles
do not become crowded. Do not add automatic emails or push summaries initially.
Financial figures must retain explicit currencies, exclude owned-account
transfers, and describe recorded activity rather than imply complete account
balances. Missing history should be identified instead of estimated.

## Remaining priorities

Global search would improve everyday navigation; recoverable Knowledge drafts
would protect time spent writing. Quick add, the notification inbox and the weekly
report now have their own implementation and maintenance references above. A
separate [activity log design](../implemented/AUDIT_LOG_PLAN.md) describes the implemented history.
