# Phase 10 — Reliability, cumulative migration rehearsal and handover

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md, all implemented phase decisions and actual source. Prerequisite:
Phases 01–09 implemented with their evidence and any unverified items identified.
Explain the plan before edits; implement only reliability/documentation fixes in
development. This file does not authorize production deployment or data writes.

## Objective

Verify the whole redesign preserves original data and works coherently, close
reliability gaps, and provide a concrete maintenance/migration handover.

## Scope

- Reconcile all acceptance IDs and phase records with actual code. Identify missing
  requirements without silently starting a new feature module. Fix defects within
  the agreed redesign; report larger scope conflicts for a separate assignment.
- Exercise the full migration chain from a private pre-redesign backup restored
  into a disposable database and isolated document roots. Disable automatic
  sample seeding, external effects and production connections. If no suitable
  authorized baseline copy exists, use synthetic legacy fixtures but mark real-data
  migration rehearsal unverified rather than claiming equivalence.
- Produce private before/after inventories: ID sets, original task/event fields,
  raw status/priority mappings, owners, checklist rows, dependency directions,
  calendar associations, original timestamps, rewards/User totals and unrelated
  Japanese/finance records. Explain every intentional difference.
- Verify repeat backfills/retries, constraint ordering, enum commit boundaries,
  interrupted migration recovery, stale app/client compatibility and supported
  application rollback. Do not edit applied historical migrations or drop retained
  compatibility fields just to simplify the schema. Destructive retirement, if
  needed, requires a separately reviewed later task.
- Verify complete backups cover the whole database and every private file root;
  restore originals in isolation and validate DB/file references. A successful dump
  alone does not establish restore readiness. Document post-migration-write
  recovery limitations rather than recommending blind rollback to an old dump.
- Run targeted concurrency/retry tests for graph updates, closure overrides,
  rewards, conversion, follow-ups, note edits, file operations and project moves.
- Review owner checks on all work pages/APIs/search/files, related-record scoping,
  validation, error responses and sensitive logging. Review added dependencies and
  shared utility extraction without destabilizing finance/Japanese behavior.
- Verify main dashboard, All Work, optional board, details, notes, projects, My Work
  and existing calendar on phones/desktop/wide screens and keyboard navigation.
  Check long histories, bounded pagination, query indexes and empty/error/loading
  states against realistic synthetic volumes.
- Run appropriate existing auth, event-date/completion, Japanese and finance
  regressions using safe environments. Run type checks, targeted lint and production
  build using an isolated build output where necessary to avoid disrupting dev.
- Provide an explicit opt-in synthetic example workflow covering all implemented
  work features in an isolated development dataset. Never seed restored real data
  automatically; example cleanup must identify only its own records.
- Document model/service/routes, date/graph/reward rules, private storage/backup,
  migrations, compatibility, tests, environment needs and manual acceptance.

## Required handover

Report exact executed checks/results, before/after preservation evidence,
unverified requirements, remaining risks, backup/restore evidence and a proposed
future deployment/recovery checklist. Label production-specific assumptions as
unverified unless checked under separate explicit authorization.

Finish the shared acceptance record only when evidence supports it. Leave blocked
checks pending. No AI, new integrations, notifications, scope expansion, push,
credential changes or deployment. Update PROGRESS.md, summarize remaining work,
and stop; there is no automatically authorized next phase.
