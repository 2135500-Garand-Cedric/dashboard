# Work-management maintenance and migration handover

Read [CONTEXT.md](CONTEXT.md), [PROGRESS.md](PROGRESS.md),
[ACCEPTANCE.md](ACCEPTANCE.md) and [OPERATIONS.md](OPERATIONS.md) together.
The context defines the product; progress records executed evidence. This document
is an operator guide, not permission to deploy or modify production. Phase 10
adds reliability fixes and verification, not another work feature module.

## Model and service map

| Source | Responsibility |
| --- | --- |
| Todo | Canonical task, immutable ID/reference, status/priority/context, metadata, deadline and optional project/stage/parent |
| Subtask | Original checklist rows; these are not independent tasks |
| TodoDependency / TodoRelation | Directed prerequisites and symmetric nonblocking links |
| WorkContext / WorkContact / TodoAffectedContact | Organization and people; contacts are not application users |
| WorkFollowUp / WorkKeyDate / WorkFocus | Retained follow-up lifecycle, informational task/project dates and independent dated focus |
| Event / EventTaskLink | Original events and real work-session times, with typed links to original tasks |
| WorkEventConversion / WorkEventActivity | Explicit conversion provenance/reversal and event decisions |
| WorkProject / WorkProjectStage | Optional grouping and stages, independent of task status |
| WorkNote / WorkNoteRevision / WorkAttachment | Exclusive task-or-project supporting records and private original-file pointers |
| WorkActivity / WorkMutationReceipt | Append-only application decisions and technical replay results |

`src/lib/work-management/server.ts` supplies task/event/checklist commands,
canonical DTOs, All Work and contacts. `graph.ts` / `relationships.ts` own links
and transition review. `date-server.ts`, `dates.ts` and `date-lifecycle.ts` own date
validation/lifecycle. `calendar-server.ts` projects work into the existing calendar
and handles explicit conversion. `project-server.ts` owns groups/stages/membership;
`supporting.ts` owns notes/files for either parent. `planning-rules.ts` and
`my-work-server.ts` share daily predicates with All Work. Client-safe labels live
in `types.ts`; do not import server/date libraries just to share a label.

Pages remain `/todos`, `/todos/:id`, `/projects`, `/projects/:id`, `/my-work` and
`/events`. Task panels use those same records. APIs live under `/api/todos`,
`/api/work-items`, `/api/work-contexts`, `/api/work-contacts`, `/api/projects`,
`/api/my-work`, `/api/work-calendar` and `/api/events`. Nested task/project routes
provide dates/membership/transition/timeline/notes/revisions/attachments/originals.
See OPERATIONS.md for exact payloads, revisions and per-phase endpoints.

## Rules that must survive maintenance

- Auth is owner-only. `owner-policy.ts` pins the permanent GitHub account ID and
  explicitly maps it to stored database user **1**. Context/company/course/project
  are filters, never authorization domains. Do not replace this mapping with a
  newly logged-in user's numeric ID or reassign existing finance/Japanese/work rows.
  Every API authenticates before input/data access; protected layouts cover pages.
- Commands use UUID Idempotency-Key, If-Match where editing existing state, and the
  shared owner advisory transaction lock. Records, affected versions, rewards,
  audit and retry receipts commit together. Missing preconditions return 428;
  stale/conflicting changes return 409. Do not silently rebase an unsaved draft.
- Existing raw priority/status/IDs/timestamps remain preserved. Named priority is
  independent of deadlines. Old tasks retain unknown historical context/kind and
  closure dates. New captures default New/Normal; unknown legacy values require
  review, not guessed mapping.
- Only Done resolves a prerequisite. Waiting is separate from Blocked. Review
  tokens and explicit explanations protect blocked starts/closure and unfinished
  parent/project closure. Children and sessions never complete through a cascade.
  `dependsOnId` is a retained compatibility mirror, not a second authoritative graph.
- Rewards are accounted once through task transitions. LEGACY_BASELINE is a
  reversal baseline, not proof of a historical payout. Reopen reverses the stored
  applied amount once. The old separate `/api/users/rewards` protocol returns 410.
- Deadline, follow-up, key date, reservation and event are distinct sources. Date
  strings stay calendar dates; exact times retain their zone. APP_TIME_ZONE defaults
  to Toronto. DST gaps are rejected; repeated wall times need an offset choice.
  No date/session ending automatically completes a task. Conversion is explicit,
  previewed and reversible subject to review, never inferred from an event title.
