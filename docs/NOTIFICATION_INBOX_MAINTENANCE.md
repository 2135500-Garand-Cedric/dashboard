# Notification inbox maintenance

Implemented November 24, 2026. The inbox uses the existing PostgreSQL database,
owner-only app shell, and `notification-worker` container. No additional container,
network service, dependency, or upload volume is needed.

## Behavior

The bell and `/notifications` provide Active, Unread, Snoozed, and History views.
Opening the preview does not mark anything read. Open source marks that reminder
read with an authenticated command, then navigates to the current source. Read,
dismissal, and snooze never change source dates, task status, or recurrence.

Supported sources are events, eligible task work sessions, task deadlines, active
follow-ups, and opt-in project milestones. Holidays, birthdays, and project target
dates are not automatic reminder sources in this version.

The inbox runs even if push is disabled, unconfigured, or no device has permission.
The worker still needs to run. Source-type and timing settings apply to both
channels; **Phone/browser push notifications** controls only push. Per-event
reminder `-1` disables both channels. Lock-screen title privacy applies only to
push; the authenticated inbox shows source titles.

Each owner/source occurrence has one `UserNotification`. Title, activity-color,
and reminder-offset edits do not create a new occurrence. Date changes supersede
the old occurrence. Completed, cancelled, archived, removed, converted, or muted
sources retire their reminders. Reopening the same occurrence does not silently
revive a retired reminder. Source reconciliation is eventual, normally on the
next 30-second worker cycle; opening a source revalidates its identity immediately.

Inbox catch-up is limited to seven days and deployment/category activation
boundaries. First activation starts prospectively. Push retains its separate
15-minute grace period and device/push activation boundaries, so neither new
devices nor downtime recovery produces a historical phone-alert backlog.

Snoozing supports one hour, tomorrow at 9 a.m. in the dashboard timezone, or a
chosen local time within 30 days. Clock gaps are rejected; repeated clock times
require an earlier/later choice. Snoozing preserves the logical reminder, increments
its delivery generation, and cancels older pending jobs. At wake-up the worker
revalidates the original source, clears read state, and creates a separate delivery
cycle. This works outside the ordinary source-generation window.

A SENT delivery means **accepted by the push service**, not displayed or read.
An external provider may accept a push just before a source/dismissal edit or a
worker crash. Leases, stable tags, generations, and retry limits reduce duplicates;
they cannot promise exactly-once phone display or retract accepted pushes.

## Code map

