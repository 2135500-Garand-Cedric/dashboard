# Notification inbox — architecture and implementation plan

Status: implemented. See [Notification inbox maintenance](NOTIFICATION_INBOX_MAINTENANCE.md)
for the final structure, rollout, retention rules, verification results, and
remaining deployment/device checks. The sections below retain the original plan.

Prepared November 23, 2026, from proposal 4 in
[Dashboard improvement ideas](../planned/DASHBOARD_IMPROVEMENT_IDEAS.md) and the actual
notification worker, schema, APIs, service worker, authentication, and tests.

## 1. Purpose

Give calendar and work reminders a persistent home inside the dashboard. A phone
notification can be overlooked or cleared; the corresponding inbox reminder
should still be available when you reopen the app.

The inbox should work on desktop and phone, including when you have not enabled
phone notifications. It should use the existing application, PostgreSQL database,
and notification-worker container. No additional service is proposed.

Keep these facts separate:

- A **reminder** is one item requiring your attention.
- A **delivery attempt** tries to send that reminder to one device.
- **Read** means you explicitly opened or marked the inbox item as read.
- **Dismissed** means you removed that reminder from your active inbox.
- A task's completion and an event's schedule remain facts in their own modules.

One reminder sent to a phone and a computer must appear once in the inbox.
Neither successful delivery nor dismissing a reminder completes its source task.

## 2. Current implementation and reuse

