# Knowledge module

Knowledge is the dashboard's private reference library. Open **Knowledge** in the
sidebar to write troubleshooting guides, procedures, or reference articles.
Articles are independent of task/project notes and remain available after their
related work is completed or archived.

## Using the library

- Create an article, choose its type, and optionally start from its template.
  Write Markdown, then use Preview or Split to check the result. Save explicitly.
  Formatting inserts only Markdown markers, with the cursor ready for your text.
- Search by title, text, tags, or an exact error message. Search & filters holds
  type/tag/archive filters, Clear filters, and Export all. Pinned articles appear
  first within the relevant search ranking.
- Insert article link in the editor chooses a stable article ID. Renaming a title
  does not break existing links. The reader shows outgoing links and backlinks.
- Tasks and projects have a Documentation section for linking or creating
  articles. New articles from tasks can include explicitly selected note excerpts.
  Excerpts are independent text, not synchronized copies of notes.
- Projects show direct article links and a deduplicated From project tasks view.
  Moving a task changes the indirect view, not explicit project links.
- Create linked task on an article opens the existing task form. Its save creates
  the task and documentation link atomically. Plan its deadline, focus, follow-up,
  or work sessions using the usual task controls.
- Insert image in the editor uploads a private image and inserts it into the
  article immediately, including before its first save. Supporting files remain
  separate in Attachments, where PDFs and other uploaded originals can be viewed
  or saved without navigating away from the PWA.
- Revision history previews old content. Restoring creates a new revision and
  rebuilds tags/backlinks. It does not undo work links or restore deleted files.
- Archive keeps IDs, links, content, revisions, and files. There is no permanent
  article deletion action. Archived articles remain reachable through their links.

## Implementation map

| Area | Location |
| --- | --- |
| Protected pages | `src/app/knowledge` |
| Owner-authorized APIs | `src/app/api/knowledge` |
| Article data, search, validation, Markdown parsing, export | `src/lib/knowledge` |
| Home, editor, renderer, files, linking, history | `src/components/knowledge` |
| Compact initial task projection | `src/lib/work-management/task-details.ts` |
| Shared private attachment operations | `src/lib/work-management/supporting.ts` |
| Shared private file validation/storage | `src/lib/documents/private-files.ts`, `src/lib/work-management/files.ts` |
| Schema and additive migration | `prisma/schema.prisma`, `prisma/migrations/20261123150000_knowledge_base` |

Articles and revisions store Markdown in PostgreSQL. Tag, article-to-article,
task, and project associations have real foreign keys with ownership enforced.
WorkAttachment has an optional article parent; a database constraint enforces
exactly one task/project/article parent. The existing project-ownership trigger
is retained, and an additional attachment trigger validates task/article owners.

All APIs, including search, history, exports, and files, check `requireOwner`
before reading input or querying records. Ownership follows the existing GitHub
owner policy and permanent database user mapping. Do not add client-supplied
owner IDs. Responses use no-store; the push service worker does not cache them.
Markdown is parsed with markdown-it and rendered as constrained React elements,
without raw HTML or arbitrary remote images. Code examples are never executed.
ZIP export uses fflate; both libraries are installed through package-lock.json.

Saves use the existing owner transaction lock, idempotency receipts, and revision
checks. A conflict preserves the local draft and offers the latest saved content
for comparison. Browser Back cannot reliably be cancelled by the App Router;
drafts are retained in memory for the same editor during internal navigation.
Reload/closing the page and ordinary navigation links have unsaved-change guards.
Drafts are not an offline storage or browser-restart recovery mechanism.

Article attachments share the current work file store and its cleanup/retry
mechanism. File mutations also create article revisions; a stale text editor
must reload before saving after an attachment change. Removing a file makes old
inline image references unavailable; restoring text does not recreate its bytes.

## Deployment and recovery

No extra container, environment variable, or volume is required. Normal image
builds install the locked dependencies. Startup applies the additive migration
with the existing `prisma migrate deploy` command. Rebuild/restart development
containers when changing dependencies or the generated Prisma client. Never use
Prisma reset against an existing dashboard database.

The existing whole-database backup includes all Knowledge tables. Original
article files live in the existing `work_files` production volume alongside task
and project files. **A database-only dump does not contain those original files.**
Use the database-and-documents workflow in `scripts/finance-backup.mjs` for a
complete recovery copy; despite its historical filename, its full snapshot
includes all dashboard tables and active work attachments, including articles.
Keep the same encryption, off-host retention, and isolated verification practices
as other dashboard backups. See `FINANCE_MAINTENANCE.md` and `deployment.md`.

