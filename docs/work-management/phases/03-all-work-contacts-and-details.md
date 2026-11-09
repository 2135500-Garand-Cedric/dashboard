# Phase 03 — All Work, contacts and responsive details

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md and current code. Prerequisite: verified Phases 01–02. Explain
the plan before editing; implement only this phase in development.

## Objective

Replace board-first navigation with a compact searchable All Work view over the
same Todo records, while keeping the optional board and stable detail URLs.

## Scope

- Evolve `/todos` into All Work with list as default and optional Kanban mode.
  Both use the same owner-scoped filters, sorting and result semantics. Use URL
  state for shareable/reloadable filters where practical; paginate/bound results.
- Search references, title and description; filter by available context, company,
  course, person, kind, system/tags, status and priority. Add date/project filters
  only when their authoritative models arrive in Phases 06/08.
- Provide active, Done/Cancelled history and archived views within All Work.
  Unclassified legacy tasks and undated Urgent work must remain discoverable.
- Keep quick capture title-only with a visible context default from the current
  view. Optional fields are progressively disclosed, not mandatory company forms.
- Add minimal owner-managed Contact records and requester, optional distinct
  affected people and waiting-on associations. Contacts are not User rows, OAuth
  accounts or assignees. Company/contact organization is optional, not tenancy.
- Build shared task detail content: description/outcome, next action and checklist
  in the main column; context/people/status/priority in compact metadata. Dates,
  notes and project sections appear when their later phases exist.
- Provide desktop quick-detail panel and the existing stable full-page URL. On
  phones use a full-screen detail view with reliable direct-link/back behavior.
- Update sidebar label to All Work while preserving `/todos` and old links. Do
  not add empty My Work or Projects routes ahead of their phases.
- Cards emphasize action, people, Waiting/workaround and metadata. Retain personal
  reward access; do not change reward accounting or invent effort percentages.
- Provide touch/keyboard status actions, save/retry/error/empty/loading states,
  focus handling and protection against accidental unsaved-edit loss.

## Migration and exclusions

Only add necessary contact tables/relations/indexes. Existing people fields stay
unknown; do not derive contacts from text or create real-looking example employees.
Prevent referenced-contact deletion from destroying tasks; deactivation or explicit
unlink is preferable. Do not change the checklist/real-subtask semantics yet.

No notes/attachments, deadline calendar, projects, My Work, automatic intake or
notifications. Do not build placeholder implementations of later features.

## Verification and acceptance

- Test equivalent list/board results and sorting, reloadable filters, search by
  stable reference, Unclassified visibility, archived/closed retrieval and empty
  results. Inactive contacts remain visible on existing tasks as appropriate.
- Test title-only capture from Work/School/Personal/combined views and optional
  requester/affected/waiting-on relationships, with server ownership checks.
- Test direct old URLs, panel/full-page agreement, back navigation, failed saves,
  stale edits and denied access to records/search/contacts.
- Check phone portrait/landscape, keyboard operation, normal/wide desktop, long
  titles and no horizontal overflow. Dragging must not be required for status.
- Acceptance: A04–A12, A27–A29 and A31 as applicable.

Update PROGRESS.md with exact checks and manual acceptance steps. Stop. Next:
Phase 04; do not start it automatically.
