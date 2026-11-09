# Phase 05 — Checklists, real subtasks and relationships

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md and current source. Prerequisite: verified Phases 01–04.
Explain the plan before edits; implement only this phase in development.

## Objective

Preserve existing checklist steps while adding independent child tasks, multiple
blocking dependencies and nonblocking related-to relationships.

## Scope

- Relabel current Subtask UI as Checklist while preserving every existing row,
  ID, todoId, title, done state and creation time. Existing endpoints keep their
  checklist meaning or provide explicit compatibility adapters.
- Add optional Todo.parentId. A real child is an ordinary Todo with its own
  reference, state, notes, dates when available, and relationships. At most one
  parent; no self-parent or hierarchy cycles. Do not bulk-promote checklist rows.
- Show completed/total checklist and child-task counts separately. Warn before
  parent closure with unfinished children; record explicit decisions and never
  auto-complete/reparent children. Hierarchy does not automatically add edges.
- Add TodoDependency (directional prerequisite) and TodoRelation (symmetric,
  nonblocking) with unique constraints and appropriate lookup indexes.
- Backfill existing dependsOnId edges preserving direction. Audit/inventory any
  invalid pre-existing edges without erasing them. Switch to one authoritative
  graph writer after verification; legacy single-edge APIs must not truncate
  multi-edge relationships or independently edit conflicting copies.
- Provide Blocks / Blocked by / Related views with navigation to original tasks.
  Related links use a canonical pair representation to avoid reverse duplicates.
- Derive Blocked independently of Waiting/workaround. A Done prerequisite clears
  its blocking condition without starting/completing a dependent. Cancelled is
  unresolved until explicitly reviewed/overridden, never equivalent to Done.
- Starting/closing blocked work requires a clear warning and explicit recorded
  override/reason. Recheck the current graph/version when committing; a stale
  acknowledgement cannot silently override newly changed prerequisites.
- Prevent self-edges, duplicates, dependency and hierarchy cycles on the server,
  including concurrent opposite-edge/reparent requests. Use a reusable transaction
  locking/serialization policy for all relevant mutation paths, not just UI checks.
- Keep links within the owner. Cross-context and later cross-project relationships
  are allowed without copying tasks. Archival does not erase dependency history.

## Migration and exclusions

Do not renumber tasks or checklist IDs. Keep compatibility fields until their
readers are deliberately retired; no unrelated cleanup/drop migration here.
Optional checklist-to-task promotion, if implemented at all, must be explicit,
retry-safe and retain source provenance. Do not invent recurrence or scheduling.

## Verification and acceptance

- Compare all legacy checklist and edge tuples before/after and after repeat
  backfill. Verify old links and APIs cannot erase newer relationships.
- Test independent child status/notes, one-parent rule, deep cycles, concurrent
  reparenting, missing/foreign parents, parent closure warning and no cascade.
- Test dependency self/duplicate/reverse cycles, concurrent graph changes, Waiting
  versus Blocked, Done versus Cancelled prerequisites and recorded overrides.
- Test rejected writes create no partial links/history/reward effects; check
  accessible phone/keyboard relationship selection and error feedback.
- Acceptance: A01–A07, A12, A15–A17, A24, A28–A29 and A31 as applicable.

Update PROGRESS.md with graph semantics, compatibility and exact evidence. Stop.
Next: Phase 06.