Markdown ZIP export contains current content, attachments, and a manifest of IDs,
original filenames, hashes, and related task/project IDs. Internal article and
image links are rewritten to exported filenames when included. Code examples
are preserved. Individual-article exports leave links to articles outside the
export as dashboard links. ZIP exports are portable reading copies, not a full
backup: use the database/files backup to recover revision and work audit history.
Exports are bounded to 1,000 articles / 100 MB of article text and original files;
export individual articles if the library exceeds that limit.

## Verification

Use the existing isolated Compose project from work-management operations.
Never run opt-in tests against the working or production database.

```sh
node --test tests/*.test.mjs
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npx eslint src scripts tests
RUN_KNOWLEDGE_DB_TEST=1 node --test tests/knowledge.integration.mjs
RUN_KNOWLEDGE_BROWSER_TEST=1 node --test tests/knowledge.browser.mjs
```

Database tests require `WORK_MANAGEMENT_DISPOSABLE=1` and a `work-db` database
host. Browser tests target the disposable port-3002 app and its test-only secret.
They cover article authoring, selected notes, task integration, files, exports,
revisions, owner/anonymous/CSRF checks, phone and wide desktop layouts, and draft
protection. Database checks cover retry safety, concurrent conflicts, owner FKs,
search, stable backlinks, restoration, project membership, and file integrity.
Continue running the existing work note, support/file, and task-loading tests.

## Deliberate limits

This module is a searchable reference library, not a live Obsidian vault. It has
no plugins, graph view, collaboration, public sharing, AI, OCR, or offline edits.
Search currently uses parameterized title/body/tag substring and PostgreSQL
full-text expressions, with bounded result pages. For a substantially larger
library, profile representative searches before adding a stored search vector
and GIN index. No separate search service is needed for the current design.

Physical iPhone PWA share-sheet behavior should still be checked on the actual
device; automated browser tests cannot reproduce every iOS interaction.

## Implementation verification (November 23, 2026)

- The migration was rehearsed against an isolated restore of the development
  database. Every pre-existing application table retained its row count and
  checksum (ignoring only the new null article-parent attachment column).
- A complete disposable backup restored successfully into a separate,
  network-isolated PostgreSQL container: 63 dashboard tables and four private
  work originals matched, including Knowledge attachments.
- The migration was then applied to development, after taking a private backup.
  The initial implementation did not seed examples into development or production.
- Production dependency audit reported existing advisories in Prisma/effect;
  neither new runtime library appeared in the advisory list. Review a supported
  Prisma/dependency update separately rather than using a forced major upgrade
  as part of the Knowledge feature.

## Optional development examples

To create or safely resume the seven fictional example articles:

```sh
docker compose -f docker-compose.dev.yml exec -T -e ALLOW_KNOWLEDGE_EXAMPLES=1 dashboard npm run seed:knowledge-examples
```

Run this only in development. The script refuses a non-development environment
and requires the explicit flag. Stable mutation keys prevent duplicates on a
retry or rerun, and preserve any subsequent manual edits to examples. Startup
never runs it automatically. Do not change the version-1 payloads in this script
in place: add separately keyed examples if extending the set later.

Search for `knowledge-demo` or open the pinned **[Example] Start here — IT
knowledge library** article. The examples include two standalone articles, an
article with only article links, task-linked and project-linked articles, and
one archived article. A dedicated example project and two example tasks provide
work associations without modifying real work records. All example names start
with `[Example]`. The archived example appears in the Archived filter and remains
reachable from the pinned starting page.

## Folders and editor formatting

Knowledge now supports folders and subfolders, with one optional folder assignment
per article. Article type and tags remain independent. Existing articles start
in **Unfiled**; the folder migration does not move or rewrite them.

On desktop, browse the collapsible tree beside the article list. On phones, use
**Folders** to open the same navigation in a centered panel. Folder breadcrumbs
and subfolder tiles let you move through the hierarchy without searching.
All articles, Pinned, Recently updated, Unfiled, and Archived remain available.
Folder selection, tree expansion, and search filters persist across internal
navigation. A nonempty search searches the whole library by default; select
**Search only this folder and its subfolders** to narrow it.

Use New folder to create a top-level folder or a child of the selected folder.
Manage folder changes its name, parent, icon, color, and archive state. Folder
names are unique within a parent (case insensitive); nesting is limited to 12
levels, and moves into a folder's own subtree are rejected. Owner foreign keys
and a database trigger also prevent cross-owner parents and hierarchy cycles.
Use the article editor's Folder selector to move an article or return it to
Unfiled. Article IDs, backlinks, task/project associations, files, and revisions
are preserved when articles or folders move.

