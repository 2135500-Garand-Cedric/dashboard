# Knowledge base: architecture and implementation proposal

Status: implemented November 23, 2026. This document retains the original design
proposal below. See [Knowledge maintenance](KNOWLEDGE_MAINTENANCE.md) for current
usage, implementation, operational limits, and verification commands. A later
requested enhancement adds folders/subfolders and improves formatting insertion;
its current behavior is also documented there.

Reviewed against the repository on November 23, 2026, including the current
uncommitted calendar and work changes. Existing source code takes precedence over
older planning documents where the application has evolved.

## 1. Recommendation

Add a **Knowledge** section to the dashboard for persistent troubleshooting
guides, procedures, and reference material. Borrow the useful parts of an
Obsidian workflow: Markdown, links between articles, backlinks, tags, and fast
search. Keep the first version focused on finding an answer during daily work.

Use the existing Next.js application, PostgreSQL database, Prisma, owner-only
authentication, and private file infrastructure. No additional service or
container is needed for the proposed first version.

Keep three concepts distinct:

- **Task:** work to complete, with its status, deadlines, and people.
- **Work note:** a dated account of what happened on a task or project.
- **Knowledge article:** reusable information that remains useful after the work
  is finished, such as how to diagnose and repair a recurring problem.

For example, “Investigate workstation VPN failure” is a task. “Restarted the
service and confirmed connectivity” is a work note. “VPN connection fails after
an update: diagnosis and recovery” is a knowledge article linked to that task.
Several future tasks can use the same article without copying it.

## 2. What already exists and what to reuse

| Current implementation | Relevance to this proposal |
| --- | --- |
| `src/app` App Router pages and `src/app/api` handlers | Add `/knowledge` pages and owner-protected APIs using the same structure. |
| `src/components/SideMenu.tsx` | Add a Knowledge navigation entry with a book icon. |
| `src/components/AppShell.tsx` | Reuse navigation, settings, snackbar, and persistent view-state providers. |
| `prisma/schema.prisma`: `Todo`, `WorkProject` | Link documentation to the existing records and preserve their IDs. |
| `WorkNote`, `WorkNoteRevision`, `WorkActivity` | Reuse the revision/conflict principles; retain work history as its own data. |
| `src/lib/work-management/supporting.ts` | Reference for note revisions, parent validation, private attachment lifecycle, and timeline reads. |
| `src/components/work/TaskTimeline.tsx` | Existing text notes, revision UI, and task/project note workflow; not currently a Markdown knowledge editor. |
| `src/lib/work-management/task-details.ts` | Combined initial task read; include a small linked-article summary rather than introducing another initial loading waterfall. |
| `src/lib/work-management/client.ts`, `validation.ts`, `server.ts` | Existing idempotency keys, revision checking, transactions, and retry behavior. Reuse carefully scoped helpers rather than making Knowledge depend on the whole task server. |
| `src/lib/documents/private-files.ts` | Validated private image/PDF storage, bounded uploads, generated storage keys, and file hashing. |
| `src/lib/work-management/files.ts`, `WorkAttachment` | Work upload root and attachment metadata; can be extended to support an article parent. |
| `src/components/finance/FinanceDocumentPanel.tsx` | Reference for keeping original-file viewing and saving inside the PWA instead of navigating away. |
| `src/components/shared/TaskModal.tsx` | Existing centered dialog behavior for linking records and other short actions. |
| `src/context/SettingsContext.tsx` | Display timestamps in the configured dashboard timezone. |
| `src/context/ViewStateContext.tsx` | Preserve Knowledge search/filter state through internal page navigation. This is in-memory view state, not durable document storage. |
| `src/lib/auth.ts`, `owner-policy.ts`, `require-owner.ts`, `ProtectedLayout.tsx` | Existing GitHub owner-only access. The permanent database owner mapping is user ID 1, not an arbitrary logged-in user's ID. |
| `public/sw.js` | Push-only service worker; authenticated pages, APIs, and uploads are not cached for offline access. Preserve that behavior initially. |

Projects already display direct project notes and notes from their current tasks
without making copies. Knowledge should follow that same principle: show linked
articles where useful while keeping one authoritative article.

The package manifest currently has no dedicated Markdown parser/editor or HTML
sanitizer. Markdown rendering is an explicit implementation dependency decision,
not an existing capability to assume.

## 3. Everyday experience