| Existing file/model                                     | Current behavior and relevance                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotificationSettings` in `prisma/schema.prisma`        | Stores source preferences, lead time, date-only reference time, push-title privacy, activation time, and worker heartbeat.                                 |
| `PushSubscription`                                      | One device/browser registration, with activation state and delivery information. Keep this separate from inbox records.                                    |
| `PushDelivery`                                          | Durable per-device queue with source identity, occurrence key, retries, leases, and SENT/FAILED/SKIPPED states. Unique by subscription and occurrence key. |
| `src/lib/notifications/rules.mjs`                       | Validates preferences, computes reminder times and stable occurrence keys, and formats push payloads.                                                      |
| `src/lib/notifications/engine.mjs`                      | Selects eligible sources, creates device jobs, claims leases, revalidates sources, sends push, retries failures, and cleans old deliveries.                |
| `scripts/notification-worker.mjs`                       | Runs a pass every 30 seconds and generates recurring task/event occurrences periodically. Keep both responsibilities working.                              |
| `src/lib/notifications/server.ts`                       | Owner settings, device registration, test notifications, and safe errors. It does not currently provide an inbox.                                          |
| `src/app/api/notifications`                             | Existing configuration and subscription APIs. Add inbox routes beneath it rather than replacing its current GET/PATCH contract.                            |
| `public/sw.js`                                          | Displays push messages and opens a validated destination. It deliberately does not cache private app data.                                                 |
| `src/app/notifications/open/page.tsx`                   | Preserves valid destinations through GitHub sign-in. This route needs special care when adding protected inbox pages.                                      |
| `src/components/notifications/NotificationSettings.tsx` | Existing setup, device, permission, test-send, and heartbeat interface. Keep it as settings, not the inbox.                                                |
| `src/components/AppShell.tsx`, `SideMenu.tsx`           | Places to mount a persistent bell and badge without rebuilding the player or app providers on navigation.                                                  |

The current worker returns early if push is unconfigured, the master setting is
off, or no matching active device exists. That behavior must change for inbox
generation; otherwise an inbox would disappear whenever phone push is unavailable.

Current automatic sources are ordinary events, valid work sessions, task
deadlines, active task follow-ups, and project milestones. The actual selector
does not currently include project target dates, holiday selections, or birthdays,
even though those can appear in the calendar. Do not claim the inbox supports
every calendar item automatically.

## 3. User experience

### Bell and preview

Add a bell with an unread count and a short preview of recent active reminders.
Include **View all notifications** and a link to notification settings. Opening
the preview alone must not mark every item as read.

On desktop, the bell can fit into the dashboard navigation header. On phones,
provide a visible bell without requiring the user to open the side menu. Reserve
space for it alongside the existing mobile navigation rather than covering page
actions. Account for the development banner and the main dashboard's bounded
tile layout. Do not add a toolbar that accidentally makes that dashboard overflow.

### Full inbox

Create `/notifications` with these views:

- **Active:** relevant, non-dismissed reminders, including ones already read.
- **Unread:** active reminders that have not been read.
- **History:** dismissed, resolved, superseded, and expired items, with reasons.
- **Snoozed:** add when snoozing is implemented.

Each card should show the reminder type, source title, written date/time, and a
clear source button. Use recognizable type icons and the existing calendar's
activity colors where available, with text labels so color is not the only cue.
For example: **Follow-up · Contact supplier · Nov 25, 9:00 a.m.**

Keep delivery diagnostics secondary. An expandable detail can say **Accepted by
push service on Phone** or **Push failed on Desktop**. Do not label that as
displayed, received, or read: the existing push response cannot prove those facts.

On phones, use one column, comfortable buttons, and normal page scrolling.
Provide loading, empty, retry, and action-in-progress states. Use pagination or
load-more with a bounded page size; do not load all retained reminders at once.

### Actions and their meaning

| Action             | Effect                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| Open source        | Mark this inbox item read, then open the existing task/event/project page.             |
| Mark read / unread | Change inbox read state only, synchronized between devices.                            |
| Dismiss            | Hide this reminder from Active and retain it in History. Offer a short Undo action.    |
| Mark all read      | Mark the currently eligible unread items read through an explicit server command.      |
| Remind me later    | Later phase: hide this reminder until a chosen time and schedule a new reminder cycle. |

Do not add a generic Complete button initially: events, work sessions, tasks,
follow-ups, and milestones have different completion semantics. Their normal
detail pages already handle those actions correctly.

## 4. Data model

### New `UserNotification` model

Use one owner-scoped row per logical source occurrence, independent of devices.

| Field                                     | Purpose                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `userId`                            | Stable UUID and owner relation. Reuse the established GitHub-owner/database-user mapping.                                          |
| `occurrenceKey`                           | Current deterministic occurrence identity; unique with `userId`.                                                                   |
| `sourceKind`, `sourceId`                  | Bounded existing reminder kinds and their canonical record IDs.                                                                    |
| `category`                                | Display/preference category; distinguishes an ordinary event from a work session even though both currently use source kind EVENT. |
| `titleSnapshot`, `labelSnapshot`          | Small fallback descriptions for history if the source later changes or disappears. Never copy full notes or documents.             |
| `sourceDate`, `targetAt`, `dueAt`         | Optional original date-only value, resolved target instant, and base reminder instant.                                             |
| `lifecycle`, `retiredReason`, `retiredAt` | ACTIVE, RESOLVED, SUPERSEDED, or EXPIRED; explain why an item left the active inbox.                                               |
| `readAt`, `dismissedAt`                   | Independent user decisions. They are not delivery statuses.                                                                        |
| `revision`, `createdAt`, `updatedAt`      | Conflict checks, stable history, and retention.                                                                                    |

Index owner/lifecycle/due-time browsing and the unread predicates. Order by
`dueAt DESC, id DESC`, with a stable pagination cursor if needed. Compute the
unread count from persisted rows; do not maintain a separate drifting counter.

Use the same occurrence identity as `reminderCandidate`: source kind, source ID,
and its timed target instant or original calendar date. A title edit or reminder
offset change must not create another occurrence. Different recurring tasks or
events retain their existing individual IDs and therefore distinct reminders.

The existing system already uses polymorphic source kind/ID references. Retain a
strict, small source resolver registry rather than inventing arbitrary entity
types or one wide table of nullable relationships. Every resolver must verify
ownership and handle missing sources. This design cannot rely on a source FK to
remove stale notifications; lifecycle reconciliation is required.

### Existing model extensions

- Add nullable `notificationId` to `PushDelivery`, with a real FK and index. Keep
  existing fields and IDs for historical compatibility and legacy queued jobs.
- Validate that a linked notification and subscription have the same owner,
  including with a database trigger or equivalent relational constraint. A plain
  notification-ID FK alone does not enforce that invariant.
- Add a one-time `inboxStartedAt` timestamp to `NotificationSettings`. Existing
  settings and new installations need an explicit activation boundary.
- Record per-category activation cutoffs when disabled source categories become
  enabled, using a small validated timestamp map or equivalent settings fields.
  Re-enabling one category must not import weeks of old reminders or reset other
  categories' activation times.
- Add the relevant `User` relation. Do not replace tasks, events, projects, or
  their source IDs.

Keep snooze-specific schema additions for the snooze phase rather than creating
unused queue structures in the first implementation.

## 5. Settings and channel behavior

Recommended initial rules:

- The inbox works without browser notification permission, VAPID configuration,
  or a registered push device. The existing worker must still be running.
- Preserve the existing `enabled` field as the push master switch and label it
  clearly **Phone/browser push notifications**. Turning push off should not erase
  inbox history or prevent in-app reminders from being created.
- Reuse existing source-category and timing preferences for both channels. Make
  their shared meaning explicit in settings. Project milestones remain opt-in.
- `Event.reminderMinutes = -1` disables that event's reminders in both channels.
- Keep `showDetails` as a lock-screen push privacy setting. Authenticated inbox
  pages can show the actual source title.
- Enabling a device must not deliver historical inbox items to it. Preserve the
  current subscription-created and push-enabled time checks.

Do not add a large matrix of channel/category settings or a second scheduler in
the first version. If separate per-channel category choices are requested later,
extend the preferences deliberately instead of adding hidden exceptions.

## 6. Worker lifecycle and duplicate prevention

Refactor the existing pass into separate stages:

1. Record worker health and load the owner's settings/timezone.
2. Generate recurring sources through the existing recurrence path.
3. Find eligible reminders and upsert logical inbox rows by owner/occurrence key.
4. Reconcile existing active rows against current source state.
5. If push is enabled/configured, create and process eligible per-device jobs.
6. Apply bounded retention cleanup and record useful health information.

Inbox materialization must run before the current no-push/no-device exits. Keep
worker-compatible services in the notification `.mjs` modules already packaged
by `Dockerfile.prod`; do not make the background worker import an entire Next.js
page or an unavailable TypeScript application service.

Create inbox rows when their reminder becomes due, not for every far-future
calendar item. Use a bounded seven-day catch-up window for in-app reminders after
worker downtime, limited by deployment/category activation cutoffs. Mark late
items clearly. This requires extending the current selector's 15-minute past
window for inbox catch-up; changing only the queue table would miss those items.

Keep the current 15-minute push grace period separate. A reminder recovered after
three days can appear in the inbox without sending a three-day-late phone alert.
Retain current retry/backoff, device expiry handling, and per-job leases.

Use an atomic upsert so two workers cannot create two inbox rows. Materialization
and its normal delivery associations must be transactional where appropriate.
Before dispatch, revalidate the notification's state and the current source.
Send outside long database transactions; no database transaction can roll back
an already accepted external push.

Dismissal or source edits can race the final send check. Skip jobs that are no
longer eligible, but document the narrow unavoidable window after final
validation. Stable device tags can coalesce retries; do not promise exactly-once
phone display or retracting a push already accepted by the provider.

### Reconciliation must use source lookup, not only the generation window

An active reminder can be older than the seven-day catch-up window. Look up its
source by identity when reconciling it. Absence from the time-window query does
not mean the source was deleted or completed.

| Source change                                                       | Inbox outcome                                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task Done, Cancelled, or archived                                   | Retire its deadline/follow-up reminders with an accurate reason.                                                                                   |
| Follow-up resolved or cancelled                                     | Retire that follow-up reminder; keep its normal work-note history unchanged.                                                                       |
| Event completed, deleted, or converted into an inactive placeholder | Retire its reminder.                                                                                                                               |
| Work session loses its eligible session-target task                 | Retire its reminder using the existing work-session eligibility rule.                                                                              |
| Project or milestone becomes inactive/completed/removed             | Retire the affected milestone reminder.                                                                                                            |
| Target date/time changes                                            | Supersede the old occurrence; create the new one only when it becomes due.                                                                         |
| Title, color, or lead time changes                                  | Refresh display/scheduling for the same occurrence; preserve read/dismissed state.                                                                 |
| Reminder category or per-event reminder is disabled                 | Retire/cancel its reminder jobs with a muted/disabled reason, not a false task-completed label.                                                    |
| Task reopened with the same already-notified deadline               | Keep the old reminder in history; do not silently make it unread or resend it. A new date or explicit later-reminder action represents new intent. |

Worker reconciliation provides eventual updates within a healthy worker cycle.
Source opening/actions must resolve the current source again. If faster badge
updates are needed, add transactional invalidation to the existing source writers
in a later refinement; do not pretend the worker alone provides instantaneous
cross-module updates.

## 7. Snoozing — a separate follow-up phase

Add snoozing after the basic inbox is reliable. Offer **In one hour**,
**Tomorrow morning**, and a chosen date/time with a reasonable future limit.
Tomorrow morning follows the saved dashboard timezone. Reject nonexistent local
times and explain ambiguous times using the existing date/time conventions.

Snoozing changes notification fields only: `snoozedUntil`, `generation`, and the
next delivery cycle. It never edits the task follow-up, task deadline, event,
project milestone, or recurrence schedule. Keep the base occurrence key stable.

At wake-up, revalidate the source, clear the snoozed state, and make the same
inbox item unread. If it is no longer relevant, retire it instead. This must work
even when the original source date is outside the ordinary generation window.

The current unique constraint `(subscriptionId, occurrenceKey)` cannot represent
a second deliberate push cycle. In this phase, add generation zero to existing
deliveries and change uniqueness to `(subscriptionId, occurrenceKey, generation)`.
Include generation in retry identity/device tags so retries coalesce within the
same cycle. Do not reset a SENT delivery to PENDING: that would mix a new user
request with transport retries and destroy useful history.

Use idempotent, revision-checked snooze actions. Multiple devices snoozing at the
same time must not create competing generations. Coordinate the schema/worker
rollout so an older worker cannot accidentally treat a snoozed item as active.

## 8. Routes, navigation, and authentication

Suggested additions:

- `/notifications`: full inbox.
- `/notifications/:id`: optional small reminder detail/source-resolution view.
- `/api/notifications/inbox`: filtered, paginated owner-scoped reads.
- `/api/notifications/inbox/count`: eligible unread count for the bell.
- `/api/notifications/inbox/:id`: revision-checked read/unread/dismiss/undo actions.
- `/api/notifications/inbox/read-all`: explicit bulk command with a server cutoff.
- `/api/notifications/inbox/:id/snooze`: later phase only.

Use a protected route group or page-level protection for the new pages. Do not
blindly add a `ProtectedLayout` around the whole existing `/notifications`
directory: that could intercept `/notifications/open` before it preserves a
phone's original destination through sign-in.

Keep the old `target` notification-open URLs working. New push payloads can carry
a notification ID, resolved to an owned source on the server. An expired session
must return through that resolver after GitHub login, not bypass it by redirecting
straight to an unchecked URL.

Update both `public/sw.js` and `/notifications/open` validation together. The
current service worker only allows a few source paths and strips target queries;
simply adding a React inbox page will not preserve a new notification-ID link.
Keep a strict same-origin allowlist and reject arbitrary callback destinations.

Mark read through an authenticated POST/PATCH action when the user opens an item.
Do not mutate read state through a public GET redirect. If marking read fails,
still allow the user to reach the valid source and offer retry feedback.

Call `requireOwner` in every new API handler before parsing input or reading
records. Scope all IDs and source lookups to the existing permanent owner mapping.
Use no-store responses, safe error codes, and no private payload/query logging.
Never expose endpoints, subscription keys, VAPID secrets, or raw provider errors
in an inbox response.

Mount one badge/preview provider in the existing owner-only app shell. Poll the
count on a modest interval while visible, refresh on focus and after actions,
and cancel stale reads. Avoid a request per component/page on every navigation.
The inbox count and list must use the same eligibility rules and the server's
current time. Initial real-time sockets are unnecessary.

## 9. Safe migration, retention, and recovery

Use additive migrations. Preserve existing subscription IDs, push jobs, source
records, source IDs, and delivery history. Do not recreate devices or rotate push
keys for this feature.

Recommended migration behavior:

1. Create the logical notification table and new nullable delivery FK.
2. Establish inbox activation timestamps without manufacturing historical unread
   items. Start the inbox prospectively; older data stays in existing work/calendar
   views and delivery history.
3. Let still-relevant pending legacy delivery jobs attach to a canonical inbox
   row when the occurrence meets the new activation boundary. Otherwise drain
   the legacy job without manufacturing an older inbox item. Do not turn every
   historical SENT row into an unread item.
4. Deploy a compatible app and worker together. Keep legacy null-FK processing
   until old pending jobs have drained; never drop the old queue on deployment.

Proposed retention defaults: remove terminal/dismissed inbox items 90 days after
retirement/dismissal. Expire active reminders after 180 days without changing the
underlying work, then retain that history for another 90 days. The source remains
available in its module. Preserve short-lived deduplication guarantees through
the eligibility windows so purged old items cannot be regenerated as new ones.

Deleting an inbox row must not cascade-delete a source or its delivery history.
Use a nullable delivery relation with suitable delete behavior, and retain the
existing independent delivery cleanup. Cleanup must also run when push is off;
today's early exits otherwise bypass parts of that maintenance.

Whole-database backups already cover new tables. Preserve `.env`/VAPID material
through the existing deployment/backup practices. Rehearse restoring the database
and restarting with push forced off so a restore test cannot send real alerts.
No new file-storage volume is necessary.

## 10. Implementation phases and acceptance criteria

### Phase 1 — Canonical reminder foundation

Add the logical model, activation boundaries, source resolvers, and idempotent
materializer. Refactor worker flow to operate without push devices/configuration.
Connect new deliveries while preserving old jobs and current push behavior.

Acceptance: two devices produce one inbox row; repeated/concurrent passes do not
duplicate it; push-disabled development still creates due inbox items and never
sends external messages; deployment does not create an old unread backlog.

### Phase 2 — Bell, inbox, and basic actions

Add protected APIs/pages, badge/preview, pagination, read/unread, dismiss/undo,
mark-all-read, current-source opening, and mobile layout. Preserve old push links
and the expired-session callback. Show safe secondary delivery information.

Acceptance: actions synchronize across devices, counts agree with filters, failed
actions remain retryable, and opening an inbox never marks unrelated items read.
Dismiss/read actions leave all source dates/statuses unchanged.

### Phase 3 — Source lifecycle and downtime reliability

Complete reconciliation, activation/category transitions, bounded catch-up,
retention, obsolete-job cancellation, and clear worker health states. Basic
source validation belongs in Phase 1 too; this phase exercises the full matrix.

Acceptance: completion, cancellation, archiving, conversion, rescheduling,
deletion, recurrence, and settings changes never revive stale reminders. Catch-up
does not send outdated push alerts. A worker restart resumes safely.

### Phase 4 — Snooze and repeat reminder cycles

Add snooze UI/state, generation-aware deliveries, timezone handling, and source
revalidation at wake-up. Keep push and in-app state independently understandable.

Acceptance: one snoozed item reappears once in the inbox; two concurrent snoozes
cannot create duplicate cycles; snoozing never shifts source dates or creates a
new task/event.

### Phase 5 — Deployment and recovery rehearsal

Rehearse additive migration against an isolated copy with real-shaped existing
jobs/subscriptions. Compare pre-existing row identities and data, run the full
notification/calendar/work regression suites, verify backup/restore, and document
worker rollout/rollback limitations. Test a real installed phone PWA separately
after deployment; mocked browser tests do not prove actual phone delivery.

## 11. Verification checklist

Extend `tests/notifications.test.mjs`, `notifications.integration.mjs`, and
`notifications.browser.mjs`, with dedicated inbox tests where clearer. Use the
existing disposable `work-db` and port-3002 app. Mock sends and permissions;
never use production subscriptions or actual push delivery in automated tests.

Required cases:

- One source/two devices, repeated passes, retries, duplicate jobs, and two workers.
- No device, disabled push, invalid push config, expired subscriptions, and a
  failed push with a still-usable inbox item.
- Anonymous/non-owner access, foreign IDs, cross-site writes, and unsafe redirects.
- Mark read/unread, dismiss/undo, mark-all-read while new reminders arrive, and
  simultaneous actions from two devices with revision conflicts.
- Every source lifecycle change in the table above, including older active items
  outside the generation window and reopening an already-notified task.
- Date-only/timed sources, DST transitions, timezone changes, lead-time changes,
  recurring occurrence IDs, and source-category disable/re-enable without backlog.
- Worker outages of minutes/days, bounded catch-up, activation cutoffs, terminal
  cleanup, and no regeneration of purged old reminders.
- Notification tap while signed out, sign-in return, old payload compatibility,
  missing sources, and safe fallback navigation.
- Snooze after the original target passes, restart during snooze, repeated user
  requests, source changes during snooze, and independent transport retries.
- Phone/desktop controls, keyboard access, visible read/unread indicators, count
  refresh on focus, and retention of the existing music-player lifetime.

The original planning task only inspected source and documentation. Implementation
and its executed checks are recorded in the maintenance document linked above.

## 12. Explicitly deferred

Do not add email/SMS delivery, AI prioritization, public sharing, collaboration,
financial reminders, Japanese practice alerts, an offline inbox cache, or live
WebSockets as part of this proposal. Birthday/holiday/project-target reminders
can be a separate extension of the source registry after the existing source
types work reliably.