Archiving a folder hides its entire branch from active article browsing, without
changing individual article archive flags. Restoring a parent restores visibility
of its branch, except for subfolders or articles archived independently. There is
no permanent folder-delete action. Existing links continue to open articles in
archived folders. A content revision restore keeps the article's current folder.
ZIP manifests include folder metadata and each article's folder ID and path.

The editor's formatting tools preserve Split mode. They wrap selected text when
available and place the cursor at the end of the editable text, before closing
Markdown markers or the terminating newline. In Preview mode, formatting opens
Write mode so the cursor has an editable target.

Additional code: `src/lib/knowledge/folder-tree.ts`, `folders.ts`,
`editor-format.ts`, `src/components/knowledge/Folders.tsx`, and owner-protected
`/api/knowledge/folders` endpoints. The additive migration is
`20261123170000_knowledge_folders`. No new service or private-file volume is used.

Run the opt-in `tests/knowledge-folders.integration.mjs` with
`RUN_KNOWLEDGE_FOLDERS_DB_TEST=1`, and `tests/knowledge-folders.browser.mjs` with
`RUN_KNOWLEDGE_FOLDERS_BROWSER_TEST=1`, against the existing disposable setup.

## Custom templates, creation links, and inline images

Open **Templates** from Knowledge to create, edit, archive, or restore your own
Markdown layouts. In the article editor, **Templates** lets you choose a built-in
or custom layout, insert it at the cursor, or explicitly replace the current
text. You can also save the current article text as a custom template without
leaving the editor. Applying a template copies its text; later template edits do
not change articles that used it. Template type is organizational metadata;
applying text does not silently change the article's classification.

Heading, Bold, Code, and Bullet list insert only their Markdown markers, without
sample words. Selected text is wrapped when present. The cursor stays inside
closing formatting markers, and Split mode remains active. Bullet lists display
only a bullet; legacy checklist markers are rendered as plain list text without
checkboxes. Existing saved Markdown is preserved.

During article creation, **Link task or project** selects existing work records.
The choices remain local until Save article. Creating the article, its backlinks,
work associations, revision, and uploaded-image ownership happen in one database
transaction. Source-task/project capture links still preselect their source.
Editing an existing article's work associations remains available in its reader's
Related work section.

**Insert image** accepts validated JPEG, PNG, WebP, and single-frame GIF files up
to 15 MB. It uploads and inserts Markdown at the cursor, immediately previewable
in Preview/Split. The image picker also reuses existing images from the article.
Inline images do not appear in the Attachments list. Original attachments and
legacy attachment image URLs remain readable. PDFs continue to use Attachments.
The editor checks article revisions during image mutations and updates its own
expected version only after a successful upload/removal; another editor's changes
cannot be overwritten by refreshing the version implicitly.

New article images are staged under an owner-scoped `KnowledgeDraft` and
`WorkAttachment.inlineImage`, in the existing private work-file volume. Stable
`/api/knowledge/images/:id/file` URLs survive the first article save. No empty
article or task/project links are published merely by uploading an image. On
confirmed discard, unsaved originals are removed. Closing the browser cannot
guarantee an immediate cleanup request: unused uploads expire after 24 hours of
inactivity and are reclaimed in bounded batches when a later image draft is
created. Saved article images are excluded from this cleanup. A failed filesystem
cleanup retains its pending keys for a later retry.

Each article/draft accepts up to 30 inline originals and 100 MB total. Up to 20
active image drafts are allowed. If an unsaved image set expires, use the image
picker's recovery action and reinsert the images after removing their old lines.
Removing image Markdown alone preserves its original so it can be reinserted and
historic revisions can still display it. To remove an original, first remove its
Markdown from the editor, then use Remove original in the image picker. That
explicit deletion also affects historic versions. Templates can reuse already
saved private images; save an article before making a template containing its
new unsaved image references.

Custom template definitions and image-draft metadata are additive database tables.
The whole database/documents backup includes them and all original images through
the existing work attachment inventory. Markdown ZIP exports include inline
originals and rewrite their stable image URLs to portable filenames. No extra
container, public upload folder, or offline cache is introduced.

Migration: `20261123190000_knowledge_authoring`. Tests:
`RUN_KNOWLEDGE_AUTHORING_DB_TEST=1 node --test tests/knowledge-authoring.integration.mjs`
and `RUN_KNOWLEDGE_AUTHORING_BROWSER_TEST=1 node --test tests/knowledge-authoring.browser.mjs`
on the existing disposable database and port-3002 app.
