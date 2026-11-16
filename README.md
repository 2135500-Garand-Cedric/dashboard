This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Work-management redesign: [roadmap](docs/work-management/README.md),
[progress](docs/work-management/PROGRESS.md), and
[Work-management operations](docs/work-management/OPERATIONS.md). Development startup no
longer seeds example data automatically. Use the documented no-migration override
for preservation work, and run demo seeding only explicitly on isolated data.
The completed redesign's [maintenance handover](docs/work-management/HANDOVER.md)
and [isolated examples](docs/work-management/SYNTHETIC_EXAMPLES.md) include migration,
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

Uploaded receipt/pay-stub images and PDFs are stored outside PostgreSQL and are **not** in this database-only dump; the existing combined backup procedure in [Finance maintenance](docs/FINANCE_MAINTENANCE.md) includes those files. Keep your NAS `.env` separately as well. Copy a backup to another device when convenient so losing the NAS does not also lose every backup.

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

See [Finance maintenance](docs/FINANCE_MAINTENANCE.md) for storage, exports, backup/restore and operational limitations. Normal startup never seeds example data. Historical Prisma migrations must remain unchanged so existing databases can upgrade safely.

Checks:

- `node --test tests/*.test.mjs` and `npx tsc --noEmit`.
- `RUN_FINANCE_ACTIVITY_DB_TEST=1`, `RUN_FINANCE_FIXED_STATEMENT_DB_TEST=1`, `RUN_FINANCE_RECEIPT_DB_TEST=1` and `RUN_FINANCE_REPORT_DB_TEST=1` enable the corresponding `tests/finance-*.integration.mjs` suites. Run the activity/fixed-statement/document suites only with `WORK_MANAGEMENT_DISPOSABLE=1` and the isolated `work-db` database.
- `RUN_FINANCE_ACTIVITY_BROWSER_TEST=1 node tests/finance-activities.browser.mjs` uses the disposable app at `http://localhost:3002`; it creates fictional records there and tests income, expense, files, transfers and imports on desktop/phone.
- `RUN_AUTH_HTTP_TEST=1 node tests/auth-security.integration.mjs` inside the development container checks protected APIs, owner reads and anonymous page access without creating finance records.

## Work/calendar cleanup

Tasks and projects use calendar activity types; the separate contexts manager and `WorkContext` table have been retired. `/todos/manage` manages contacts. The cleanup migration archives context definitions and old company/course/tags/waiting-contact/reward values into existing `WorkActivity` history before dropping their live columns. It preserves task/project IDs, dependencies, checklists, notes, attachments, event links, timestamps and user XP/gold balances. Existing explicit activity-type choices take precedence over a retired context.

`Subtask` is a checklist item; child tasks remain `Todo` rows with `parentId`. `WorkKeyDate` still stores project milestones and historical task dates, so it is not an unused table. Event conversion history, note revisions and mutation receipts are likewise retained for correctness and recovery. Numeric priority and single-link fields still support checked compatibility commands; the canonical priority, dependency graph and calendar links remain authoritative.

`ActivityVocab.lastPracticed` is required for per-activity review scheduling. The corrective `20261118122000_restore_activity_review_timers` migration restores it and recovers exact timestamps from saved session word lists. Missing history stays unknown and eligible for review. Vocabulary-wide timestamps are never copied into a different activity's timer.

The full pre-cleanup development backup is under ignored `backups/module-cleanup/`. Production has not been changed. Deploy matching application code and migrations together; rolling back application code after dropped columns requires restoring the pre-cleanup database as well. The old phase-specific inventory comparisons describe those historical additive migrations, not the later retirement migration. `tests/module-cleanup-migration.integration.mjs` compares an untouched backup restore (`work_cleanup_baseline`) with its migrated copy (`work_cleanup_rehearsal`) on the disposable `work-db` host and verifies retained rows plus archived metadata.

## Owner-only authentication

Dashboard display settings and the current work/navigation flows are documented
in [Display and navigation](docs/DISPLAY_AND_NAVIGATION.md). The Settings page
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
