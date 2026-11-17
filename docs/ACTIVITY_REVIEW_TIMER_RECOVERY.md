# Retained activity-review column recovery

Use this procedure only for the observed production state:

- `20261118121000_drop_unused_practice_timestamp` is recorded as completed.
- `20261118122000_restore_activity_review_timers` has an unfinished, non-rolled-back
  migration record.
- `ActivityVocab.lastPracticed` still exists as `timestamp without time zone`.
- The reported database contains 37,000 activity records, including 12,272 dates
  that must be preserved.

The history says the preceding column-drop migration completed, but the original
column remains. The restore migration expects to add that same column. Its empty
failure log does not establish the exact original failure or how the history and
schema became inconsistent. Do not drop the column to make the restore run.

`scripts/recover-activity-review-timers.sql` repairs the schema in place and
backfills exact saved practice history. Existing Prisma DateTime values are
interpreted as UTC, preserving the instants written by this application rather
than interpreting them in the database's local timezone. A newer exact session
can advance a timer; missing or older history never erases or moves one backward.
Unknown dates remain null. Activity IDs, statuses, words and session data remain
unchanged. No existing migration file or Prisma history is changed by this SQL.

## NAS procedure

First commit/push the recovery SQL and this guide, then update the NAS checkout.
No new application image is required for this SQL repair; the file is passed to
the existing PostgreSQL container from the host.

Run each stage separately and stop if a command fails:

```sh
cd /volume1/Subdomains/dashboard/
git pull --ff-only origin main
sudo docker compose -f docker-compose.prod.yml stop dashboard notification-worker
sudo sh scripts/backup-database.sh /volume1/backups/dashboard
```

Do not proceed unless the backup command succeeds. Keep the database running.
Take the usual uploaded-document backup too when preparing a full recovery copy;
this repair itself only touches the activity-review timestamp column.

Apply the transactional repair:

```sh
sudo docker compose -f docker-compose.prod.yml exec -T dashboard-db \
  sh -c 'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < scripts/recover-activity-review-timers.sql
```

For the reported data, the summary must show **37,000 records before and after**,
**12,272 dated records before**, and **at least 12,272 dated records after**. The
column must be `timestamp with time zone`, precision `3`, and the output must end
with `COMMIT`. If the data has changed since inspection, review the new counts
against the backup instead of assuming those exact numbers. The SQL checks row,
status and timestamp preservation before committing. Errors abort the transaction;
psql exits nonzero and the connection's uncommitted changes are rolled back.

Only after that repair successfully commits, reconcile the failed migration's
history with the manually completed schema/data work:

```sh
sudo docker compose -f docker-compose.prod.yml run --rm --no-deps dashboard \
  npx prisma migrate resolve --applied 20261118122000_restore_activity_review_timers
sudo docker compose -f docker-compose.prod.yml run --rm --no-deps dashboard \
  npx prisma migrate deploy
sudo docker compose -f docker-compose.prod.yml run --rm --no-deps dashboard \
  npx prisma migrate status
```

Stop on any error. `resolve --applied` only updates migration bookkeeping; it
does not run or validate SQL and must never be used in place of the repair.
`migrate deploy` then applies the pending Web Push migration. Confirm that status
reports the schema is up to date before restarting:

```sh
sudo docker compose -f docker-compose.prod.yml up -d --no-build dashboard notification-worker
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs --tail=100 dashboard notification-worker
```

This follows Prisma's [manually complete and resolve as applied](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing)
recovery approach, with a data-preserving substitution for creating a column that
already exists. Retain the original backup. Do not rerun the old drop migration,
reset the database, delete volumes, or edit historical migration SQL.

## Verification performed locally

The exact repair SQL was run against a temporary PostgreSQL 15 container with no
external network or persistent volume. Synthetic data reproduced 37,000 rows and
12,272 original timestamps. Checks verified preservation of all rows/statuses,
UTC conversion including fractional seconds, retention of newer existing dates,
exact activity/owner/base-word/verb-form matches, recovery of missing dates,
malformed session JSON handling, repeat execution before resolution, unchanged
migration history, rejection of an already-completed migration, and transaction
rollback when a later backfill statement fails. No production data was accessed.
