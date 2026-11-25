This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Documentation: [implemented functionality and future plans](docs/README.md).

Production deployment: [Synology deployment guide](docs/implemented/deployment.md). GitHub
Actions builds and publishes the AMD64 image to GHCR on pushes to `main`; the NAS
pulls it using `DASHBOARD_IMAGE`. Deployment remains manual, with no NAS builds.

Work-management redesign: [roadmap](docs/implemented/work-management/README.md),
[progress](docs/implemented/work-management/PROGRESS.md), and
[Work-management operations](docs/implemented/work-management/OPERATIONS.md). Development startup no
longer seeds example data automatically. Use the documented no-migration override
for preservation work, and run demo seeding only explicitly on isolated data.
The completed redesign's [maintenance handover](docs/implemented/work-management/HANDOVER.md)
and [isolated examples](docs/implemented/work-management/SYNTHETIC_EXAMPLES.md) include migration,
backup, compatibility and verification procedures.

## Backfill conditional verb forms

After deploying an image containing the conditional conjugations and backfill script, preview missing forms in production:

```bash
docker compose -f docker-compose.prod.yml exec -T dashboard npm run backfill:verb-conditionals -- --dry-run
```

Add the missing forms and practice records:

```bash
docker compose -f docker-compose.prod.yml exec -T dashboard npm run backfill:verb-conditionals -- --apply
```

Run the dry run again to verify that no forms or practice records are missing. The command preserves existing conjugations and practice statuses and can be rerun safely. New practice records start at `WEAK`. Verbs without a supported verb type or valid spelling/reading are listed as skipped; correct those entries and rerun. Exit code 2 means some verbs were skipped; exit code 1 means the command failed. Each verb is saved in its own transaction, so rerunning also completes a partially finished backfill.

The command defaults to a dry run. For development, replace `docker-compose.prod.yml` with `docker-compose.dev.yml`.

## Getting Started

For Docker development, run `docker compose -f docker-compose.dev.yml up -d --build`.
The app and worker check their retained `node_modules` volumes against the current
package files on startup and run `npm ci` when dependencies have changed. This
prevents an older dependency volume from hiding packages installed in a rebuilt
image. Database and uploaded-file volumes are retained.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Honorific verb ending

When adding or editing vocabulary in the **Verb** category, select **Honorific irregular (いらっしゃる → いらっしゃいます)** for いらっしゃる, おっしゃる, なさる, くださる/下さる and ござる. Add the honorific word as its own dictionary entry, independently of the ordinary verb. All 13 supported forms and their practice records are generated, including polite negatives/past, て, た, potential, volitional, たい, ば and なければ. Kanji spelling and kana readings are retained separately.

Only the four ます-family endings use the special い stem; other forms follow regular godan conjugation (for example いらっしゃって, いらっしゃれば and いらっしゃりたい). Other honorific verbs such as 召し上がる use the existing U-verb type. No database migration or new form-type seed is required because the verb ending is stored as text and the existing form types are reused. Changing an existing verb's type regenerates its forms and initializes their practice statuses to WEAK, following the existing edit behavior.

Verification: `node --test tests/conjugation.test.mjs tests/backfill-verb-conditionals.test.mjs`. Development database/API checks: `RUN_HONORIFIC_VERB_DB_TEST=1 node --test tests/honorific-verbs.integration.mjs` inside the development container; test records roll back. Covers independent ordinary/honorific entries, add/edit, all 13 generated forms, exercise links and invalid-ending rollback.

## Kanji writing selection and percentages

With no category selected, Kanji writing uses vocabulary from any category. A word must contain at least one known kanji and every remaining character must be another known kanji, hiragana, or katakana (including the long-vowel mark). Known kanji are the individual kanji characters found in the user's Kanji-category vocabulary. Explicit category and starred selections narrow that same eligible pool. Only dictionary forms are included; conjugated forms never enter Kanji writing. Answers show an animation for each kanji separately, with kana alongside it.

Each applicable exercise contributes PERFECT = 1, GOOD = 0.5, or WEAK = 0. Missing exercise records count as WEAK. A vocabulary item's percentage is its total score divided by the number of applicable exercises, multiplied by 100. Eligible base words include Kanji writing (five exercises with the current setup); other base words and all conjugated verb forms exclude it (four exercises). The vocabulary list's verb percentage averages the dictionary-form percentage and every saved conjugated-form percentage equally. The word detail page shows the dictionary-form percentage and each conjugated form separately. Exercise progress averages the eligible entries for that exercise; overall progress averages all applicable word/form/exercise scores. Existing writing statuses on conjugated forms are ignored.