### Knowledge home

Use the dashboard's dark cards, borders, typography, and Heroicons. Provide:

- A prominent search field and New article button.
- Compact results with title, article type, short summary, tags, and updated date.
- Recently updated and pinned articles when no search is active.
- A collapsible filter area for type, tags, and active/archived articles.

Search should include titles, summaries, article text, and tags. Allow the user
to paste an error message or search a product name; punctuation in error codes
must not make articles impossible to find.

### Reading an article

Make the title, short summary, and actual instructions the main content. Place
backlinks, related tasks/projects, and revision history in secondary sections.
Use a readable text width even on a wide monitor; optional supporting columns
can use the remaining space. This is different from limiting the entire page.

Headings, numbered procedures, checklists, code blocks, tables, links, and images
are the useful first Markdown features. Include a copy button on code blocks.
Internal article links open within the dashboard. Attachments open in a closable
in-app viewer, with a save-original action that does not strand a phone PWA.

On phones, use one column and normal page scrolling. Put the article first and
collapse supporting sections. Do not force independent nested scroll panels.

### Writing an article

Use a full editor page with Write/Preview modes, optional desktop split preview,
a small formatting toolbar, explicit Save, and clear unsaved/saved/error states.
Start with explicit saves and navigation protection rather than silent autosave
that can overwrite another tab. Preserve the draft when a save fails.

Offer starting templates, not mandatory form fields:

| Type | Suggested headings |
| --- | --- |
| Troubleshooting | Symptoms; environment; error messages; checks; cause; solution; verification; related information |
| Procedure | Purpose; prerequisites; steps; verification; rollback or recovery |
| Reference | Summary; useful facts; commands; related information |

The title is required. Type defaults to Reference; summary and tags are optional.
Template headings are ordinary editable Markdown, not a second structured copy
of the article body.

## 4. Proposed data model

Names below are proposed additions, not existing Prisma models.

| Model | Main fields and purpose |
| --- | --- |
| `KnowledgeArticle` | Stable integer ID, `userId`, title, optional summary, Markdown body, type (`TROUBLESHOOTING`, `PROCEDURE`, `REFERENCE`), pinned flag, revision, created/updated timestamps, optional `archivedAt`. |
| `KnowledgeArticleRevision` | Article ID, revision number, snapshot of title/summary/body/type and tag names, actor GitHub ID, recorded timestamp, action such as create/edit/restore. Unique article/revision pair. |
| `KnowledgeTag` | ID, `userId`, display name, normalized name; unique owner/normalized name. |
| `KnowledgeArticleTag` | Article/tag association; unique pair. |
| `KnowledgeArticleLink` | Source and target article IDs, owner, unique directed pair. A derived index of internal Markdown links, used for backlinks. |
| `KnowledgeTaskLink` | Article/task IDs, owner, creation timestamp; unique pair. Many articles per task and many tasks per article. |
| `KnowledgeProjectLink` | Article/project IDs, owner, creation timestamp; unique pair. Explicit project documentation, separate from indirect task links. |

Extend `User` with the corresponding ownership relations, `Todo` and
`WorkProject` with article associations, and `WorkAttachment` with an optional
`knowledgeArticleId` relation. Add an article attachment collection. Keep
`WorkNote` and its revisions unchanged.

Use real foreign keys rather than a generic `entityType/entityId` column that
cannot enforce its target. Give articles and tags composite unique `(id, userId)`
keys; association tables should enforce same-owner references to articles,
tasks/projects, and tags where supported by their existing keys.

For attachments, extend the existing “exactly one task or project parent”
constraint to “exactly one task, project, or article parent.” The current
`WorkAttachment_one_parent` constraint and `WorkAttachment_project_owner` trigger
are defined in `prisma/migrations/20261112120000_work_projects/migration.sql`.
Update the ownership trigger/function as well as the constraint through a new
migration; changing only Prisma's relations would be insufficient. Backfill is
not needed: existing rows continue to have their original parent. Add article
ownership checks and appropriate foreign keys, preserving existing task/project
behavior and file keys.

Index owner/archive/update queries, tag lookups, backlink targets, task/project
associations, and article attachments. Revision history and archived articles
remain owned/private. Use timezone-aware instants for new timestamps and the
existing timezone formatter for display.

