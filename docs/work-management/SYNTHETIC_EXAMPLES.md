# Isolated work examples

Read [CONTEXT.md](CONTEXT.md), [HANDOVER.md](HANDOVER.md) and
[OPERATIONS.md](OPERATIONS.md). Examples are opt-in maintenance tools, never an
application startup action. Do not run the old general seed on a restored backup.

`scripts/work-showcase.mjs` works only with NODE_ENV=test,
WORK_MANAGEMENT_DISPOSABLE=1, ALLOW_WORK_EXAMPLES=1 and the exact dedicated
`work-db/work_examples` database. It refuses a real owner identity or a populated
initial work/account/vocabulary dataset. This is intentionally stricter than the
older Phase 07 example command, which remains unchanged for compatibility.

Use a **fresh** standalone Compose project and the existing development image.
The commands below contain disposable credentials only. Never combine this Compose
file with production or substitute a production URL. If the database already
exists, choose a new project; do not reset it or restore over it.

```sh
docker compose -p dashboard-work-showcase -f docker-compose.work-test.yml up -d --wait work-db
docker compose -p dashboard-work-showcase -f docker-compose.work-test.yml exec -T work-db createdb -U work_test work_examples
docker compose -p dashboard-work-showcase -f docker-compose.work-test.yml run --rm --no-deps -e DATABASE_URL=postgresql://work_test:work_test_local_only@work-db:5432/work_examples runner npx prisma migrate deploy
docker compose -p dashboard-work-showcase -f docker-compose.work-test.yml run --rm --no-deps -v dashboard-work-showcase-examples:/showcase-private -e WORK_UPLOAD_DIR=/showcase-private -e ALLOW_WORK_EXAMPLES=1 -e DATABASE_URL=postgresql://work_test:work_test_local_only@work-db:5432/work_examples runner node scripts/work-showcase.mjs seed
```

Keep the same database/project/file volume when retrying. Durable command receipts
resume individual steps and return the completed manifest without duplicating data.
A completed repeat does not automatically pin a new day. If an incomplete run crosses
midnight, retry explicitly; the focus writer still rejects stale planning dates.

The dataset has a synthetic owner, Work/School/Personal contexts, **16 tasks,
11 events and two projects**. It includes:

- New/Backlog/To do/In progress/Waiting/Done/Cancelled and archived examples;
  Urgent undated work, completed history and context/company/course fields.
- Requester/vendor contacts, checklist and independent children, directional
  prerequisites, a nonblocking cross-project link and independent project stages.
- An overdue deadline, due follow-up with retained snooze history, task key dates,
  project milestone, today's focus and a real reserved work session.
- Ordinary, informational, all-day, cross-month and TBD events, plus an explicitly
  converted deadline placeholder with retained provenance.
- Task/project notes with edited revisions, a valid PNG and a valid PDF original,
  and documentation references. No external URL is fetched by the seed.

The recorded times are actual example creation times, not invented historical
activity. Task rewards are zero; no real account, employee, Japanese progress or
financial activity is seeded. Old Phase 07 sample-event changes cannot touch real
records here because the new workflow starts from an empty dedicated database.

To preview the dataset with the existing app, use the same isolated Compose
network, database and `/showcase-private` volume, on a separate loopback port:

```sh
docker compose -p dashboard-work-showcase -f docker-compose.work-test.yml run --no-deps -d --name dashboard-work-showcase-browser -p 127.0.0.1:3002:3000 -v dashboard-work-showcase-examples:/showcase-private -e WORK_UPLOAD_DIR=/showcase-private -e DATABASE_URL=postgresql://work_test:work_test_local_only@work-db:5432/work_examples -e NODE_ENV=development runner npm run dev
```

This does not bypass authentication. The test runner's disposable session secret
is not a production credential. Interactive GitHub sign-in needs the matching local
OAuth configuration; the existing browser harness uses an isolated owner test
session. Do not publish the preview or weaken the real owner's authorization to
browse examples. Stop another localhost:3002 test app first if that port is occupied.
The example database is not the work_test database used by general browser suites.

To hide the examples using only their server-retained manifest:

```sh
docker compose -p dashboard-work-showcase -f docker-compose.work-test.yml run --rm --no-deps -v dashboard-work-showcase-examples:/showcase-private -e WORK_UPLOAD_DIR=/showcase-private -e ALLOW_WORK_EXAMPLES=1 -e DATABASE_URL=postgresql://work_test:work_test_local_only@work-db:5432/work_examples runner node scripts/work-showcase.mjs archive
```

Archive keeps notes/files/revisions/focus and conversion history. It archives only
manifest tasks/projects, marks its independent events completed and leaves the
superseded placeholder hidden. It never deletes unrelated tasks or assumes every
`[Example]` name belongs to this dataset. Repeating archive is a no-op; seeding an
already completed dataset does not undo explicit archival. For a fresh active
showcase, use a new isolated project rather than erasing a populated database.

Stop the preview and isolated DB when finished; preserve volumes if you want to
return later. Database/private-file backup matching must select the actual matching
DB service and app. A work_examples preview must not be backed up with a service
whose POSTGRES_DB is work_test; the backup tool now refuses that mismatch. Use a
matching dedicated service configuration for a combined example backup.

Executed Phase 10 verification is recorded in PROGRESS.md: initial seed, unchanged
retry, valid original bytes, exact-manifest archive/retry and an unrelated sentinel
task remaining untouched. No examples were added to primary development or production.