| Location                                              | Responsibility                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/notifications/sources.mjs`                   | Windowed source selection and owner-scoped identity resolution without a date window.                                              |
| `rules.mjs`                                           | Preferences, push validation, occurrence keys, timezone conversion, payload privacy.                                               |
| `inbox.mjs`                                           | Logical reminder insertion, eligibility, lifecycle, wake-up, retention and snooze validation.                                      |
| `engine.mjs`                                          | Worker heartbeat, inbox stages, independent device queue, final validation, leases/retries and delivery.                           |
| `inbox-api.mjs`                                       | Bounded keyset pagination, counts, source details, revision checks and replay receipts.                                            |
| `inbox-server.ts`                                     | HTTP validation and safe errors. Every route calls `requireOwner` before delegating.                                               |
| `src/app/api/notifications/inbox`                     | List/count/detail, read/unread/dismiss/undo, read-all and snooze endpoints.                                                        |
| `src/components/notifications/InboxProvider.tsx`      | One visible-tab count poll every 30 seconds; focus and action refresh, stale-read cancellation.                                    |
| `NotificationInbox.tsx`                               | Bell preview, responsive inbox, actions, delivery diagnostics and snooze dialog.                                                   |
| `NotificationSourceOpen.tsx`                          | Authenticated push-open read command and safe navigation/fallback.                                                                 |
| `src/app/notifications/(inbox)`                       | Protected inbox pages; deliberately does not wrap `/notifications/open`.                                                           |
| `public/sw.js`, `src/app/notifications/open/page.tsx` | Same-origin allowlisted links, old source payload compatibility, and destination preservation through sign-in. No private caching. |

The worker imports only packaged `.mjs` services. Source polymorphism is limited
to EVENT, DEADLINE, FOLLOW_UP and MILESTONE, with ownership checks in every resolver.
Delivery responses expose device labels and statuses, never subscription endpoints,
encryption keys, VAPID secrets, or raw provider errors.

Atomic `createMany(skipDuplicates)` inserts implement logical/device deduplication.
Do not replace them with an empty-update Prisma upsert: that can use a read/create
sequence and fail under competing worker connections. Commands reuse
`WorkMutationReceipt` replay protection, owner-scoped advisory locks, and revision
compare-and-update. Mark-all-read uses the server-issued page cutoff and excludes
reminders created or updated after that cutoff.

## Schema and retention

Migration: `20261124090000_notification_inbox`.

- Adds `UserNotification` and the User relation; no source IDs are changed.
- Adds prospective `inboxStartedAt` and per-category reactivation timestamps.
- Adds nullable `PushDelivery.notificationId`, with SET NULL deletion behavior.
- Preserves every old delivery with generation zero, and changes delivery
  uniqueness to `(subscriptionId, occurrenceKey, generation)`.
- Adds database triggers enforcing matching notification/subscription ownership
  and preventing reassignment of either owner.
- Legacy null-FK queued jobs remain processable. They attach only if an eligible
  canonical inbox row exists; historical SENT deliveries are not backfilled unread.

Active reminders expire after 180 days from creation. Resolved, superseded,
expired, or dismissed reminders are removed 90 days after retirement/dismissal.
Delivery history has its independent 90-day retention. Cleanup also runs without
push. Deleting an inbox item never deletes tasks, events, projects, or deliveries.
Seven-day catch-up prevents old purged reminders from being regenerated.

Whole-database backups include these records automatically. The existing backup
procedure must still preserve the environment/VAPID configuration separately and
include uploaded documents for the rest of the dashboard. Restore rehearsal must
use isolated PostgreSQL and force push off; never start a restored worker with
production push credentials or subscriptions.

## Coordinated production rollout

No production deployment was performed for this change.

1. Take the normal whole-database and document backup.
2. Stop the existing `notification-worker` before applying the new migration.
3. Pull/build the new release, then start/update `dashboard`. Its existing Compose
   command runs `prisma migrate deploy` before Next.js starts.
4. Start/update `notification-worker` from that same release after the app is healthy.
5. Check the inbox, settings heartbeat, and worker logs. Test an installed phone
   PWA with one newly due reminder after deployment.

For example, after preparing the image/environment and taking the backup:

```bash
docker compose -f docker-compose.prod.yml stop notification-worker
docker compose -f docker-compose.prod.yml pull dashboard notification-worker
docker compose -f docker-compose.prod.yml up -d dashboard
docker compose -f docker-compose.prod.yml up -d notification-worker
```

Keep the new app and worker versions coordinated: an old worker cannot use the
new generation-aware unique constraint. Do not roll an old worker back against
this schema. Stop delivery first, keep a compatible worker, or plan an explicit
backup restore/data-preserving rollback. Never reset migrations or truncate the
queue to resolve a deployment issue.

## Verification performed

- The 202-test unit/notification run passed, followed by an additional passing
  same-time occurrence/display-edit preservation test. Coverage includes independent
  concurrent workers, concurrent snooze commands, per-device generations,
  retry/rescheduling, owner guards, source lifecycle, cutoffs, catch-up, retention,
  legacy null-FK jobs, and source data preservation.
- Desktop/phone inbox browser checks passed, including preview, read/unread,
  dismissal undo, action failure/retry, snooze, source opening, visible layout,
  expired-session callback, and anonymous/non-owner/cross-site API rejection.
- Production Docker image build and TypeScript validation passed during
  implementation; the final image was rebuilt after the concurrency correction. Its packaged
  worker completed a real pass against the disposable database with zero pushes.
- Changed application files passed ESLint without warnings/errors.
- The migration was applied to an isolated restored development database with
  fake PENDING/SENT/FAILED legacy jobs. Counts and content checksums matched for
  all 65 pre-existing application tables, excluding only the newly added fields.
- Whole-database/document backup restore verified **67 tables and 15 work originals**
  in isolation, including a populated inbox fixture. No restored worker sent push.
- Development migration applied successfully; owner inbox/count/page returned
  HTTP 200, the worker heartbeat was healthy, push was disabled, and activation
  produced zero historical inbox rows.

The broader regression run also exposed existing issues outside the inbox:

- `tests/recurrence.integration.mjs:53` expects at least seven generated copies,
  while the current recurrence generator creates four.
- Its future-copy assertion around line 278 returned three instead of four after
  completing an occurrence. This repeated in a serial run.
- `tests/work-calendar.integration.mjs` uses a test dependency loader missing
  `@/lib/birthday-server`; that test cannot currently reach its calendar assertions.
- Running legacy calendar/recurrence tests together also caused a global event-count
  assertion to fail; that count passed in the serial recurrence run.
- Schema comparison reports four existing FK `onUpdate` differences for
  CalendarBirthday, CalendarHoliday, RecurrenceSeries and RecurrenceSkip. The inbox
  models introduce no additional schema differences. No FK repair was applied.

These results must not be described as a clean pass of every historical integration
suite. Real installed iPhone/APNs delivery, OS background behavior, and a real
expired GitHub session round trip still require deployment/device acceptance;
automated tests use fake senders, mocked browser permissions, and test JWTs.

## Running checks

Use the disposable `docker-compose.work-test.yml` setup and port-3002 app, never
production. Enable `WORK_MANAGEMENT_DISPOSABLE=1` and the appropriate test flags.

```bash
node --test tests/*.test.mjs
RUN_NOTIFICATION_DB_TEST=1 node --test --test-concurrency=1 \
  tests/notifications.integration.mjs tests/notification-inbox.integration.mjs
RUN_NOTIFICATION_BROWSER_TEST=1 node --test \
  tests/notifications.browser.mjs tests/notification-inbox.browser.mjs
```

The integration guard requires a database host named `work-db`. Browser checks
require Playwright and the disposable app's documented test-only authentication
secret. Do not enable or send actual push from automated tests.

## Development preview data

Six labeled examples cover three unread reminders, a read work-session reminder,
a snoozed reminder, and a completed reminder in History. Their fictional tasks
and events belong to the example notification project where applicable.

```bash
docker compose -f docker-compose.dev.yml exec -T \
  -e ALLOW_NOTIFICATION_EXAMPLES=1 dashboard node scripts/seed-notification-examples.mjs
```

The seed requires development mode and push disabled. It runs transactionally,
never sends push, and does not duplicate or reset examples when rerun.