Do not add folders, nested notebooks, separate vaults, per-article permissions,
review schedules, embeddings, or graph-coordinate tables initially. Tags and
search provide enough organization for a personal knowledge base. Add one
simple collection mechanism later only if actual use shows it is needed.

## 5. Article links, backlinks, and portability

Use immutable IDs in dashboard routes, for example `/knowledge/42`. Renaming a
title must not break links. An Insert article link picker should insert a normal
Markdown link with a readable label and stable internal route. Optional `[[...]]`
typing can use autocomplete, but must resolve to an article ID before saving;
do not make mutable or duplicate titles the identity of a link.

The Markdown body is the source of truth for article-to-article links. Parse it
on save and update `KnowledgeArticleLink` in the same transaction as the new
revision. Ignore links inside code blocks, validate target ownership, and dedupe
repeated links. Backlinks are queried from that index, not manually maintained.
After restoring an old revision, rebuild the index from the restored body.

Task/project links are explicit database associations. Renaming, moving, closing,
or archiving a task does not break its link to an article. Article archiving
keeps incoming links valid and shows an Archived badge. Start with archive and
restore instead of permanent article deletion.

Provide a later Markdown export with attachments and a manifest mapping stable
IDs to exported filenames. Rewrite internal links for the export and preserve
their original IDs in metadata. This keeps the content portable without
claiming live filesystem synchronization or full Obsidian vault compatibility.

## 6. Connections to the existing dashboard

### Tasks

Add a compact Documentation section: linked article titles, Link article, and
Create article. Keep the initial projection small and paginated when necessary.
An article can also show all related tasks with their reference, title, and status.
Reopening a troubleshooting task never changes the article automatically.

“Create article from this task” should prefill the title and link the task. If
the user selects notes to include, copy only those selected excerpts into a
draft. Do not automatically publish the entire timeline or copy uploaded files.
The source task/note history remains intact; the article is an independently
maintained explanation, not a second editable version of the timeline.

### Projects

Show direct project documentation in a compact section. Optionally show articles
linked through the project's current tasks in a separate “From project tasks”
list, deduped by article ID. Do not persist those indirect links as direct ones.
Moving a task changes the indirect view, while an explicit project link remains.
Task/project notes continue their current behavior and are not converted.

### Calendar, My Work, and other modules

Do not turn articles into tasks or calendar events. To review/update a procedure,
create an ordinary linked task and use its existing deadline, follow-up, focus,
or work-session controls. The calendar continues to display those work records.
No new calendar layer or notification worker is needed.

Finance receipts, pay stubs, and Japanese vocabulary remain separate. Knowledge
can contain normal links to their pages, but this proposal does not copy their
records or documents, add financial reporting, or change practice behavior.

## 7. Backend, search, and security

Proposed file layout:

- `src/app/knowledge`: protected list, new, article, and edit pages.
- `src/app/api/knowledge`: article CRUD/archive/restore, revisions, search,
  tags, association actions, and authenticated attachment endpoints.
- `src/components/knowledge`: list, editor, renderer, linking controls, backlinks.
- `src/lib/knowledge`: validation, data services, link parsing, and search.

Every API handler must call `requireOwner` before parsing input or accessing
records, including search, revisions, attachments, and exports. Use
`ProtectedLayout` for pages and the explicit `OWNER_DATABASE_USER_ID` mapping in
server queries. Layout protection alone is insufficient. Never accept an owner
ID from the client or grant access merely because a GitHub login succeeded.

Adopt the existing `Idempotency-Key` and `If-Match` contract, conflict feedback,
and atomic mutation pattern. Avoid initializing the full task graph merely to
edit an article. Reuse small helpers or extract shared infrastructure only when
doing so preserves existing work behavior. On conflict retain the local draft
and offer the latest saved version; never silently overwrite it.

Save article content, revision, tags, and derived backlinks atomically. Keep
task/project association edits idempotent and record their actor/time; if surfaced
in the existing work audit, append explicit documentation-link actions without
altering task status. Restoring a revision creates a new revision. Restoring body
content does not silently roll back task/project associations or file deletion.

Use parameterized PostgreSQL search with title matches ranked first and text
snippets for body matches. Start with bounded, paginated queries; add a migration
for a full-text index when implementing search if needed. Exact substring/error
code fallback is necessary alongside tokenized search. No Elasticsearch or other
search container is justified for this personal dataset.