- Focus is unique per owner/task/local date, never a deadline. Closure/archive
  hides its active presentation; same-day reopen restores it. Prior pins do not
  carry over. Removing focus retains history; reads and rollover do not write.
- My Work counts overlap; its active total is unique tasks. Cards show at most six
  per section; real sessions paginate separately. All Work's visible Planning
  section filter uses the same predicates. Switching to history/archive/other
  non-active views or a closed status clears an incompatible planning predicate.
- Notes are escaped plaintext with explicit validated HTTP(S) links. Revisions and
  automatic activity are retained, not editable history. Removed text is not secure
  erasure. Private PDF preview uses passive rendering; no external content ingestion.

## Storage, configuration and backup

Existing runtime inputs remain DATABASE_URL, GitHub/session configuration and
optional APP_TIME_ZONE. Work defaults to `private/work`, finance to
`private/finance`; Compose uses separate persistent volumes and explicit container
paths. No new environment setting or storage root was added by Phase 10.
Directories/files use 0700/0600 and opaque keys, with bounded content/size/type
checks. Work and finance authorization namespaces remain separate. PDF structural
validation is not malware scanning; unusual PDFs may need re-exporting.

A complete backup needs the **whole database and both original-file roots**.
The NAS `scripts/backup-database.sh` covers the database only. Use the combined
host-side procedure with a new private destination:

```sh
node scripts/finance-backup.mjs backup docker-compose.dev.yml /secure/backups/new-dashboard-snapshot
node scripts/finance-backup.mjs verify /secure/backups/new-dashboard-snapshot
```

The source app is stopped/restarted while copying; pause other writers too.
The tool now refuses auto-remove containers and app/database selector mismatches
before stopping anything. It expects the app's explicit DATABASE_URL host to be
its selected Compose DB service/container and the database name to match that
service's POSTGRES_DB. Deliberate external DB topologies need a separately reviewed
backup procedure, not bypassed validation. A directory without manifest.json is
incomplete; do not reuse it as a successful snapshot.

Version-2 manifests verify all public-table fingerprints and all referenced file
sizes/SHA-256 values. Verification restores into a fresh network-isolated PG15
container and separate scratch file roots. Restore real service volumes only into
a new empty environment; assign the application UID and private permissions before
exposing it. Keep old/private originals and pending-deletion keys until reviewed.
Never blindly purge unfamiliar UUID files. Whole backups also retain private orphans.

Local test backups are not off-host disaster recovery. Protect the NAS/off-host
copy, configuration/secrets and image/source version separately; verify decryption
and restore periodically. This phase did not configure encryption, NAS scheduling,
retention, WAL/PITR or off-host recovery. No production host was inspected.

## Cumulative migration rehearsal

Phase 10 used the saved **pre-redesign development** dump and matching inventory,
not a schema reconstructed by dropping current fields. The restored historical
copy had 30 public record tables, three tasks, five checklists and 17 events.
The chain applied 10 work migration files across nine phases (25 earlier migrations
were already applied), reaching 35 total migrations. Every phase comparison and
repeat deployment preserved original values/IDs/links/timestamps/balances and all
unrelated finance/Japanese records. Private artifacts are under
`private/work-management/phase10-chain/`; they contain sensitive full rows and
must never be published. No historical migration SQL/checksum was edited.

`scripts/rehearse-work-migrations.mjs <new-private-directory>` requires NODE_ENV=test,
WORK_MANAGEMENT_DISPOSABLE=1, RUN_WORK_REHEARSAL=1 and the dedicated
`work-db/work_test` connection. Restore only into a confirmed-empty database using
the standalone work-test Compose project. Compare against the original private
inventory before running the script. It refuses already-redesigned baselines,
checks each stage, repeats deployment, and projects every original column back
onto its exact original rows. It does not reset/restore a database itself.

`createMigrationWorkspace(phase)` scopes legacy tests to their historical boundary,
using unchanged migration files. This prevents an old Phase 02/05 fixture test from
accidentally applying future phases. Dedicated legacy tests preserve null/unknown
priorities/custom statuses and self/cyclic/cross-owner dependency edges, and verify
repeat backfill/deploy without fabricating historical data. Unknown/anomalous real
baselines must be reviewed before cutover; inventory never repairs them.

### Interrupted migration and compatibility

A separate historical copy was migrated through Phase 08. With the original Phase
09 SQL unchanged, a test held the Todo table lock and actually terminated only the
blocked migration connection. Its transactional DDL rolled back, Prisma refused a
blind retry, explicit `migrate resolve --rolled-back` followed inspection, and
redeploy/repeat succeeded without original-record differences. A separate test
reproduced PostgreSQL's unsafe uncommitted-enum-value error, validating why the
status-value migration must commit before the subsequent default uses New.

