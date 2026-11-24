# Phase 04 — Notes, activity and private attachments

Read ../CONTEXT.md completely, applicable instructions, ../PROGRESS.md,
../ACCEPTANCE.md and current code. Prerequisite: verified Phases 01–03. Explain
the plan before edits; implement only this phase in development.

## Objective

Make task progress retrievable through dated notes, a trustworthy activity feed,
supporting screenshots/PDFs and external documentation links.

## Scope

- Add task notes separate from the current description/next action. Server-created
  timestamps are immutable; optional occurred-at never replaces created-at.
- Support edits with edited indication and retained revisions for meaningful
  changes. Define deletion/redaction behavior explicitly; do not silently destroy
  the revision/audit chain through ordinary editing.
- Present Notes only / All activity over notes and the Phase 02 audit backbone.
  Automatic entries cannot be edited through normal note/task APIs. Store useful
  before/after values for significant changes, not noisy client-only events.
- Support validated external documentation URLs. Links do not authorize scraping,
  Obsidian synchronization, external intake or fetching private remote content.
- Inspect rendering utilities first. Current discovery found plaintext, not a
  Markdown renderer. Safe multiline plaintext and explicit links are acceptable;
  do not introduce unsafe HTML or a large editor without a concrete requirement.
- Add private WorkAttachment metadata and owner-checked upload/preview/download/
  delete routes, primarily screenshots/images and PDFs. Keep original files.
- Extract suitable neutral bounded-upload/content-validation/storage utilities
  from finance patterns if helpful, retaining finance behavior. Work has its own
  records/storage namespace and record authorization, never public file paths or
  borrowed finance receipt permissions.
- Validate actual bytes, format, size, file names, paths and image limits; use
  opaque storage keys, restrictive permissions, safe response headers and no-store
  responses. Define limits clearly and provide actionable errors on phones.
- Handle failed DB/file writes and deletion/replacement without leaking or losing
  references. Support optional files; writing a note must not require a document.
- Add persistent work storage to development/production configuration as a proposed
  deployment artifact only; do not deploy it. Update backup/restore procedures
  and tooling so work files are included alongside the whole database and other
  existing document roots. Test file recovery in isolation.

## Boundaries

Create only note/revision/attachment models needed now, with room for project
reuse later. Parent relationships must be real validated FKs. No generic unchecked
polymorphic record store, OCR, AI, mail/Outlook intake, project UI or public shares.
Never log note contents, documents, tokens or real contact details.

## Verification and acceptance

- Test note create/edit/revisions, ordering, occurred-at, stale/repeated submits,
  escaped/script-like content and Notes/All activity filtering.
- Test anonymous/non-owner/cross-record file and note access, invalid/oversized/
  spoofed files, traversal, private storage, safe previews, download and failure
  cleanup. Confirm finance files cannot be exposed through work endpoints.
- Test optional attachments and phone camera/library flows, long notes, keyboard
  controls and visible upload/save failure states.
- Restore sample DB metadata plus work files in isolation and verify originals;
  existing finance backup behavior must continue to work.
- Acceptance: A04–A05, A13–A14, A28–A29, A31 and preservation where applicable.

Record exact commands, storage/backup changes and unverified cases in PROGRESS.md.
Stop. Next: Phase 05.
