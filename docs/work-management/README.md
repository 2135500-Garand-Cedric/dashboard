# Work management implementation roadmap

This folder turns the discovery plan into individually assignable phases. Creating
these documents does not implement or authorize execution of any phase.

[CONTEXT.md](CONTEXT.md) is the shared product reference. Read it completely for
every phase, together with applicable repository instructions,
[PROGRESS.md](PROGRESS.md), [ACCEPTANCE.md](ACCEPTANCE.md), the assigned phase file,
and the relevant current code. These plans describe proposed changes, not claims
about features already implemented. Recheck the repository before acting.

Phases 01–03 operational details and recovery limits: [OPERATIONS.md](OPERATIONS.md).

## Execution order

| File | Deliverable |
| --- | --- |
| [00 — Architecture and migration decisions](phases/00-architecture-and-migration-plan.md) | Discovery baseline, data mapping, architecture and unresolved decisions; read before Phase 01 |
| [01 — Preservation and mutation safety](phases/01-preservation-and-mutation-safety.md) | Disposable migration baseline and safe existing task/event/reward operations |
| [02 — Canonical task foundation](phases/02-canonical-task-foundation.md) | Expanded task fields, contexts, statuses, priorities, closure, archival and audit backbone |
| [03 — All Work, contacts and task details](phases/03-all-work-contacts-and-details.md) | Default list, optional board, quick capture, contacts and responsive detail views |
| [04 — Notes, activity and private attachments](phases/04-notes-activity-and-attachments.md) | Dated notes, revisions, activity timeline, supporting documents and links |
| [05 — Checklists, subtasks and relationships](phases/05-checklists-subtasks-and-relationships.md) | Preserved checklists, real child tasks, multiple dependencies and related links |
| [06 — Deadlines, follow-ups and key dates](phases/06-deadlines-follow-ups-and-key-dates.md) | Distinct date semantics, timezone rules, follow-up history and task key dates |
| [07 — Existing calendar integration](phases/07-existing-calendar-integration.md) | Work sessions, projected layers and explicit legacy-event conversion |
| [08 — Projects and stages](phases/08-projects-and-stages.md) | Optional projects, stages, milestones and existing-task membership |
| [09 — My Work and focus planning](phases/09-my-work-and-focus-planning.md) | Daily planning view across the same tasks, dates, sessions and projects |
| [10 — Reliability and migration rehearsal](phases/10-reliability-and-migration-rehearsal.md) | Cross-module regression checks, full disposable migration rehearsal and handover |

The implementation is split more finely than the initial chat outline so calendar,
dates, relationships and daily planning can be assigned and checked separately.
Run phases in order. Splitting a phase further is acceptable if documented; skipping
prerequisite behavior or silently expanding a phase is not.

## Prompt to assign a phase

Replace the phase path below with one file from the table:

```text
Read docs/work-management/CONTEXT.md completely.
Read applicable repository instructions, docs/work-management/PROGRESS.md,
docs/work-management/ACCEPTANCE.md, and
docs/work-management/phases/01-preservation-and-mutation-safety.md.
Inspect the actual current implementation and prerequisite evidence.

Implement only that phase in development. Explain the plan before editing.
Preserve existing tasks, IDs, checklist rows, dependencies, calendar records,
links, timestamps and reward balances according to the migration plan.
Do not reset data, seed examples into restored real data, or deploy anything.
Run the required checks and report exact results and limitations.
Update PROGRESS.md and applicable acceptance evidence, then stop.
Do not automatically start the next phase.
```

## Rules shared by every implementation phase

- Product intent comes from CONTEXT.md and the user's current instructions. Phase
  files narrow execution scope; later requirements are compatibility guidance.
- Start by inspecting current code and progress. Report conflicts with the plan;
  do not treat the discovery snapshot as permanent truth.
- Use existing owner-only authentication for pages, APIs, searches and files.
  Contacts are not users. Work contexts never relax authorization.
- Evolve `Todo`; do not introduce a second task table or independent calendar.
- Add only the schema needed for the assigned phase. Prefer additive migrations,
  explicit backfills and compatibility readers over replacement/reset strategies.
- No production writes, deployment, push, credential rotation, email, external
  calendar writes or automatic integrations are authorized by these files.
- Development examples must be synthetic, explicitly opted into and isolated from
  restored user data. Never start a restored copy through automatic demo seeding.
- Make UI and mutations usable on phones and with a keyboard as they are built;
  the last phase is not permission to postpone basic accessibility or validation.
- Reuse the existing design system and keep existing Japanese, finance, calendar
  and personal reward behavior intact except for explicitly documented fixes.
- For functions/methods, put the opening brace on the signature line. Empty
  skeleton bodies have a blank line before their closing brace.
- Do not mark checks passed unless executed. Record unavailable checks and leave
  dependent acceptance unverified. Stop after the assigned phase.

## Completing a phase

Update PROGRESS.md with files and migrations changed, mappings and decisions,
exact commands/results, remaining risks, manual acceptance steps and the next
phase. Attach phase-specific evidence to the acceptance record there. Do not
mark a phase verified if required checks remain unavailable.

No separate task copies, fake historical notes, guessed event conversions or
retroactive reward payouts are acceptable shortcuts.