This is evidence for the tested interruption point, not every host crash or every
statement in all historical migrations. Some early historical files lack explicit
BEGIN/COMMIT. Never assume an arbitrary failed migration is wholly unapplied.
Inspect private migration logs, catalog state and fingerprints; resolve only after
proving rollback or completing a reviewed repair. Do not edit applied files, mark
an incomplete migration applied, execute suggested DROP SQL, or reset a live DB.

A generated legacy-status Prisma client successfully read selected original
columns but rejected a NEW status. **The pre-redesign application is not a supported
rollback**, even for general UI reads. Old tabs cannot bypass the guarded new APIs;
old server binaries with direct DB writes would bypass those safeguards. Keep the
app in maintenance mode or roll forward to a compatible release. An additive
schema alone does not make an old writer safe.

After new writes, restoring an old snapshot loses those writes and may invalidate
new file pointers/receipts. Recover a fresh isolated copy, preserve the failed
state, reconcile later writes explicitly or roll forward. There is no automatic
lossless downgrade or down-migration.

## Verification and limits

PROGRESS.md records actual commands, outcomes and artifacts. Guarded work and
cross-module DB tests run serially in the disposable work_test copy; migration
anomaly/recovery/example tests use separate databases. Never run whole-DB rollback
or fingerprint assertions concurrently with writers to that same database. Freeze
app source while browsers run. Legacy finance/Japanese test flags alone are not a
production-target guard: operators must keep their URLs disposable.

The volume test uses 1,000 synthetic tasks and 55 long notes, checks bounded pages,
shared planning/date sorts, read-only behavior and competing note/file/project
writes, then removes only its fixtures. Responses remain bounded; mixed date sort
still loads matching ordering scalars, graph transition review traverses relevant
owned data, and substring search has no trigram index. Current owner/status,
parent, dependency direction, project/stage, history and focus indexes support
normal use. This is personal-dashboard evidence, not an enterprise-scale benchmark;
measure representative growth before adding indexes or a new search subsystem.

No dependencies were added in this phase. Luxon/FullCalendar zone support was added
in Phase 07 and remains used; shared file/PDF utilities remain used by both modules.
There is no dependency vulnerability clearance claim or broad finance refactor.
Physical phone/camera/Safari, production HTTPS/proxy/session configuration, host
reboot recovery, an actual old-release deployment, NAS restore and exhaustive
finance/Japanese browser flows remain unverified. The production image/configuration
was inspected for this checklist; no production container was built/deployed here.

## Future deployment checklist — separate authorization required

1. Review current production schema/inventory, owners, migration checksums and any
   legacy anomalies without guessing intent. Verify stored owner 1 and pinned GitHub
   identity, HTTPS/reverse proxy/session origin, secrets, private volumes and DB/admin
   network exposure. These are production assumptions until explicitly checked.
2. Build/test the intended release, generated Prisma client and matched source;
   preserve the compatible previous image/configuration. Verify disk capacity and
   mount ownership. Never include example/test data in production.
3. Quiesce every writer, take a fresh complete DB/files backup, and actually restore
   and compare it in isolation. Record recovery point and acceptable downtime.
4. Keep old writers stopped. Apply reviewed migrations explicitly in their original
   order; don't rely on concurrent app startup migrations or run seed/db push/reset.
5. Compare original rows/IDs/edges/timestamps/rewards/unrelated modules and expected
   backfills. Repeat migration must be a no-op. Known unrelated
   ActivityVocab.lastPracticed drift is not permission to execute its proposed DROP.
6. Start only the compatible application. Check owner and denied access, originals,
   task/board/history/project/My Work/calendar links, ordinary events and unrelated
   finance/Japanese behavior. Reload stale browser tabs before editing.
7. If checks fail, retain artifacts and stop writes. Diagnose/recover in a fresh
   isolated environment; use the compatibility/recovery rules above. Do not blindly
   restore over later writes or launch the old task/reward writer.
8. Verify off-host backup restore, scheduling/retention, monitoring and restart policy
   under a separate authorized production exercise. No such operation is implied here.

Manual acceptance: try Work/School/Personal capture, an undated Urgent task, Waiting
and a distinct blocked task, acknowledged closure/reopen, note revision and original
upload/replacement, deadline/follow-up/milestone/session source links, conversion and
undo, project moves/stages, focus across local midnight, shared filter/history
navigation, and two-window stale saves. Repeat on physical devices when available.
There is no automatically authorized next phase.