Starting Kanji writing creates any missing writing records at WEAK while preserving existing progress. The development seed includes known characters plus more than ten compound/mixed-kana examples across Vocabulary and Verb categories. Select Kanji writing, leave categories unchecked, and choose ten words to try them.

## Japanese Statistics

The sidebar's Japanese Statistics page has a Month view for the last 30 Toronto calendar days and a Year view for the latest 12 calendar months, including the current month. Year bars sum each month's counts. The average graph uses the closing value on the last day of each completed month, carrying forward the latest recorded snapshot; the current month uses its latest available value. Practice charts count attempts (including repeated words), split into PERFECT, GOOD, and WEAK. Added-word bars count surviving dictionary entries by their addition date and use their current worst status for colors. The category chart counts each dictionary entry once.

Daily average history uses the same calculation as the Vocabulary List's Average. Snapshots update after practice sessions, vocabulary additions/edits/deletions, category renames, and statistics-page visits. The last recorded value carries forward on days without changes; dates before the first snapshot stay blank because earlier averages cannot be reconstructed from current statuses. The new JapaneseProgressSnapshot migration runs through the existing deployment migration command.

Dashboard daily totals and statistics buckets use America/Toronto, including daylight saving transitions, independently of the server timezone.

Development statistics vocabulary uses 56 distinct noun entries checked against [JLPT Sensei's N5 list](https://jlptsensei.com/jlpt-n5-nouns-vocabulary-list/) and [N4 list](https://jlptsensei.com/jlpt-n4-nouns-vocabulary-list/). Readings, meanings, study levels, and source URLs are stored in `prisma/statistics-vocabulary.json`. The seed matches Japanese spelling plus reading, preserves existing progress, and removes the old dated statistics-demo clones. Practice totals and past average snapshots remain illustrative development data.

## Multiple Kanji readings

Kanji-category vocabulary supports one or more readings on both add and edit pages. Add/remove reading fields as needed; empty readings are rejected and duplicates are removed. The first reading remains the primary `hiragana` value for compatibility and uniqueness; `Vocabulary.readings` stores the full list. The additive `20261108120000_add_kanji_readings` migration copies existing primary readings into the list and runs through the normal `prisma migrate deploy` deployment command.

Vocabulary display/search and all practice answer displays include every saved reading. Typed Japanese answers accept any saved reading or the Japanese spelling (ignoring surrounding whitespace and normalizing Unicode). Practice snapshots retain the readings from that session; older snapshots fall back to their primary reading. Every exercise shows the vocabulary category under its prompt, including listening without revealing the answer.

History summaries show total recorded practice time and the sum of each session's signed average change in percentage points for the selected activity group/day. Monthly history also shows these totals for each day. This excludes unrelated list changes between sessions. Missing legacy timing/averages are marked as unrecorded or partial rather than assumed zero. Development statistics examples include 100 days of detailed sessions with real word snapshots, alternate Kanji readings, durations, before/after averages, and category filters. Their average changes are illustrative; seeding preserves live practice ratings and does not duplicate sample sessions.

Checks: `node --test tests/kanji-readings.test.mjs tests/practice-sessions.test.mjs`; development database checks: `RUN_KANJI_READINGS_DB_TEST=1 node tests/kanji-readings.integration.mjs` (fixtures and seed changes roll back). Optional Playwright checks: `RUN_KANJI_READINGS_BROWSER_TEST=1 node tests/kanji-readings.browser.mjs`; form/practice writes are mocked, with desktop and phone coverage.

## Practice reviews and history

Rating the final word opens a practice overview. **Okay** commits the ratings, practice session, and progress snapshot in one transaction. The overview includes the activity, status groups with word spellings/readings, total words, selected categories (or no category filter), starred filter, and elapsed time from pressing Start Practice to rating the final word. Reading the overview and time spent reviewing it do not extend that duration. Failed saves retain the overview for retry; a unique session key prevents duplicate sessions if the response is lost.

The average uses the same full vocabulary-list calculation described above, including verb-form averages and Kanji writing eligibility. The review previews the effect without changing saved ratings. On Okay, before/after averages are computed against the current database state inside the save transaction and stored permanently. Average change is shown in percentage points: for example, 40% to 42% is +2 percentage points.

Click a Vocabulary practice or Kanji writing practice bar in Japanese Statistics to browse its sessions. Month view opens the selected Toronto calendar day; Year view opens the selected month, grouped by day. Accessible date links are available under each practice chart. Selecting a session opens the same overview using saved word/category/activity snapshots, so later edits or vocabulary deletion do not rewrite its history. Opening old results does not save them again.

The `20261105150000_add_practice_session_details` migration adds these details to Practice while preserving older records. Older practices display their existing totals with missing details marked as not recorded; their original words, durations, and average changes cannot be recovered. Apply the migration through the normal production deployment (`prisma migrate deploy`); production Compose already runs it on startup. Unit coverage: `node --test tests/practice-sessions.test.mjs`. Database coverage: `RUN_PRACTICE_SESSION_DB_TEST=1 node tests/practice-sessions.integration.mjs` inside the development container; fixtures are rolled back.

Optional browser layout coverage: `RUN_PRACTICE_BROWSER_TEST=1 node tests/practice-overview.browser.mjs` with the development app running and Playwright/Chromium available. `NODE_PATH` can point to a separate temporary Playwright installation. It checks independent status-list scrolling on desktop, whole-page scrolling with stacked Weak/Good/Perfect sections below 1024px, and access to all seven Good words using browser-only fixtures; it does not change database records.

## Whole database backup on the NAS

From your NAS repository directory, run:

```sh
sudo sh scripts/backup-database.sh /volume1/backups/dashboard
```

This creates a dated `dashboard-*.dump` file containing **every database table and its data**: Japanese vocabulary/practice/history, finance, calendar, todos, users and Prisma migration history. It requires Docker Compose, not Node.js installed on the NAS. The app stays running. Each run creates a new backup, checks that PostgreSQL can read the archive, and removes incomplete files if the command fails. Existing backups are kept; the command does not restore or change database records. Archive validation is not a full restore rehearsal.

The directory is created if needed. Choose a path on your NAS; `/volume1/backups/dashboard` is an example. For a development backup, add `docker-compose.dev.yml` as the second argument. The command uses the Compose `dashboard-db` service and its configured database credentials.

Uploaded receipt/pay-stub images and PDFs are stored outside PostgreSQL and are **not** in this database-only dump; the existing combined backup procedure in [Finance maintenance](docs/implemented/FINANCE_MAINTENANCE.md) includes those files. Keep your NAS `.env` separately as well. Copy a backup to another device when convenient so losing the NAS does not also lose every backup.

## Personal finance

Finance has **Overview**, **Income**, **Expenses**, **Transfers**, **Imports**, and **Settings**. Income and expense forms save their account movement and optional supporting details together. Credit card bill payments and movements between owned accounts use Transfers. Imports match statement rows to existing activities; they do not create extra income or expenses.

Current routes:

- `/finance`: financial overview.
- `/finance/income`, `/finance/income/new`, `/finance/income/deposits/[transactionId]`.
- `/finance/expenses`, `/finance/expenses/new`, `/finance/expenses/[transactionId]` and `/finance/expenses/refunds/new`.
- `/finance/transfers`, `/finance/transfers/new`, `/finance/transfers/[transactionId]`.
- `/finance/imports`, `/finance/imports/new`, `/finance/imports/[importId]`.
- `/finance/settings`: accounts, expense categories, income sources and deduction types.

The old standalone receipt, reconciliation and transaction-history screens and redirect aliases were removed. `/finance/transactions/[id]` remains an actual detail screen for adjustment-type ledger records; it is not a redirect. Supporting-record IDs differ from ledger IDs. Expense document endpoints use `/api/finance/expenses/[receiptId]/document`; pay stubs use `/api/finance/income/[incomeRecordId]/document`. Never substitute one kind of ID for another.

`FinancialTransaction` remains the internal monetary ledger. `FinancialReceipt` holds expense breakdowns and optional files; `FinancialIncomeRecord` holds income/payroll details. These are related parts of an activity, not additional money. Match/allocation tables retain statement associations, split-payment details, confirmed duplicate exclusions and decision history. Removing the old reconciliation screen does not make these tables disposable. Reports exclude owned-account transfers and count refunds against spending. Monetary values are decimal strings with explicit currencies.

Statement imports select an account and date range, and accept `date,ref #,description,amount` CSV columns. Rows match same-account, same-currency income, expenses/refunds or transfers. Statements may be partially matched and saved. Matched income and expenses permit notes edits only. Original files are private, validated and owner-authenticated; CSV exports include metadata, not file bytes.

See [Finance maintenance](docs/implemented/FINANCE_MAINTENANCE.md) for storage, exports, backup/restore and operational limitations. Normal startup never seeds example data. Historical Prisma migrations must remain unchanged so existing databases can upgrade safely.

Checks:

- `node --test tests/*.test.mjs` and `npx tsc --noEmit`.
- `RUN_FINANCE_ACTIVITY_DB_TEST=1`, `RUN_FINANCE_FIXED_STATEMENT_DB_TEST=1`, `RUN_FINANCE_RECEIPT_DB_TEST=1` and `RUN_FINANCE_REPORT_DB_TEST=1` enable the corresponding `tests/finance-*.integration.mjs` suites. Run the activity/fixed-statement/document suites only with `WORK_MANAGEMENT_DISPOSABLE=1` and the isolated `work-db` database.
- `RUN_FINANCE_ACTIVITY_BROWSER_TEST=1 node tests/finance-activities.browser.mjs` uses the disposable app at `http://localhost:3002`; it creates fictional records there and tests income, expense, files, transfers and imports on desktop/phone.
- `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs` inside the development container checks protected APIs, owner reads and anonymous page access without creating finance records.

## Dashboard settings

The Settings sidebar opens a tile menu with separate pages for
[timezone](src/app/settings/timezone/page.tsx),
[calendar holidays](src/app/settings/holidays/page.tsx), and
[notifications](src/app/settings/notifications/page.tsx),
[birthdays](src/app/settings/birthdays/page.tsx), plus a link to Finance settings.
Choose each holiday individually from its country's catalogue; regional variants
are labeled in the holiday selector. Your selected tiles show the next date and
chosen type (Holiday, Bank holiday, or Important date). Each selection's display
name/type can be edited without changing the library's moving-date rule.
Holiday creation uses a modal; holiday and birthday settings lists sort by the next
date. Annual dates open read-only information pages from Calendar, where tasks can
be linked or created for that specific occurrence. See [Recurring work and dates](docs/implemented/RECURRING_WORK.md).
Existing whole-region holiday settings convert once
into individual choices when first opened after migration.

## Recurring work and holidays

See [Recurring work](docs/implemented/RECURRING_WORK.md) for repeating tasks/events,
project-based routines such as payroll, regional holiday settings, and maintenance.
The existing notification worker also generates upcoming occurrences even when
push delivery is disabled; no extra container is required.

## Work/calendar cleanup

Tasks and projects use calendar activity types; the separate contexts manager and `WorkContext` table have been retired. `/todos/manage` manages contacts. The cleanup migration archives context definitions and old company/course/tags/waiting-contact/reward values into existing `WorkActivity` history before dropping their live columns. It preserves task/project IDs, dependencies, checklists, notes, attachments, event links, timestamps and user XP/gold balances. Existing explicit activity-type choices take precedence over a retired context.

`Subtask` is a checklist item; child tasks remain `Todo` rows with `parentId`. `WorkKeyDate` still stores project milestones and historical task dates, so it is not an unused table. Event conversion history, note revisions and mutation receipts are likewise retained for correctness and recovery. Numeric priority and single-link fields still support checked compatibility commands; the canonical priority, dependency graph and calendar links remain authoritative.

`ActivityVocab.lastPracticed` is required for per-activity review scheduling. The corrective `20261118122000_restore_activity_review_timers` migration restores it and recovers exact timestamps from saved session word lists. Missing history stays unknown and eligible for review. Vocabulary-wide timestamps are never copied into a different activity's timer.

The full pre-cleanup development backup is under ignored `backups/module-cleanup/`. Production has not been changed. Deploy matching application code and migrations together; rolling back application code after dropped columns requires restoring the pre-cleanup database as well. The old phase-specific inventory comparisons describe those historical additive migrations, not the later retirement migration. `tests/module-cleanup-migration.integration.mjs` compares an untouched backup restore (`work_cleanup_baseline`) with its migrated copy (`work_cleanup_rehearsal`) on the disposable `work-db` host and verifies retained rows plus archived metadata.

## Owner-only authentication

Dashboard display settings and the current work/navigation flows are documented
in [Display and navigation](docs/implemented/DISPLAY_AND_NAVIGATION.md). The Settings page
stores a display timezone for all modules; existing timed records remain UTC
instants and date-only records keep their calendar dates.

The app is restricted to the permanent GitHub account ID `89470930` (`2135500-Garand-Cedric`). The allowlist is in `src/lib/owner-policy.ts`; matching an email address or username does not grant access. Other GitHub accounts are redirected to `/access-denied` and do not receive an authorized app session.

Each private page branch uses `ProtectedLayout`, and all data API handlers call `requireOwner` before reading input, querying the database, or using external services. Anonymous API calls return 401; authenticated non-owners return 403. Mutation requests from other origins are rejected. The owner continues to use the existing database records under user ID 1; this is deliberately a single-owner app, not a multi-user application.

Deploy the updated image to apply these protections in production. Existing sessions need a fresh GitHub sign-in because older tokens lack the owner authorization claims. Keep `NEXTAUTH_SECRET` private and set `NEXTAUTH_URL` to the canonical HTTPS production URL.

Authentication coverage: `node --test tests/auth-security.test.mjs`. Live checks run in the development container with `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs`; they use short-lived locally signed test cookies, never print credentials, and perform no data mutations.

The simplified finance UI no longer exposes general **Matches & corrections** controls. Historical allocations and audit records remain preserved internally. Statement corrections use the row's matching selector and Save matches; they unlink the old association and confirm the replacement atomically without changing monetary records. `FinancialImport.status = COMPLETED` now means **saved** for matching-only statements, rather than that every row is matched. `completedAt` is the first-save time. A saved statement stays saved if its matches are later removed; remaining counts express its actual matching coverage. Historical general-format imports retain their prior read-only completion behavior.

## Japanese practice review timers

Each `ActivityVocab` (including each conjugated verb form/activity pair) stores its own UTC `lastPracticed`. After 14 elapsed days, it joins the randomized Weak-priority pool when selecting words. Its saved GOOD/PERFECT status, yellow/green border and percentage contribution remain unchanged. Existing category/starred/kanji-writing eligibility filters still apply.

Saving a completed practice with Okay updates only its rated activity-word records, using the session completion time. Previewing or selecting words does not change timestamps. Retries do not restart timers; an older completion cannot overwrite a newer timestamp. Unknown timestamps are considered due until first saved practice. Historical recovery uses exact word/form IDs, activity and owner from detailed saved sessions; aggregate daily counts cannot reconstruct individual practice times.

Timer verification: the 39-file unit suite, targeted ESLint, strict TypeScript and production build passed. Two rollback-only timer/history database checks and four existing Japanese practice/kanji/reading/reward checks passed. The development migration recovered 238 exact activity-word timestamps; a live owner-authenticated selection request returned ten words with timers without saving a session.

## Phone installation and calendar notifications

The dashboard is an installable PWA. Its manifest, icons and push-only service worker are public; notification registration, preferences and test APIs require the existing GitHub owner login. The worker never caches private pages, APIs or uploads for offline use. Notification clicks open the original event, task or project. `/notifications/open` preserves that destination through sign-in when a phone session expires.

All application services can run on your NAS:

| Compose service | Role |
| --- | --- |
| `dashboard` | Website, GitHub authentication and notification settings/APIs |
| `dashboard-db` | Calendar data, registered devices and durable delivery state |
| `notification-worker` | Checks reminders every 30 seconds and sends Web Push |

Both Compose files include the worker. In production, it pulls the same GHCR image as the app; development builds locally. It needs no exposed port or upload volume, waits for the app healthcheck (after migrations), and restarts automatically. No Redis, Firebase account, separate notification SaaS or Apple Developer membership is required. Delivery still travels through the browser vendor's push service—Apple's service for iPhones—so outbound HTTPS is required. The phone must be able to reach your dashboard URL to open reminders.

### One-time server setup

1. Set the existing `NEXTAUTH_URL` to your dashboard's public **HTTPS** URL. Configure the GitHub OAuth application's callback for that domain (`https://your-domain/api/auth/callback/github`) as with normal dashboard deployment.
2. Follow the [deployment guide](docs/implemented/deployment.md) to publish the image, authenticate the NAS to GHCR and set `DASHBOARD_IMAGE` in its `.env`. Pull the image without deploying it yet:

   ```sh
   docker compose -f docker-compose.prod.yml pull dashboard notification-worker
   ```

3. Generate your Web Push keys once:

   ```sh
   docker compose -f docker-compose.prod.yml run --rm --no-deps dashboard npm run notifications:keys
   ```

   This prints a public/private key pair. Put it in the NAS `.env`, together with:

   ```dotenv
   PUSH_ENABLED=true
   PUSH_VAPID_PUBLIC_KEY=the-generated-public-key
   PUSH_VAPID_PRIVATE_KEY=the-generated-private-key
   PUSH_VAPID_SUBJECT=mailto:your-real-email@example.com
   ```

   The app and worker read the same `.env`. Keep the private key secret and preserve both keys across rebuilds/backups. The public key is safe for the browser. `npm run notifications:keys` also works in a local checkout with dependencies installed. These keys are separate from GitHub and NextAuth credentials.
4. After reviewing backups and migration status as described in the deployment guide, deploy:

   ```sh
   docker compose -f docker-compose.prod.yml up -d --no-build dashboard notification-worker
   ```

   App startup applies migrations before starting Next.js; the worker starts once the app is healthy. This feature adds an optional `Event.reminderMinutes` and the `NotificationSettings`, `PushSubscription`, and `PushDelivery` tables. Existing events inherit the notification defaults; no subscription or actual push message is created by migration. Without valid push configuration, push delivery is disabled and Settings shows setup instructions; recurring task/event generation still runs.

For development, the same services are in `docker-compose.dev.yml`, but both the app and worker force push off unless `DEV_PUSH_ENABLED=true` is explicitly set. This prevents a restored production database from sending real reminders during ordinary development. Desktop browsers can test on `http://localhost:3000`; an iPhone opening a LAN HTTP address cannot use push. Use a real HTTPS development address for physical-phone tests. Keep the same keys in the app and worker; recreate their containers after changing `.env`.

### Enable your iPhone

Use iOS 16.4 or newer. In Safari, open the deployed dashboard and choose **Share → Add to Home Screen**. Open that icon, sign in with your GitHub owner account, then go to **Settings → Phone & notifications**. Name the device, tap **Enable on this device**, allow the system permission, and use **Send test notification**. Permission is requested only by that button. Each phone/browser has its own registration; the device list lets you disable old devices. You may need to re-enable notifications after reinstalling the PWA, clearing website data, or changing push keys.

### Reminder behavior and operation

- Timed events/work sessions/deadlines/follow-ups default to 15 minutes before; date-only items default to 09:00 in the saved dashboard timezone. Project milestones are opt-in. Configure these in Settings. For all-day events, the settings time is the reminder reference time; an explicit event offset is subtracted from that reference.
- Event creation/editing offers **Reminder**: inherit settings, disable, at the scheduled time, or a chosen offset. Source-type preferences apply to the inbox and push; the master switch controls push only. Task deadlines/follow-ups remain task data; reminders do not create extra calendar events.
- The worker derives schedules from current records. Completed/deleted events, resolved follow-ups, closed/archived tasks, completed milestones and superseded deadline placeholders are excluded. Work sessions targeting closed/archived tasks are excluded. Recheck happens just before sending; edits invalidate queued old occurrences.
- Each device/source occurrence and reminder generation has one durable delivery record. Transient failures retry with backoff; expired subscriptions are disabled. Multiple workers claim jobs with leases. After downtime, push only sends reminders up to 15 minutes late; the in-app inbox catches up up to seven days after its activation boundary; newly enabled devices do not get an old backlog. Delivery attempts are retained for 90 days.
- A push service acceptance is not proof the phone displayed the notification. Network outages, Focus/notification settings and device behavior can delay or suppress alerts. If a process stops after provider acceptance but before recording success, a retry can occur; the stable notification tag coalesces that occurrence on the device. This is not an exact-time alarm service.
- Settings shows worker heartbeat/configuration status, allows pausing phone/browser push while the inbox remains active, hiding titles on the lock screen, disabling devices and sending a rate-limited test. Test sends do not require the worker; scheduled reminders do. Inspect its logs with `docker compose -f docker-compose.prod.yml logs --tail=50 notification-worker`. Logs omit endpoints, keys, titles and payloads.
- The existing whole-database backup includes notification state. Keep `.env`/VAPID keys separately. No new persistent volume is needed.

Verification: `node --test tests/*.test.mjs`; disposable worker/registration checks with `RUN_NOTIFICATION_DB_TEST=1 WORK_MANAGEMENT_DISPOSABLE=1 node --test tests/notifications.integration.mjs` on the isolated `work-db`; desktop/phone layout and permission-flow checks with `RUN_NOTIFICATION_BROWSER_TEST=1 node tests/notifications.browser.mjs` against the disposable port-3002 app. The browser test mocks push permission and delivery; actual iPhone delivery must be checked on an installed HTTPS PWA. Reference: [Apple/WebKit Web Push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Original PWA implementation verification (before the inbox extension; see the maintenance notes below for current results and schema differences): production build and strict TypeScript passed; all 40 unit-test files passed; three rollback-only notification worker/API/rescheduling checks passed; 27 calendar/project regression checks passed; mocked phone/desktop notification setup, iPhone installation gating and safe sign-in redirects passed. Live authorization checks covered 152 protected API handlers. Both Compose files validate, Prisma reports no schema drift, and the worker starts/shuts down cleanly with push disabled. The runtime dependency audit reported zero known vulnerabilities at verification time. Real iPhone/APNs delivery remains a deployment/device acceptance step; no production deployment or real push send was performed during implementation.

## Knowledge

The sidebar Knowledge library organizes Markdown procedures, troubleshooting guides,
and reference articles in folders and subfolders, with revision history, tags, backlinks, private images/PDFs,
and links to existing tasks and projects. Creation also supports custom templates,
work selections, and inline image uploads before the first save. See [Knowledge maintenance](docs/implemented/KNOWLEDGE_MAINTENANCE.md)
for usage, backup requirements, limits, and tests. The original
[architecture plan](docs/implemented/KNOWLEDGE_BASE_PLAN.md) records the design.


### Persistent notification inbox

The navigation bell and [Notifications](/notifications) keep event, work-session,
deadline, follow-up, and opt-in milestone reminders even without phone push.
Read/unread, dismissal with Undo, and timezone-aware snoozing sync through the
database. Snoozing does not change source dates. The existing notification worker
runs both inbox scheduling and optional push; no extra container or volume is needed.

See [Notification inbox maintenance](docs/implemented/NOTIFICATION_INBOX_MAINTENANCE.md) for
API/model structure, activation/catch-up rules, retention, tests, backup restore
verification, known older regression failures, and coordinated app/worker rollout.
Stop the old worker before the generation-aware migration; do not run an older
worker against the new queue constraint.


### Dashboard Quick add

The Quick add button beside **My Dashboard** starts a task, event, expense,
Knowledge article, or vocabulary entry. It appears only on the main dashboard.
Page-based Quick add flows return there after saving or approved cancellation;
module creation buttons keep their normal behavior. Event creation uses the
existing editor in a centered modal and refreshes the calendar tile.

See [Dashboard Quick add plan and implementation notes](docs/implemented/GLOBAL_QUICK_ADD_PLAN.md)
for the action list, guarded exits, validated return marker, and verification.


### Weekly report

**Weekly report** in the navigation opens a visual summary of completed weeks:
task totals, Japanese practice results, articles created/updated, and recorded
finances. It defaults to the last completed Monday–Sunday week; the current week
is unavailable. Dates use the saved dashboard timezone. The page uses CAD and all
data; financial totals reuse the overview's duplicate-counting rules.

The report reads existing records. The existing notification worker announces the
new completed week each Monday at the configured date-only reminder time (9 a.m.
by default), with an opt-out in notification settings. The weekly-notification
migration adds a preference and permits its source kind; no new container is needed.
See [Weekly report maintenance](docs/implemented/WEEKLY_REPORT_MAINTENANCE.md)
for coverage limits, source calculations, pagination, and verification.

Weekly reports can also be emailed as a one-page PDF through the shared Resend
outbox. See [email configuration and maintenance](docs/implemented/EMAIL_MAINTENANCE.md)
for `.env` variables, sender-domain verification, retries and future email templates.
Email is disabled by default and requires no extra container. Set the receiving
address and allow or disable sending in **Settings → Email**. The master switch
also stops retries; the recipient is no longer read from `.env`.