Markdown must render through a constrained parser/renderer: no raw HTML,
JavaScript URLs, embedded scripts, arbitrary iframes, MDX, or executable content.
Choose and review a maintained Markdown library at implementation time. Resolve
inline images through authenticated local attachment routes; do not automatically
load remote tracking images or fetch arbitrary URLs server-side. External links
are ordinary safe HTTP(S) links, not automatic content imports.

Keep attachment validation at the current image/PDF limits initially: 15 MB,
validated contents, private storage keys, and owner-authorized downloads. The
current shared validator does not support arbitrary ZIP, executable, or text
uploads. Code and configuration examples can be pasted into Markdown code blocks.
Keep API responses/downloads private and uncached, and omit article bodies,
search terms, tokens, and uploaded contents from logs.

## 8. Storage, backups, and preservation

Store Markdown and metadata in PostgreSQL. This integrates with the existing
whole-database dump in `scripts/backup-database.sh`, which intentionally includes
all tables. That command does **not** back up attachment bytes.

Reuse the existing work upload directory and `work_files` persistent volume for
article attachments. `docker-compose.prod.yml` already mounts it separately from
`finance_files`. No new upload-root environment variable or volume is required
if article files use the same validated flat storage-key scheme.

`scripts/finance-backup.mjs` currently backs up the whole database, both document
roots, and active `WorkAttachment` checksums. Extending `WorkAttachment` lets it
include article files through the same inventory, but this must be verified in
an isolated restore rather than assumed. Check any hard-coded snapshot/table
expectations and attachment-parent validation during implementation.

Use additive migrations. Do not rename/recreate Todo, WorkProject, WorkNote, or
their IDs; do not rewrite old migrations or seed the live database. Knowledge
starts empty. Only create examples explicitly in a disposable environment.
Archiving an article retains content and files; database records and originals
must be backed up and restored together.

## 9. Proposed implementation order

1. **Foundation and basic articles:** additive article/revision schema, owner
   protection, Knowledge navigation, list/new/read/edit, Markdown preview, explicit
   saves, conflicts, archive/restore, and basic title/body search.
2. **Organization and discovery:** tags, pinned articles, templates, search
   snippets and ranking, stable article links, derived backlinks, broken-link
   feedback, and preserved list filters.
3. **Work integration:** task/project association tables, both-direction linking,
   compact task initial-read integration, project direct/indirect lists, and
   optional selected-note-to-draft workflow.
4. **Attachments and portability:** extend private work attachments, inline local
   images, in-app original viewer, Markdown export, and backup/restore coverage.
5. **Reliability and polish:** focused phone/PWA verification, accessibility,
   concurrent edit/link tests, realistic search performance, and maintenance docs.

Deliver each phase independently, with the later schema additions introduced
when their behavior is implemented. The complete model above describes the
destination; it is not a reason to build unused tables in the first phase.

## 10. Acceptance checks and boundaries

Test creating a VPN troubleshooting guide, linking the original task and its
project, closing the task, and finding the guide later by its error message.
Link a second incident to the same article; confirm that there is one article
and its original work notes remain unchanged.

Verify title renames, duplicate titles, backlinks after edits/restores, archived
targets, moving tasks between projects, and restoring content without changing
work associations. Exercise retries and simultaneous edits in two tabs.

Extend the existing Node unit/integration and opt-in disposable browser testing
approach. Use `tests/work-support.*`, `tests/work-note-workflow.integration.mjs`,
and `tests/auth-security.*` as reference patterns; add Knowledge-specific tests.
Cover unauthorized reads/writes/downloads, wrong-owner targets, malicious Markdown
and URLs, invalid/oversized uploads, orphan cleanup, phone layouts, unsaved draft
warnings, and an isolated full database-and-files restore. Existing task/project
note and attachment regression tests must continue to pass.

Explicitly defer graph visualization, plugins, AI, OCR, collaboration, public
sharing, live Obsidian sync, offline editing, and automatic task-to-article
conversion. A graph could become an optional view of real article links later;
it should not delay a useful searchable reference library.

## 11. Scope of the original planning review

This proposal is based on reading the actual schema, dependencies, authentication,
navigation, task-detail loader, notes/attachments services and UI, settings/view
state providers, service worker, production Compose, backup scripts, and existing
work-management documentation/test structure. No runtime tests, database changes,
deployments, package installations, or implementation were performed for this
planning task.
